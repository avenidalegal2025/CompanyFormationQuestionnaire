import os
import json
import tempfile
import boto3
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
import re
import base64

# Constants
# Template bucket (where templates are stored)
TEMPLATE_BUCKET = os.environ.get('TEMPLATE_BUCKET', 'company-formation-template-llc-and-inc')
# Output bucket (where filled documents are saved)
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')
# Legacy support - use template bucket as fallback
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
    """
    Extract bucket and key from S3 URL
    Supports formats:
    - https://bucket.s3.region.amazonaws.com/key
    - s3://bucket/key
    """
    if not url:
        return None, None
    
    # Handle s3:// URLs
    if url.startswith('s3://'):
        parts = url[5:].split('/', 1)
        if len(parts) == 2:
            return parts[0], parts[1]
        return parts[0], ''
    
    # Handle https:// URLs
    if url.startswith('https://'):
        # Pattern: https://bucket.s3.region.amazonaws.com/key
        match = re.match(r'https://([^.]+)\.s3[^/]*\.amazonaws\.com/(.+)', url)
        if match:
            return match.group(1), match.group(2)
        
        # Pattern: https://s3.region.amazonaws.com/bucket/key
        match = re.match(r'https://s3[^/]*\.amazonaws\.com/([^/]+)/(.+)', url)
        if match:
            return match.group(1), match.group(2)
    
    return None, None

def format_percentage(value):
    """Format ownership percentage - pixel perfect formatting (no trailing zeros)"""
    if value is None:
        return "0%"
    
    # Convert to float
    if isinstance(value, (int, float)):
        num = float(value)
    elif isinstance(value, str):
        try:
            # Handle comma as decimal separator (e.g., "50,1" -> 50.1)
            num = float(value.replace(',', '.'))
        except:
            return "0%"
    else:
        return "0%"
    
    # If value is between 0 and 1, multiply by 100 (Airtable stores as decimal)
    if 0 <= num <= 1:
        num = num * 100
    
    # Format without trailing zeros - pixel perfect
    # Remove trailing zeros and decimal point if not needed
    if num == int(num):
        # Whole number: "50%" not "50.00%"
        return f"{int(num)}%"
    else:
        # Has decimals: remove trailing zeros
        # "50.1%" not "50.10%", "50.25%" not "50.250%"
        formatted = f"{num:.10f}".rstrip('0').rstrip('.')
        return f"{formatted}%"

def format_address(address_str):
    """Format address string, handling None and empty values"""
    if not address_str or address_str.strip() == '':
        return ''
    return address_str.strip()

def replace_placeholders(doc, data):
    """
    Replace placeholders in Word document with actual data.
    Supports two styles of templates:
      1) Generic placeholders: {{COMPANY_NAME}}, {{COMPANY_ADDRESS}}, {{FORMATION_STATE}}, {{FORMATION_DATE}}
      2) Legacy membership templates with placeholders like:
         {{llc_name_text}}, {{full_llc_address}}, {{full_state}}, {{full_state_caps}},
         {{Date_of_formation_LLC}}, {{member_01_full_name}}, {{member_01_pct}}, {{manager_01_full_name}}, etc.
    """
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
        
        # Member placeholders: {{member_01_full_name}}, {{member_01_pct}}, etc.
        for idx, member in enumerate(members, start=1):
            num2 = f"{idx:02d}"
            # Names
            for ph in (f'{{{{member_{num2}_full_name}}}}', f'{{{{member_{idx}_full_name}}}}'):
                if ph in text:
                    text = text.replace(ph, member.get('name', ''))
            # Ownership percent
            pct_val = member.get('ownershipPercent', 0) or 0
            try:
                pct_num = float(pct_val)
                if 0 < pct_num <= 1:
                    pct_num = pct_num * 100.0
            except Exception:
                pct_num = 0
            pct_str = f"{pct_num:.2f}".rstrip('0').rstrip('.') if pct_num else "0"
            for ph in (f'{{{{member_{num2}_pct}}}}', f'{{{{member_{idx}_pct}}}}'):
                if ph in text:
                    text = text.replace(ph, pct_str)
        
        # Manager placeholders: {{manager_01_full_name}}, etc.
        for idx, manager in enumerate(managers, start=1):
            num2 = f"{idx:02d}"
            for ph in (f'{{{{manager_{num2}_full_name}}}}', f'{{{{manager_{idx}_full_name}}}}'):
                if ph in text:
                    text = text.replace(ph, manager.get('name', ''))
        
        return text
    
    # First pass: replace in paragraphs
    for paragraph in doc.paragraphs:
        original = paragraph.text
        new_text = replace_in_text(original)
        if new_text != original:
            paragraph.text = new_text
    
    # Second pass: replace in tables (cell paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    original = paragraph.text
                    new_text = replace_in_text(original)
                    if new_text != original:
                        paragraph.text = new_text
    
    # Existing table-based logic for templates that use dynamic rows
    print("===> Applying table-based member/manager filling logic (if applicable)")
    print(f"===> Searching tables for header-based member/manager layouts")
    
    # Find tables with member and manager information
    # Typically, membership registry has tables with columns: Name, Address, Ownership %
    for table in doc.tables:
        # Check if this is the members table (usually has headers like "Name", "Address", "Ownership")
        is_member_table = False
        if len(table.rows) > 0:
            header_row = table.rows[0]
            header_text = ' '.join([cell.text.strip().lower() for cell in header_row.cells])
            if 'name' in header_text and ('address' in header_text or 'ownership' in header_text):
                is_member_table = True
        
        if is_member_table:
            print(f"===> Found member table with {len(table.rows)} rows")
            
            # Map column headers to indices
            header_row = table.rows[0]
            column_map = {}
            for idx, cell in enumerate(header_row.cells):
                header_text = cell.text.strip().lower()
                if 'member' in header_text and 'name' in header_text:
                    column_map['name'] = idx
                elif 'date' in header_text and 'acquired' in header_text:
                    column_map['date'] = idx
                elif 'address' in header_text:
                    column_map['address'] = idx
                elif 'ownership' in header_text and 'percent' in header_text:
                    column_map['ownership'] = idx
                elif 'percentage' in header_text and 'ownership' in header_text:
                    column_map['ownership'] = idx
                elif 'transaction' in header_text:
                    column_map['transaction'] = idx
                elif 'ssn' in header_text or 'social' in header_text:
                    column_map['ssn'] = idx
            
            print(f"===> Column mapping: {column_map}")
            
            # Add member rows
            for i, member in enumerate(members):
                # Add a new row if needed
                if i + 1 >= len(table.rows):
                    table.add_row()
                
                row = table.rows[i + 1]  # Skip header row (index 0)
                
                # Fill member data based on column mapping
                if 'name' in column_map and len(row.cells) > column_map['name']:
                    row.cells[column_map['name']].text = member.get('name', '')
                
                if 'address' in column_map and len(row.cells) > column_map['address']:
                    row.cells[column_map['address']].text = format_address(member.get('address', ''))
                
                if 'ownership' in column_map and len(row.cells) > column_map['ownership']:
                    row.cells[column_map['ownership']].text = format_percentage(member.get('ownershipPercent', 0))
                
                if 'transaction' in column_map and len(row.cells) > column_map['transaction']:
                    # Transaction column: If it's the only percentage column, use it for ownership %
                    # Otherwise, if ownership column exists, keep "Allotted" text (it's correct, just needs alignment)
                    if 'ownership' not in column_map:
                        # Use transaction column for ownership percentage
                        row.cells[column_map['transaction']].text = format_percentage(member.get('ownershipPercent', 0))
                    # If ownership column exists, leave transaction column as-is (keep "Allotted")
                
                if 'date' in column_map and len(row.cells) > column_map['date']:
                    # Use formation date for "Date Acquired"
                    formation_date = data.get('formationDate', '')
                    row.cells[column_map['date']].text = formation_date
                
                if 'ssn' in column_map and len(row.cells) > column_map['ssn']:
                    ssn = member.get('ssn', '')
                    if ssn and ssn.upper() not in ['N/A', 'N/A-FOREIGN', '']:
                        row.cells[column_map['ssn']].text = ssn
                    else:
                        row.cells[column_map['ssn']].text = 'N/A'
            
            # Remove extra rows if we have fewer members than rows
            while len(table.rows) > len(members) + 1:  # +1 for header
                table._element.remove(table.rows[-1]._element)
            
            # Now handle manager table (if exists)
            # Look for a table with "Manager" in header
            for table in doc.tables:
                if len(table.rows) > 0:
                    header_row = table.rows[0]
                    header_text = ' '.join([cell.text.strip().lower() for cell in header_row.cells])
                    if 'manager' in header_text and 'name' in header_text:
                        print(f"===> Found manager table with {len(table.rows)} rows")
                        # Add manager rows
                        for i, manager in enumerate(managers):
                            # Add a new row if needed
                            if i + 1 >= len(table.rows):
                                table.add_row()
                            
                            row = table.rows[i + 1]  # Skip header row (index 0)
                            
                            # Fill manager data
                            # Column 0: Manager Name
                            if len(row.cells) > 0:
                                row.cells[0].text = manager.get('name', '')
                            
                            # Column 1: Address
                            if len(row.cells) > 1:
                                row.cells[1].text = format_address(manager.get('address', ''))
                        
                        # Remove extra rows if we have fewer managers than rows
                        while len(table.rows) > len(managers) + 1:  # +1 for header
                            table._element.remove(table.rows[-1]._element)
                        break
            
            break
    
    # Also try replacing placeholders in tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    if '{{COMPANY_NAME}}' in paragraph.text:
                        paragraph.text = paragraph.text.replace('{{COMPANY_NAME}}', company_name)
                    if '{{COMPANY_ADDRESS}}' in paragraph.text:
                        paragraph.text = paragraph.text.replace('{{COMPANY_ADDRESS}}', company_address)
                    if '{{FORMATION_STATE}}' in paragraph.text:
                        paragraph.text = paragraph.text.replace('{{FORMATION_STATE}}', formation_state)
                    if '{{FORMATION_DATE}}' in paragraph.text:
                        paragraph.text = paragraph.text.replace('{{FORMATION_DATE}}', formation_date)
    
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
            # Fallback to template bucket with default path
            template_bucket = TEMPLATE_BUCKET
            template_key = 'llc-formation-templates/membership-registry-all-templates/membership-registry-1-member/Template Membership Registry_1 Members_1 Manager.docx'
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
    template_path = os.path.join(tmpdir, "template_membership_registry.docx")
    output_path = os.path.join(tmpdir, "filled_membership_registry.docx")
    
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
            # Read file and return as base64-encoded binary (required by Lambda proxy)
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
                "error": "Failed to generate membership registry",
                "details": error_msg
            })
        }
