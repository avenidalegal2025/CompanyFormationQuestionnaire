import os
import json
import tempfile
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import boto3

# Constants
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'ss4-template-bucket-043206426879')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')

# TODO: Define field positions for SS-4 form based on actual PDF coordinates
FIELD_POSITIONS = {
    # Add SS-4 specific field positions here
    # Example: "Company Name": (x, y),
}

def create_overlay(data, path):
    """
    Create overlay PDF with form data for SS-4.
    TODO: Implement actual field mapping based on SS-4 PDF form structure.
    """
    print("===> Creating overlay for SS-4...")
    c = canvas.Canvas(path)
    c.setFont("Helvetica", 9)
    
    # TODO: Map form_data fields to PDF coordinates
    # Example:
    # c.drawString(x, y, data.get("companyName", ""))
    # c.drawString(x, y, data.get("responsiblePartyName", ""))
    # etc.
    
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
        
        # Create overlay and merge
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
                "message": "✅ SS-4 PDF uploaded to S3",
                "s3_bucket": s3_bucket,
                "s3_key": s3_key,
                "s3_url": f"s3://{s3_bucket}/{s3_key}"
            })
        }
        
        # If return_pdf is true, return PDF as binary
        if return_pdf and pdf_bytes:
            response["statusCode"] = 200
            response["headers"] = {
                "Content-Type": "application/pdf",
                "Content-Disposition": f"attachment; filename=SS-4.pdf"
            }
            response["body"] = pdf_bytes
            response["isBase64Encoded"] = False
        
        return response
        
    except Exception as e:
        print(f"===> ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }

