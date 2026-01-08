import os
import json
import tempfile
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import boto3

# Constants
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'ss4-template-bucket-043206426879')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')

# Initialize AWS Translate client
translate_client = boto3.client('translate', region_name='us-west-1')

def truncate_at_word_boundary(text, max_length):
    """
    Truncate text at word boundaries to avoid cutting words.
    Never exceeds max_length and never cuts words in half.
    """
    if not text or len(text) <= max_length:
        return text
    
    # Truncate to max_length
    truncated = text[:max_length]
    
    # Find the last space before the truncation point
    last_space = truncated.rfind(' ')
    
    if last_space > 0:
        # Truncate at the last complete word
        return truncated[:last_space].strip()
    else:
        # No space found, return truncated (single long word)
        return truncated.strip()

def translate_to_english(text):
    """
    Translate Spanish text to English using AWS Translate.
    Returns original text if translation fails or text is already in English.
    """
    if not text or not isinstance(text, str) or len(text.strip()) == 0:
        return text
    
    text_clean = text.strip()
    
    # Skip very short text (likely codes, numbers, or already English)
    if len(text_clean) < 3:
        return text
    
    # Quick check: if text doesn't contain Spanish characters, assume it's English
    # Spanish characters: á, é, í, ó, ú, ñ, ü, ¿, ¡
    has_spanish = any(char in text_clean for char in 'áéíóúñü¿¡')
    
    if not has_spanish:
        return text
    
    try:
        # Translate from Spanish to English
        result = translate_client.translate_text(
            Text=text_clean,
            SourceLanguageCode='es',
            TargetLanguageCode='en'
        )
        translated = result.get('TranslatedText', text_clean)
        print(f"===> Translated: '{text_clean[:50]}...' -> '{translated[:50]}...'")
        return translated
    except Exception as e:
        print(f"===> Translation failed for '{text_clean[:50]}...': {e}")
        return text

# Form 8821 Field Positions
# Actual coordinates from debug_grid_overlay.py
FIELD_POSITIONS = {
    "Taxpayer Name": (77, 661),  # Lowered 7 pixels (668 - 7)
    "Taxpayer Address 1": (77, 649),  # 12 pixels below name (661 - 12)
    "Taxpayer Address 2": (77, 637),  # 12 pixels below address 1 (649 - 12)
    "Taxpayer Phone": (377, 639),  # Moved 15px left (392 - 15), 3px higher (636 + 3)
    "Designee Name": (77, 590),  # Moved up 10 pixels (580 + 10)
    "Designee Address 1": (77, 577),  # Moved up 10 pixels (567 + 10)
    "Designee Address 2": (77, 565),  # Moved up 10 pixels (555 + 10)
    "Designee Phone": (453, 579),  # Lowered 3 pixels (582 - 3)
    "Designee Fax": (453, 565),  # Lowered 3 pixels (568 - 3)
    "Tax Info": (70, 396),  # Raised 2 pixels (394 + 2)
    "Tax Form": (200, 396),  # Raised 2 pixels (394 + 2)
    "Tax Years": (325, 396),  # Raised 2 pixels (394 + 2)
    "Tax Matters": (460, 396),  # Raised 2 pixels (394 + 2)
    "Checkbox": (534, 412),  # Section 3 Intermediate Service Provider checkbox (NOT checked)
    "Section 4 Checkbox": (565, 315),  # Section 4 checkbox (ALWAYS checked) - moved 5px right (560 + 5)
    "Signature Name": (77, 76),  # Print Name field - lowered 4 pixels (80 - 4)
    "Signature Title": (447, 76),  # Title field - lowered 4 pixels (80 - 4)
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
    
    # Helper function to process text fields (translate, uppercase, truncate)
    def process_text(value, max_length=None):
        if not value:
            return ""
        # Translate from Spanish to English
        translated = translate_to_english(str(value))
        # Convert to uppercase
        upper = translated.upper()
        # Truncate if needed
        if max_length and len(upper) > max_length:
            return truncate_at_word_boundary(upper, max_length)
        return upper
    
    # Taxpayer (Company) Information - Box 1
    taxpayer_name = process_text(data.get("taxpayerName", ""), max_length=80)
    taxpayer_address = process_text(data.get("taxpayerAddress", ""), max_length=80)
    taxpayer_address_line2 = process_text(data.get("taxpayerAddressLine2", ""), max_length=80)
    taxpayer_city = process_text(data.get("taxpayerCity", ""))
    taxpayer_state = process_text(data.get("taxpayerState", ""))
    taxpayer_zip = str(data.get("taxpayerZip", "")).strip()
    taxpayer_phone = process_text(data.get("taxpayerPhone", ""), max_length=20)
    
    # Debug logging for address
    print(f"🔍 DEBUG Box 1 Address:")
    print(f"   taxpayer_name: '{taxpayer_name}'")
    print(f"   taxpayer_address: '{taxpayer_address}'")
    print(f"   taxpayer_address_line2: '{taxpayer_address_line2}'")
    print(f"   taxpayer_city: '{taxpayer_city}'")
    print(f"   taxpayer_state: '{taxpayer_state}'")
    print(f"   taxpayer_zip: '{taxpayer_zip}'")
    print(f"   taxpayer_phone: '{taxpayer_phone}'")
    
    # Build taxpayer address lines
    # IMPORTANT: For Box 1, we want:
    # Line 2: Street address only (taxpayerAddress)
    # Line 3: City, State ZIP (taxpayerCity, taxpayerState, taxpayerZip)
    # Do NOT combine taxpayerAddressLine2 - it's not used for 8821
    taxpayer_address_1 = taxpayer_address or ""
    
    # Truncate address line 1 if needed
    if len(taxpayer_address_1) > 80:
        taxpayer_address_1 = truncate_at_word_boundary(taxpayer_address_1, max_length=80)
    
    # Address line 2: City, State ZIP
    city_state_zip_parts = [p for p in [taxpayer_city, taxpayer_state, taxpayer_zip] if p]
    taxpayer_address_2 = ", ".join(city_state_zip_parts) if city_state_zip_parts else ""
    if taxpayer_address_2 and len(taxpayer_address_2) > 80:
        taxpayer_address_2 = truncate_at_word_boundary(taxpayer_address_2, max_length=80)
    
    # Debug logging for built address
    print(f"🔍 DEBUG Built Address:")
    print(f"   taxpayer_address_1 (Line 2): '{taxpayer_address_1}'")
    print(f"   taxpayer_address_2 (Line 3): '{taxpayer_address_2}'")
    
    # Designee (Avenida Legal) Information
    designee_name = process_text(data.get("designeeName", "Avenida Legal"), max_length=80)
    designee_address = process_text(data.get("designeeAddress", ""), max_length=80)
    designee_city = process_text(data.get("designeeCity", ""))
    designee_state = process_text(data.get("designeeState", ""))
    designee_zip = str(data.get("designeeZip", "")).strip()
    designee_phone = process_text(data.get("designeePhone", ""), max_length=20)
    designee_fax = process_text(data.get("designeeFax", ""), max_length=20)
    
    # Build designee address lines
    designee_address_1 = designee_address or ""
    # Always include city, state, zip on line 2 for Avenida Legal
    designee_city_state_zip_parts = [p for p in [designee_city, designee_state, designee_zip] if p]
    designee_address_2 = ", ".join(designee_city_state_zip_parts) if designee_city_state_zip_parts else ""
    # For Avenida Legal, always show the full address
    if not designee_address_2 and designee_city and designee_state and designee_zip:
        designee_address_2 = f"{designee_city}, {designee_state} {designee_zip}"
    if designee_address_2 and len(designee_address_2) > 80:
        designee_address_2 = truncate_at_word_boundary(designee_address_2, max_length=80)
    
    # Tax authorization details - Section 3
    # ALWAYS set to "N/A" for all fields
    tax_info = "N/A"
    tax_form = "N/A"
    tax_years = "N/A"
    tax_matters = "N/A"
    
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
    
    # Line 3: Tax info - ALWAYS "N/A" for all fields
    c.drawString(*FIELD_POSITIONS["Tax Info"], tax_info)
    c.drawString(*FIELD_POSITIONS["Tax Form"], tax_form)
    c.drawString(*FIELD_POSITIONS["Tax Years"], tax_years)
    c.drawString(*FIELD_POSITIONS["Tax Matters"], tax_matters)
    
    # Section 3: Intermediate Service Provider checkbox - NOT checked (leave empty)
    # DO NOT draw anything at the "Checkbox" position - it's for Section 3 which we don't check
    
    # Section 4: Specific use not recorded on CAF - ALWAYS checked
    # Position: 10px left, 5px up, 75% smaller (12 * 0.75 = 9)
    c.setFont("Helvetica-Bold", 9)  # 75% of original 12 = 9
    c.drawString(*FIELD_POSITIONS["Section 4 Checkbox"], "X")
    c.setFont("Helvetica", 9)
    
    # Page 1 - Signature section (BEFORE showPage!)
    # Get signature data - don't process/translate names (keep original)
    signature_name_raw = data.get("signatureName", "")
    signature_title_raw = data.get("signatureTitle", "")
    
    # Process signature name - translate but keep original format
    signature_name = process_text(signature_name_raw, max_length=80) if signature_name_raw else ""
    # Process signature title - translate and uppercase
    signature_title = process_text(signature_title_raw, max_length=50) if signature_title_raw else ""
    
    # Debug logging for signature
    print(f"🔍 DEBUG Signature:")
    print(f"   Raw signature_name from data: '{signature_name_raw}'")
    print(f"   Raw signature_title from data: '{signature_title_raw}'")
    print(f"   Processed signature_name: '{signature_name}'")
    print(f"   Processed signature_title: '{signature_title}'")
    print(f"   All data keys: {list(data.keys())}")
    
    # Always draw signature name and title - use raw if processed is empty
    final_signature_name = signature_name if signature_name and signature_name.strip() else (signature_name_raw if signature_name_raw else "AUTHORIZED SIGNER")
    final_signature_title = signature_title if signature_title and signature_title.strip() else (signature_title_raw if signature_title_raw else "AUTHORIZED SIGNER")
    
    # Convert to uppercase for consistency
    final_signature_name = final_signature_name.upper() if final_signature_name else "AUTHORIZED SIGNER"
    final_signature_title = final_signature_title.upper() if final_signature_title else "AUTHORIZED SIGNER"
    
    # Truncate if needed
    if len(final_signature_name) > 80:
        final_signature_name = truncate_at_word_boundary(final_signature_name, max_length=80)
    if len(final_signature_title) > 50:
        final_signature_title = truncate_at_word_boundary(final_signature_title, max_length=50)
    
    # Draw signature name and title on PAGE 1 (before showPage)
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)  # Ensure black text (not transparent)
    
    # Draw signature name
    c.drawString(*FIELD_POSITIONS["Signature Name"], final_signature_name)
    print(f"✅ Drew signature name '{final_signature_name}' at {FIELD_POSITIONS['Signature Name']} on PAGE 1 with font Helvetica 9")
    
    # Draw signature title
    c.drawString(*FIELD_POSITIONS["Signature Title"], final_signature_title)
    print(f"✅ Drew signature title '{final_signature_title}' at {FIELD_POSITIONS['Signature Title']} on PAGE 1 with font Helvetica 9")
    
    c.showPage()
    
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

