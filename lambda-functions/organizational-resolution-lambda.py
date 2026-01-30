import os
import json
import tempfile
import boto3
from docx import Document
import re
import base64
from copy import deepcopy

# Constants
TEMPLATE_BUCKET = os.environ.get('TEMPLATE_BUCKET', 'company-formation-template-llc-and-inc')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')
BUCKET_NAME = os.environ.get('BUCKET_NAME', TEMPLATE_BUCKET)

# Initialize S3 client
s3_client = boto3.client('s3', region_name='us-west-1')

def download_from_s3(bucket, key, local_path):
    """Download file from S3 to local path"""
    print(f"===> Downloading s3://{bucket}/{key} to {local_path}")
    s3_client.download_file(bucket, key, local_path)
    print(f"===> Downloaded successfully")

def upload_to_s3(local_path, bucket, key):
    """Upload file from local path to S3"""
    print(f"===> Uploading {local_path} to s3://{bucket}/{key}")
    s3_client.upload_file(local_path, bucket, key)
    print(f"===> Uploaded successfully")

def extract_s3_info(url):
    """Extract bucket and key from S3 URL"""
    if not url:
        return None, None
    
    if url.startswith('s3://'):
        parts = url[5:].split('/', 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return parts[0], ''
    
    if url.startswith('https://'):
        match = re.match(r'https://([^.]+)\.s3[^/]*\.amazonaws\.com/(.+)', url)
        if match:
            return match.group(1), match.group(2)
        
        match = re.match(r'https://s3[^/]*\.amazonaws\.com/([^/]+)/(.+)', url)
        if match:
            return match.group(1), match.group(2)
    
    return None, None

def format_address(address_str):
    """Format address string, handling None and empty values"""
    if not address_str or address_str.strip() == '':
        return ''
    return address_str.strip()

def format_percentage(value):
    """Format ownership percentage - pixel perfect formatting (no trailing zeros)"""
    if value is None:
        return "0%"
    
    if isinstance(value, (int, float)):
        num = float(value)
    elif isinstance(value, str):
        try:
            num = float(value.replace(',', '.'))
        except:
            return "0%"
    else:
        return "0%"
    
    if 0 <= num <= 1:
        num = num * 100
    
    if num == int(num):
        return f"{int(num)}%"
    else:
        formatted = f"{num:.10f}".rstrip('0').rstrip('.')
        return f"{formatted}%"

def replace_placeholders(doc, data):
    """Replace placeholders in Organizational Resolution document"""
    print("===> Replacing placeholders in document...")

    # Company information
    company_name = data.get('companyName', '')
    company_address = format_address(data.get('companyAddress', ''))
    formation_state = data.get('formationState', '')
    formation_date = data.get('formationDate', '')

    # Members / managers
    members = data.get('members', []) or []
    managers = data.get('managers', []) or []
    print(f"===> Found {len(members)} members and {len(managers)} managers in form data")

    # Determine managed type:
    # - If ALL members are also ALL managers (same set), it's "member-managed"
    # - Otherwise, it's "manager-managed"
    if len(managers) == 0:
        managed_type = "member"
    elif len(members) == len(managers) and len(members) > 0:
        # Check if all members are also managers (same set)
        member_names = set(m.get('name', '').strip().lower() for m in members if m.get('name'))
        manager_names = set(m.get('name', '').strip().lower() for m in managers if m.get('name'))
        if member_names == manager_names and len(member_names) > 0:
            managed_type = "member"
        else:
            managed_type = "manager"
    else:
        managed_type = "manager"

    replacements = []
    pct_placeholders = []

    def add_placeholder(placeholder: str, value: str, bold: bool = False):
        replacements.append((placeholder, value or '', bold))

    # Generic placeholders
    add_placeholder('{{COMPANY_NAME}}', company_name, True)
    add_placeholder('{{COMPANY_ADDRESS}}', company_address)
    add_placeholder('{{FORMATION_STATE}}', formation_state)
    add_placeholder('{{FORMATION_DATE}}', formation_date)

    # Legacy LLC-specific placeholders
    add_placeholder('{{llc_name_text}}', company_name, True)
    add_placeholder('{{full_llc_address}}', company_address)
    add_placeholder('{{full_state}}', formation_state)
    add_placeholder('{{full_state_caps}}', formation_state.upper() if formation_state else '')
    add_placeholder('{{Date_of_formation_LLC}}', formation_date)

    # Managed type placeholders
    add_placeholder('{{managed_type}}', managed_type)
    add_placeholder('{{MANAGED_TYPE}}', managed_type.upper())

    # Member placeholders: {{member_01_full_name}}, {{member_01_pct}}, etc.
    for idx, member in enumerate(members, start=1):
        num2 = f"{idx:02d}"
        member_name = member.get('name', '')
        for ph in (
            '{{' + f'member_{num2}_full_name' + '}}',
            '{{' + f'member_{idx}_full_name' + '}}',
            '{{' + f'Member_{num2}_full_name' + '}}',
            '{{' + f'Member_{idx}_full_name' + '}}',
        ):
            add_placeholder(ph, member_name, True)

        ownership_pct = member.get('ownershipPercent', 0)
        if ownership_pct is None:
            ownership_pct = 0
        print(f"===> Member {idx} ownership: {ownership_pct} (raw), will format to: {format_percentage(ownership_pct)}")
        pct_str = format_percentage(ownership_pct)
        pct_str_no_percent = pct_str.rstrip('%')
        for ph in (
            '{{' + f'member_{num2}_pct' + '}}',
            '{{' + f'member_{idx}_pct' + '}}',
            '{{' + f'Member_{num2}_pct' + '}}',
            '{{' + f'Member_{idx}_pct' + '}}',
        ):
            pct_placeholders.append((ph, pct_str, pct_str_no_percent))

    # Manager placeholders: {{manager_01_full_name}}, {{Manager_1}}, etc.
    for idx, manager in enumerate(managers, start=1):
        num2 = f"{idx:02d}"
        manager_name = manager.get('name', '')
        for ph in (
            '{{' + f'manager_{num2}_full_name' + '}}',
            '{{' + f'manager_{idx}_full_name' + '}}',
            '{{' + f'Manager_{num2}_full_name' + '}}',
            '{{' + f'Manager_{idx}_full_name' + '}}',
            '{{' + f'Manager_{num2}' + '}}',
            '{{' + f'Manager_{idx}' + '}}',
        ):
            add_placeholder(ph, manager_name, True)

    def insert_run_after(paragraph, run, text):
        new_run = paragraph.add_run(text)
        run._element.addnext(new_run._element)
        return new_run

    def apply_run_format(source_run, target_run, bold_override=None):
        if source_run._element.rPr is not None:
            target_run._element.insert(0, deepcopy(source_run._element.rPr))
        if bold_override is not None:
            target_run.bold = bold_override

    def replace_span_in_paragraph(paragraph, start, end, value, bold_value=False):
        pos = 0
        run_start_idx = None
        run_end_idx = None
        run_start_offset = 0
        run_end_offset = 0

        for i, run in enumerate(paragraph.runs):
            run_len = len(run.text)
            if run_start_idx is None and pos + run_len > start:
                run_start_idx = i
                run_start_offset = start - pos
            if run_start_idx is not None and pos + run_len >= end:
                run_end_idx = i
                run_end_offset = end - pos
                break
            pos += run_len

        if run_start_idx is None or run_end_idx is None:
            return False

        if not bold_value:
            if run_start_idx == run_end_idx:
                run = paragraph.runs[run_start_idx]
                run.text = run.text[:run_start_offset] + value + run.text[run_end_offset:]
            else:
                start_run = paragraph.runs[run_start_idx]
                end_run = paragraph.runs[run_end_idx]
                start_run.text = start_run.text[:run_start_offset] + value
                for i in range(run_start_idx + 1, run_end_idx):
                    paragraph.runs[i].text = ''
                end_run.text = end_run.text[run_end_offset:]
            return True

        # Bold only the placeholder value (not the whole run)
        if run_start_idx == run_end_idx:
            run = paragraph.runs[run_start_idx]
            prefix = run.text[:run_start_offset]
            suffix = run.text[run_end_offset:]

            if prefix:
                run.text = prefix
                run.bold = False
                value_run = insert_run_after(paragraph, run, value)
                apply_run_format(run, value_run, True)
            else:
                run.text = value
                run.bold = True
                value_run = run

            if suffix:
                suffix_run = insert_run_after(paragraph, value_run, suffix)
                apply_run_format(run, suffix_run, False)
        else:
            start_run = paragraph.runs[run_start_idx]
            end_run = paragraph.runs[run_end_idx]
            prefix = start_run.text[:run_start_offset]
            suffix = end_run.text[run_end_offset:]

            for i in range(run_start_idx + 1, run_end_idx):
                paragraph.runs[i].text = ''

            if prefix:
                start_run.text = prefix
                start_run.bold = False
                value_run = insert_run_after(paragraph, start_run, value)
                apply_run_format(start_run, value_run, True)
            else:
                start_run.text = value
                start_run.bold = True
                value_run = start_run

            if suffix:
                end_run.text = suffix
                end_run.bold = False
            else:
                end_run.text = ''

        return True

    def replace_placeholder_in_paragraph(paragraph, placeholder, value, bold_value=False):
        if placeholder not in paragraph.text:
            return
        full_text = ''.join(run.text for run in paragraph.runs)
        search_start = 0
        while True:
            idx = full_text.find(placeholder, search_start)
            if idx == -1:
                break
            end = idx + len(placeholder)
            if not replace_span_in_paragraph(paragraph, idx, end, value, bold_value):
                break
            full_text = ''.join(run.text for run in paragraph.runs)
            search_start = idx + len(value)

    def replace_pct_placeholder_in_paragraph(paragraph, placeholder, pct_with_percent, pct_without_percent):
        if placeholder not in paragraph.text:
            return
        full_text = ''.join(run.text for run in paragraph.runs)
        search_start = 0
        while True:
            idx = full_text.find(placeholder, search_start)
            if idx == -1:
                break
            end = idx + len(placeholder)
            has_percent = end < len(full_text) and full_text[end] == '%'
            value = pct_without_percent if has_percent else pct_with_percent
            if not replace_span_in_paragraph(paragraph, idx, end, value):
                break
            full_text = ''.join(run.text for run in paragraph.runs)
            search_start = idx + len(value)

    def normalize_bold_for_name_paragraph(paragraph):
        text = paragraph.text
        if not text:
            return
        lower = text.lower()
        has_company = '{{COMPANY_NAME}}' in text or '{{llc_name_text}}' in text
        has_member = '{{member' in lower
        has_manager = '{{manager' in lower
        if not (has_company or has_member or has_manager):
            return
        # Only placeholders + "RESOLVED," should be bold; reset others in this paragraph
        for run in paragraph.runs:
            run.bold = False
        for run in paragraph.runs:
            if 'RESOLVED,' in run.text:
                run.bold = True

    def replace_all_in_paragraph(paragraph):
        if '{{' not in paragraph.text:
            return
        normalize_bold_for_name_paragraph(paragraph)
        for placeholder, value, bold_value in replacements:
            replace_placeholder_in_paragraph(paragraph, placeholder, value, bold_value)
        for placeholder, pct_str, pct_str_no_percent in pct_placeholders:
            replace_pct_placeholder_in_paragraph(paragraph, placeholder, pct_str, pct_str_no_percent)

    # Replace in paragraphs (preserve formatting by editing runs in place)
    for paragraph in doc.paragraphs:
        replace_all_in_paragraph(paragraph)

    # Replace in tables (cell paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    replace_all_in_paragraph(paragraph)
    
    print("===> Placeholders replaced successfully")

def lambda_handler(event, context):
    print("===> RAW EVENT:")
    print(json.dumps(event))
    
    try:
        # Parse request body
        if "body" in event:
            body = json.loads(event["body"])
        else:
            body = event
        
        form_data = body.get("form_data")
        s3_bucket = body.get("s3_bucket")
        s3_key = body.get("s3_key")
        templateUrl = body.get("templateUrl")
        return_docx = body.get("return_docx", False)
        
        if not form_data:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'form_data'"})
            }
        
        if not s3_bucket or not s3_key:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 's3_bucket' or 's3_key'"})
            }
        
        if not templateUrl:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Missing 'templateUrl'"})
            }
        
        # Extract template bucket and key from URL
        template_bucket, template_key = extract_s3_info(templateUrl)
        if not template_bucket or not template_key:
            template_bucket = TEMPLATE_BUCKET
            template_key = 'llc-formation-templates/organizational-resolution-all-templates/Template Organization Resolution_1 Member/Template Organization Resolution_1 Member_1 Manager.docx'
            print(f"===> Could not parse templateUrl, using default: s3://{template_bucket}/{template_key}")
        else:
            print(f"===> Template: s3://{template_bucket}/{template_key}")
        
        print(f"===> Output: s3://{s3_bucket}/{s3_key}")
        
    except Exception as e:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid input payload", "details": str(e)})
        }
    
    # Prepare file paths
    tmpdir = tempfile.gettempdir()
    template_path = os.path.join(tmpdir, "template_org_resolution.docx")
    output_path = os.path.join(tmpdir, "filled_org_resolution.docx")
    
    try:
        # Download template from S3
        download_from_s3(template_bucket, template_key, template_path)
        
        # Load Word document
        print("===> Loading Word document...")
        doc = Document(template_path)
        
        # Replace placeholders with form data
        replace_placeholders(doc, form_data)
        
        # Save filled document
        print("===> Saving filled document...")
        doc.save(output_path)
        print(f"===> Saved to {output_path}")
        
        # Upload to S3
        upload_to_s3(output_path, s3_bucket, s3_key)
        
        # Return response
        if return_docx:
            with open(output_path, 'rb') as f:
                docx_content = f.read()
            
            encoded = base64.b64encode(docx_content).decode('utf-8')
            
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "Content-Disposition": f'attachment; filename="{os.path.basename(s3_key)}"'
                },
                "body": encoded,
                "isBase64Encoded": True
            }
        else:
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "message": "✅ Document uploaded to S3",
                    "s3_bucket": s3_bucket,
                    "s3_key": s3_key,
                    "s3_url": f"s3://{s3_bucket}/{s3_key}"
                })
            }
    
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback.print_exc()
        print(f"===> ERROR: {error_msg}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Failed to generate organizational resolution",
                "details": error_msg
            })
        }
