import os
import json
import tempfile
import boto3
from docx import Document
import re
import base64

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
    
    # Determine managed type: "member" if no managers, "manager" if managers exist
    managed_type = "manager" if len(managers) > 0 else "member"
    
    # Helper to replace all known placeholders in a text string
    def replace_in_text(text: str) -> str:
        if not text:
            return text
        
        # Generic placeholders
        text = text.replace('{{COMPANY_NAME}}', company_name)
        text = text.replace('{{COMPANY_ADDRESS}}', company_address)
        text = text.replace('{{FORMATION_STATE}}', formation_state)
        text = text.replace('{{FORMATION_DATE}}', formation_date)
        
        # Legacy LLC-specific placeholders
        text = text.replace('{{llc_name_text}}', company_name)
        text = text.replace('{{full_llc_address}}', company_address)
        text = text.replace('{{full_state}}', formation_state)
        text = text.replace('{{full_state_caps}}', formation_state.upper() if formation_state else '')
        text = text.replace('{{Date_of_formation_LLC}}', formation_date)
        
        # Managed type placeholder
        text = text.replace('{{managed_type}}', managed_type)
        text = text.replace('{{MANAGED_TYPE}}', managed_type.upper())
        
        # Member placeholders: {{member_01_full_name}}, {{member_01_pct}}, etc.
        for idx, member in enumerate(members, start=1):
            num2 = f"{idx:02d}"
            member_name = member.get('name', '')
            # Names - handle both {{member_01_full_name}} and {{member_1_full_name}}
            # Use string concatenation to avoid f-string issues with braces
            member_ph1 = '{{' + f'member_{num2}_full_name' + '}}'
            member_ph2 = '{{' + f'member_{idx}_full_name' + '}}'
            member_ph3 = '{{' + f'Member_{num2}_full_name' + '}}'
            member_ph4 = '{{' + f'Member_{idx}_full_name' + '}}'
            for ph in (member_ph1, member_ph2, member_ph3, member_ph4):
                if ph in text:
                    text = text.replace(ph, member_name)
            
            # Ownership percentages - handle both {{member_01_pct}} and {{member_1_pct}}
            ownership_pct = member.get('ownershipPercent', 0) or 0
            pct_str = format_percentage(ownership_pct)
            pct_ph1 = '{{' + f'member_{num2}_pct' + '}}'
            pct_ph2 = '{{' + f'member_{idx}_pct' + '}}'
            pct_ph3 = '{{' + f'Member_{num2}_pct' + '}}'
            pct_ph4 = '{{' + f'Member_{idx}_pct' + '}}'
            for ph in (pct_ph1, pct_ph2, pct_ph3, pct_ph4):
                if ph in text:
                    text = text.replace(ph, pct_str)
        
        # Manager placeholders: {{manager_01_full_name}}, {{Manager_1}}, etc.
        for idx, manager in enumerate(managers, start=1):
            num2 = f"{idx:02d}"
            manager_name = manager.get('name', '')
            # Handle various formats: {{manager_01_full_name}}, {{Manager_1}}, etc.
            # Note: Use string concatenation to avoid f-string issues with braces
            manager_ph1 = '{{' + f'manager_{num2}_full_name' + '}}'
            manager_ph2 = '{{' + f'manager_{idx}_full_name' + '}}'
            manager_ph3 = '{{' + f'Manager_{num2}_full_name' + '}}'
            manager_ph4 = '{{' + f'Manager_{idx}_full_name' + '}}'
            manager_ph5 = '{{' + f'Manager_{num2}' + '}}'
            manager_ph6 = '{{' + f'Manager_{idx}' + '}}'
            for ph in (manager_ph1, manager_ph2, manager_ph3, manager_ph4, manager_ph5, manager_ph6):
                if ph in text:
                    text = text.replace(ph, manager_name)
        
        return text
    
    # Replace in paragraphs
    for paragraph in doc.paragraphs:
        original = paragraph.text
        new_text = replace_in_text(original)
        if new_text != original:
            paragraph.text = new_text
    
    # Replace in tables (cell paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    original = paragraph.text
                    new_text = replace_in_text(original)
                    if new_text != original:
                        paragraph.text = new_text
    
    # Handle ownership table if it exists (Members | Percentage Ownership)
    for table in doc.tables:
        if len(table.rows) > 0:
            header_row = table.rows[0]
            header_text = ' '.join([cell.text.strip().lower() for cell in header_row.cells])
            # Check if this is an ownership table
            if ('member' in header_text or 'ownership' in header_text or 'percentage' in header_text):
                print(f"===> Found ownership table with {len(table.rows)} rows")
                
                # Map column headers to indices
                column_map = {}
                for idx, cell in enumerate(header_row.cells):
                    cell_text = cell.text.strip().lower()
                    if 'member' in cell_text and 'name' in cell_text:
                        column_map['name'] = idx
                    elif 'ownership' in cell_text or 'percentage' in cell_text:
                        column_map['ownership'] = idx
                
                print(f"===> Column mapping: {column_map}")
                
                # Fill member rows
                for i, member in enumerate(members):
                    if i + 1 >= len(table.rows):
                        table.add_row()
                    
                    row = table.rows[i + 1]  # Skip header row
                    
                    # Fill member name
                    if 'name' in column_map and len(row.cells) > column_map['name']:
                        row.cells[column_map['name']].text = member.get('name', '')
                    
                    # Fill ownership percentage
                    if 'ownership' in column_map and len(row.cells) > column_map['ownership']:
                        ownership_pct = member.get('ownershipPercent', 0) or 0
                        row.cells[column_map['ownership']].text = format_percentage(ownership_pct)
                
                # Remove extra rows
                while len(table.rows) > len(members) + 1:
                    table._element.remove(table.rows[-1]._element)
                
                break
    
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
