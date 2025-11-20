import os
import json
import tempfile
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import boto3

# Constants
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'ss4-template-bucket-043206426879')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')

# Form 8821 Field Positions
# Actual coordinates from debug_grid_overlay.py
FIELD_POSITIONS = {
    "Taxpayer Name": (77, 668),
    "Taxpayer Address 1": (77, 655),
    "Taxpayer Address 2": (77, 643),
    "Taxpayer Phone": (457, 628),
    "Designee Name": (77, 580),
    "Designee Address 1": (77, 567),
    "Designee Address 2": (77, 555),
    "Designee Phone": (453, 566),
    "Designee Fax": (453, 552),
    "Tax Info": (70, 417),
    "Tax Form": (200, 417),
    "Tax Years": (325, 417),
    "Tax Matters": (460, 417),
    "Checkbox": (534, 412),
    "Signature Name": (77, 126),
    "Signature Title": (447, 126),
}

def create_overlay(data, path):
    """
    Create overlay PDF with form data for Form 8821.
    Data format matches transformDataFor8821 output.
    Uses actual coordinates from debug_grid_overlay.py
    """
    print("===> Creating overlay for Form 8821...")
    c = canvas.Canvas(path, pagesize=(612, 792))
    c.setFont("Helvetica", 9)
    
    # Taxpayer (Owner) Information
    taxpayer_name = data.get("taxpayerName", "")
    taxpayer_address = data.get("taxpayerAddress", "")
    taxpayer_city = data.get("taxpayerCity", "")
    taxpayer_state = data.get("taxpayerState", "")
    taxpayer_zip = data.get("taxpayerZip", "")
    taxpayer_phone = data.get("taxpayerPhone", "")  # May not be in data, will be empty
    
    # Build taxpayer address lines
    taxpayer_address_1 = taxpayer_address or ""
    taxpayer_address_2 = f"{taxpayer_city}, {taxpayer_state} {taxpayer_zip}".strip(", ")
    
    # Designee (Avenida Legal) Information
    designee_name = data.get("designeeName", "Avenida Legal")
    designee_address = data.get("designeeAddress", "")
    designee_city = data.get("designeeCity", "")
    designee_state = data.get("designeeState", "")
    designee_zip = data.get("designeeZip", "")
    designee_phone = data.get("designeePhone", "")
    designee_fax = data.get("designeeFax", "")
    
    # Build designee address lines
    designee_address_1 = designee_address or ""
    designee_address_2 = f"{designee_city}, {designee_state} {designee_zip}".strip(", ")
    
    # Tax authorization details
    # transformDataFor8821 sends: taxYears, taxForms
    # Map to the fields expected by the form
    tax_info = data.get("taxInfo", "N/A")
    tax_form = data.get("taxForms", "All tax forms and information")
    tax_years = data.get("taxYears", "2024, 2025, 2026")
    tax_matters = data.get("taxMatters", "N/A")
    
    # Page 1 - Fill form fields
    # Line 1: Taxpayer info
    if taxpayer_name:
        c.drawString(*FIELD_POSITIONS["Taxpayer Name"], taxpayer_name)
    if taxpayer_address_1:
        c.drawString(*FIELD_POSITIONS["Taxpayer Address 1"], taxpayer_address_1)
    if taxpayer_address_2:
        c.drawString(*FIELD_POSITIONS["Taxpayer Address 2"], taxpayer_address_2)
    if taxpayer_phone:
        c.drawString(*FIELD_POSITIONS["Taxpayer Phone"], taxpayer_phone)
    
    # Line 2: Designee info
    if designee_name:
        c.drawString(*FIELD_POSITIONS["Designee Name"], designee_name)
    if designee_address_1:
        c.drawString(*FIELD_POSITIONS["Designee Address 1"], designee_address_1)
    if designee_address_2:
        c.drawString(*FIELD_POSITIONS["Designee Address 2"], designee_address_2)
    if designee_phone:
        c.drawString(*FIELD_POSITIONS["Designee Phone"], designee_phone)
    if designee_fax:
        c.drawString(*FIELD_POSITIONS["Designee Fax"], designee_fax)
    
    # Line 3: Tax info
    if tax_info:
        c.drawString(*FIELD_POSITIONS["Tax Info"], tax_info)
    if tax_form:
        c.drawString(*FIELD_POSITIONS["Tax Form"], tax_form)
    if tax_years:
        c.drawString(*FIELD_POSITIONS["Tax Years"], tax_years)
    if tax_matters:
        c.drawString(*FIELD_POSITIONS["Tax Matters"], tax_matters)
    
    # Checkbox
    c.setFont("Helvetica-Bold", 14)
    c.drawString(*FIELD_POSITIONS["Checkbox"], "✓")
    c.setFont("Helvetica", 9)
    
    c.showPage()
    
    # Page 2 - Signature section
    if taxpayer_name:
        c.drawString(*FIELD_POSITIONS["Signature Name"], taxpayer_name)
    # Signature title can be added if needed
    # signature_title = data.get("signatureTitle", "")
    # if signature_title:
    #     c.drawString(*FIELD_POSITIONS["Signature Title"], signature_title)
    
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
            template_key = 'f8821.pdf'
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
    template_path = os.path.join(tmpdir, "template_8821.pdf")
    overlay_path = os.path.join(tmpdir, "overlay.pdf")
    output_path = os.path.join(tmpdir, "filled_8821.pdf")
    
    try:
        # Download template from S3
        download_from_s3(template_bucket, template_key, template_path)
        
        # Create overlay and merge
        # form_data from TypeScript comes from transformDataFor8821 which sends:
        # companyName, ein, companyAddress
        # taxpayerName, taxpayerSSN, taxpayerAddress, taxpayerCity, taxpayerState, taxpayerZip
        # designeeName, designeeAddress, designeeCity, designeeState, designeeZip, designeePhone, designeeFax
        # taxYears, taxForms
        print(f"===> Creating overlay with form data...")
        create_overlay(form_data, overlay_path)
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
                "message": "✅ Form 8821 PDF uploaded to S3",
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
                "Content-Disposition": f"attachment; filename=8821.pdf"
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

