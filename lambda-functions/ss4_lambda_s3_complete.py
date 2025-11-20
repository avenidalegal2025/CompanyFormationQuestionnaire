import os
import json
import tempfile
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import boto3

# Constants
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'ss4-template-bucket-043206426879')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')

# SS-4 Form Field Coordinates
FIELD_COORDS = {
    "Line 1": (65, 690),      # Legal name of entity
    "Line 2": (65, 700),      # Trade name (if different)
    "Line 3": (315, 700),     # Mailing address line 1
    "Line 4a": (65, 640),     # Mailing address line 2
    "Line 4b": (65, 617),     # City, State, ZIP
    "Line 5a": (305, 640),    # Street address line 1
    "Line 5b": (315, 617),    # Street address line 2
    "Line 6": (65, 594),      # City, State, ZIP (street address)
    "Line 7a": (65, 570),     # Responsible party name
    "Line 7b": (342, 570),    # Responsible party SSN
    "8b": (500, 542),        # Date business started
    "9b": (290, 414),        # Closing month
    "10": (65, 375),         # Highest number of employees
    "11": (115, 317),        # Principal activity
    "12": (485, 327),        # Principal activity code
    "13_Ag": (100, 257),     # Agricultural
    "13_Hh": (180, 257),     # Household
    "13_Ot": (280, 257),     # Other
    "15": (400, 230),        # First date wages paid
    "17": (65, 170),         # Additional information
    "Designee Name": (100, 115),
    "Designee Address": (100, 90),
    "Designee Phone": (450, 112),
    "Designee Fax": (450, 90),
    "Applicant Phone": (450, 65),
    "Applicant Fax": (150, 60),
    "Signature Name": (150, 65)
}

CHECK_COORDS = {
    "8a_yes": [257, 545],
    "8c_yes": [495, 533],
    "9a": [64, 496],
    "10": [63, 388],
    "14": [406, 256],
    "16": [207, 196],
    "18_no": [401, 159]
}

def map_data_to_ss4_fields(form_data):
    """
    Map TypeScript form data format to SS-4 form field format.
    form_data comes from transformDataForSS4 which sends:
    - companyName, companyNameBase, entityType, formationState, businessPurpose
    - companyAddress
    - responsiblePartyName, responsiblePartySSN, responsiblePartyAddress, etc.
    """
    import re
    
    # TypeScript sends flat structure from transformDataForSS4
    company_name = form_data.get("companyName", "")
    company_name_base = form_data.get("companyNameBase", company_name)
    entity_type = form_data.get("entityType", "")
    business_purpose = form_data.get("businessPurpose", "")
    
    # Company address
    company_address = form_data.get("companyAddress", "")
    address_parts = company_address.split(",") if company_address else []
    
    # Responsible party (primary owner)
    responsible_name = form_data.get("responsiblePartyName", "")
    responsible_ssn = form_data.get("responsiblePartySSN", "")
    responsible_address = form_data.get("responsiblePartyAddress", "")
    responsible_city = form_data.get("responsiblePartyCity", "")
    responsible_state = form_data.get("responsiblePartyState", "")
    responsible_zip = form_data.get("responsiblePartyZip", "")
    
    # Build city/state/zip strings
    # Note: TypeScript doesn't send separate city/state/zip for company, it's in companyAddress
    # So we'll parse it from companyAddress or use responsible party's location
    responsible_city_state_zip = f"{responsible_city}, {responsible_state} {responsible_zip}".strip(", ")
    if not responsible_city_state_zip or responsible_city_state_zip == ", ":
        responsible_city_state_zip = form_data.get("responsiblePartyCountry", "USA")
    
    mapped_data = {
        "Line 1": company_name,  # Legal name
        "Line 2": "",  # Trade name (usually same)
        "Line 3": address_parts[0].strip() if address_parts else company_address,  # Mailing address line 1
        "Line 4a": ", ".join([p.strip() for p in address_parts[1:-1]]) if len(address_parts) > 2 else "",  # Mailing address line 2
        "Line 4b": address_parts[-1].strip() if len(address_parts) > 1 else "",  # City, State, ZIP (parsed from address)
        "Line 5a": responsible_address,  # Street address (responsible party)
        "Line 5b": "",
        "Line 6": responsible_city_state_zip,  # City, State, ZIP (responsible party)
        "Line 7a": responsible_name,  # Responsible party name
        "Line 7b": responsible_ssn,  # Responsible party SSN
        "8b": "",  # Date business started (not in form data)
        "9b": "",  # Closing month (not in form data)
        "10": "",  # Highest number of employees (not in form data)
        "11": business_purpose,  # Principal activity
        "12": "",  # Principal activity code (not in form data)
        "13": {
            "Agricultural": "0",
            "Household": "0",
            "Other": "0"
        },
        "15": "",  # First date wages paid (not in form data)
        "17": "",  # Additional information (not in form data)
        "Designee Name": "Avenida Legal",
        "Designee Address": "12550 Biscayne Blvd Ste 110, North Miami, FL 33181",
        "Designee Phone": "(305) 123-4567",
        "Designee Fax": "",
        "Applicant Phone": "",
        "Applicant Fax": "",
        "Signature Name": responsible_name,
        "Checks": {}
    }
    
    # Entity type checkbox
    entity_type_upper = entity_type.upper()
    if "CORP" in entity_type_upper or "INC" in entity_type_upper or "C-CORP" in entity_type_upper:
        mapped_data["9a"] = "Corporation (1120)"
    
    return mapped_data

def create_overlay(data, path):
    """
    Create overlay PDF with form data for SS-4.
    Data should be in SS-4 field format (use map_data_to_ss4_fields first)
    """
    print("===> Creating overlay for SS-4...")
    c = canvas.Canvas(path)
    c.setFont("Helvetica", 9)
    
    # Fill text fields
    for field, coord in FIELD_COORDS.items():
        if field.startswith("13_"):
            key_map = {
                "Ag": "Agricultural",
                "Hh": "Household",
                "Ot": "Other"
            }
            part = field.split("_")[1]
            field_name = key_map.get(part)
            if field_name and "13" in data:
                value = data.get("13", {}).get(field_name, "0")
                c.drawString(coord[0], coord[1], str(value))
        elif field in data:
            value = data[field]
            if value:  # Only draw if value exists
                c.drawString(coord[0], coord[1], str(value))
    
    # Fill checkboxes
    for label, (x, y) in data.get("Checks", {}).items():
        c.drawString(x, y, "✓")
    
    # Special checkbox handling
    if "9a" in data and "9a" not in data.get("Checks", {}):
        if data.get("9a") == "Corporation (1120)":
            c.drawString(CHECK_COORDS["9a"][0], CHECK_COORDS["9a"][1], "✓")
    
    if "16" in data and "16" not in data.get("Checks", {}):
        if data.get("16") == "Finance & insurance":
            c.drawString(CHECK_COORDS["16"][0], CHECK_COORDS["16"][1], "✓")
    
    c.save()
    print("===> Overlay created")

def merge_pdfs(template_path, overlay_path, output_path):
    print("===> Merging overlay with template...")
    base = PdfReader(template_path)
    overlay = PdfReader(overlay_path)
    writer = PdfWriter()
    
    for i in range(len(base.pages)):
        page = base.pages[i]
        if i < len(overlay.pages):
            page.merge_page(overlay.pages[i])
        writer.add_page(page)
    
    with open(output_path, 'wb') as f:
        writer.write(f)

def download_from_s3(bucket, key, local_path):
    print(f"===> Downloading s3://{bucket}/{key} to {local_path}")
    s3 = boto3.client("s3")
    s3.download_file(bucket, key, local_path)
    print(f"===> Download complete")

def upload_to_s3(bucket, key, local_path):
    print(f"===> Uploading {local_path} to s3://{bucket}/{key}")
    s3 = boto3.client("s3")
    s3.upload_file(
        local_path,
        bucket,
        key,
        ExtraArgs={'ContentType': 'application/pdf'}
    )
    print(f"===> Upload complete: s3://{bucket}/{key}")

def extract_s3_info(url):
    """Extract bucket and key from S3 URL"""
    if url.startswith('s3://'):
        parts = url[5:].split('/', 1)
        return parts[0], parts[1] if len(parts) > 1 else ''
    elif 's3.amazonaws.com' in url or '.s3.' in url:
        if 's3.amazonaws.com' in url:
            parts = url.split('s3.amazonaws.com/')[1].split('/', 1)
            return parts[0], parts[1] if len(parts) > 1 else ''
        else:
            parts = url.split('.s3.')[0].replace('https://', '').split('/')
            bucket = parts[0]
            key = '/'.join(parts[1:]) if len(parts) > 1 else ''
            return bucket, key
    return None, None

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
        return_pdf = body.get("return_pdf", False)
        
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
            template_bucket = BUCKET_NAME
            template_key = 'fss4.pdf'
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
    template_path = os.path.join(tmpdir, "template_ss4.pdf")
    overlay_path = os.path.join(tmpdir, "overlay.pdf")
    output_path = os.path.join(tmpdir, "filled_ss4.pdf")
    
    try:
        # Download template from S3
        download_from_s3(template_bucket, template_key, template_path)
        
        # Map TypeScript data format to SS-4 field format
        # form_data from TypeScript comes from transformDataForSS4 which sends:
        # companyName, companyNameBase, entityType, formationState, businessPurpose, companyAddress
        # responsiblePartyName, responsiblePartySSN, responsiblePartyAddress, etc.
        print(f"===> Mapping form data to SS-4 fields...")
        ss4_fields = map_data_to_ss4_fields(form_data)
        print(f"===> Mapped {len(ss4_fields)} fields")
        
        # Create overlay and merge
        create_overlay(ss4_fields, overlay_path)
        merge_pdfs(template_path, overlay_path, output_path)
        
        # Upload to S3
        upload_to_s3(s3_bucket, s3_key, output_path)
        
        # Read PDF for return if requested
        pdf_bytes = None
        if return_pdf:
            with open(output_path, 'rb') as f:
                pdf_bytes = f.read()
        
        response = {
            "statusCode": 200,
            "body": json.dumps({
                "message": "✅ SS-4 PDF uploaded to S3",
                "s3_bucket": s3_bucket,
                "s3_key": s3_key,
                "s3_url": f"s3://{s3_bucket}/{s3_key}"
            })
        }
        
        # If return_pdf is true, return PDF as binary (base64 encoded for Lambda Function URL)
        if return_pdf and pdf_bytes:
            import base64
            response["statusCode"] = 200
            response["headers"] = {
                "Content-Type": "application/pdf",
                "Content-Disposition": f"attachment; filename=SS-4.pdf"
            }
            response["body"] = base64.b64encode(pdf_bytes).decode('utf-8')
            response["isBase64Encoded"] = True
        
        return response
        
    except Exception as e:
        print(f"===> ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

