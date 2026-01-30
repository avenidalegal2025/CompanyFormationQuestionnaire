import os
import json
import tempfile
import boto3
import re
import base64
from docx import Document

# Constants
TEMPLATE_BUCKET = os.environ.get('TEMPLATE_BUCKET', 'avenida-legal-documents')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')
BUCKET_NAME = os.environ.get('BUCKET_NAME', TEMPLATE_BUCKET)

# Initialize S3 client
s3_client = boto3.client('s3', region_name=os.environ.get('AWS_REGION', 'us-west-1'))


def download_from_s3(bucket, key, local_path):
    """Download file from S3 to local path"""
    print(f"===> Downloading s3://{bucket}/{key} to {local_path}")
    s3_client.download_file(bucket, key, local_path)
    print("===> Downloaded successfully")


def upload_to_s3(local_path, bucket, key):
    """Upload file from local path to S3"""
    print(f"===> Uploading {local_path} to s3://{bucket}/{key}")
    s3_client.upload_file(local_path, bucket, key)
    print("===> Uploaded successfully")


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


def replace_placeholders(doc, data):
    """Replace placeholders in Shareholder Registry document"""
    print("===> Replacing placeholders in document...")

    company_name = data.get('companyName', '')
    formation_state = data.get('formationState', '')
    company_address = data.get('companyAddress', '')
    payment_date = data.get('paymentDate', '')
    authorized_shares = str(data.get('authorizedShares', '') or '')
    outstanding_shares = str(data.get('outstandingShares', '') or '')
    officer_1_name = data.get('officer1Name', '')
    officer_1_role = data.get('officer1Role', '')

    shareholders = data.get('shareholders', []) or []

    def replace_in_text(text: str) -> str:
        if not text:
            return text
        text = text.replace('{{Company Name}}', company_name)
        text = text.replace('{{Formation State}}', formation_state)
        text = text.replace('{{Company Address}}', company_address)
        text = text.replace('{{Payment Date}}', payment_date)
        text = text.replace('{{Authorized Shares}}', authorized_shares)
        text = text.replace('{{Outstanding Shares}}', outstanding_shares)
        text = text.replace('{{Officer 1 Name}}', officer_1_name)
        text = text.replace('{{Officer 1 Role}}', officer_1_role)

        for idx in range(1, 7):
            num2 = f"{idx:02d}"
            shareholder = shareholders[idx - 1] if idx - 1 < len(shareholders) else {}

            text = text.replace(f'{{{{shareholder_{num2}_date}}}}', shareholder.get('date', '') or '')
            text = text.replace(f'{{{{shareholder_{num2}_name}}}}', shareholder.get('name', '') or '')
            text = text.replace(f'{{{{shareholder_{num2}_transaction}}}}', shareholder.get('transaction', '') or '')
            text = text.replace(f'{{{{shareholder_{num2}_shares}}}}', shareholder.get('shares', '') or '')
            text = text.replace(f'{{{{shareholder_{num2}_class}}}}', shareholder.get('class', '') or '')
            text = text.replace(f'{{{{shareholder_{num2}_percent}}}}', shareholder.get('percent', '') or '')

        return text

    for paragraph in doc.paragraphs:
        full_text = paragraph.text
        if '{{' in full_text:
            new_text = replace_in_text(full_text)
            if new_text != full_text:
                paragraph.text = new_text

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    full_text = paragraph.text
                    if '{{' in full_text:
                        new_text = replace_in_text(full_text)
                        if new_text != full_text:
                            paragraph.text = new_text


def lambda_handler(event, context):
    print("===> Shareholder Registry Lambda invoked")

    try:
        body = json.loads(event.get('body', '{}'))
    except Exception:
        body = event if isinstance(event, dict) else {}

    form_data = body.get('form_data', {}) or {}
    s3_bucket = body.get('s3_bucket', OUTPUT_BUCKET)
    s3_key = body.get('s3_key', '')
    template_url = body.get('templateUrl')
    return_docx = body.get('return_docx', False)

    if not template_url:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing 'templateUrl'"})
        }

    template_bucket, template_key = extract_s3_info(template_url)
    if not template_bucket or not template_key:
        template_bucket = BUCKET_NAME
        template_key = 'templates/shareholder-registry/shareholder-registry-1.docx'
        print(f"===> Could not parse templateUrl, using default: s3://{template_bucket}/{template_key}")

    with tempfile.TemporaryDirectory() as tmpdir:
        template_path = os.path.join(tmpdir, "template_shareholder_registry.docx")
        output_path = os.path.join(tmpdir, "filled_shareholder_registry.docx")

        download_from_s3(template_bucket, template_key, template_path)

        doc = Document(template_path)
        replace_placeholders(doc, form_data)
        doc.save(output_path)

        upload_to_s3(output_path, s3_bucket, s3_key)

        if return_docx:
            with open(output_path, "rb") as f:
                docx_content = f.read()
            encoded = base64.b64encode(docx_content).decode('utf-8')
            return {
                "statusCode": 200,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "message": "Shareholder Registry generated successfully",
                    "docx_base64": encoded
                })
            }

        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Shareholder Registry generated successfully"})
        }

    return {
        "statusCode": 500,
        "body": json.dumps({"error": "Failed to generate Shareholder Registry"})
    }
