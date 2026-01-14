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

FIELD_POSITIONS = {
    "Taxpayer Name": (77, 639),  # Line 1: Company name - lowered 2px (641 - 2)
    "Taxpayer Address 1": (77, 627),  # Line 2: Street address - lowered 2px (629 - 2)
    "Taxpayer Address 2": (77, 615),  # Line 3: City, State, Zip - lowered 2px (617 - 2)
    "Taxpayer Phone": (377, 615),  # Daytime telephone - lowered 2px (617 - 2)
    "Representative Name": (77, 565),  # Representative name - moved 25px down (590 - 25)
    "Representative Address 1": (77, 552),  # Representative address line 1 - moved 25px down (577 - 25)
    "Representative Address 2": (77, 540),  # Representative address line 2 - moved 25px down (565 - 25)
    "Representative Phone": (453, 554),  # Representative phone - moved 2px up (552 + 2)
    "Representative Fax": (453, 542),  # Representative fax - moved 4px up (538 + 4)
    "Representative PTIN": (415, 555),
    "Authorized Type 1": (80, 232),  # Income Tax - keep same
    "Authorized Form 1": (340, 232),  # Tax Form Number (1065/1120/1120-S) - aligned with Income Tax
    "Authorized Year 1": (500, 232),  # Year - aligned with Income Tax
    "EIN": (80, 212),  # EIN field - 20px under Income Tax (232 - 20)
    "SS4": (340, 210),  # SS-4 field - moved 20px up (190 + 20)
    "Formation Year": (500, 210),  # Year company is being formed - moved 20px up (190 + 20)
    "Authorized Type 2": (80, 210),
    "Authorized Form 2": (340, 210),
    "Authorized Year 2": (500, 210),
    "Signature Name": (55, 522),  # Print name - moved 2px down (524 - 2)
    "Signature Title": (400, 554),  # Title - 20px left (420 - 20), 5px down (559 - 5)
    "Signature Company": (310, 522),  # Print name of taxpayer - aligned with Signature Name (519 + 3)
    "Representative Date": (535, 150),
    "Representative Designation": (62, 150),
    "Representative Jurisdiction": (110, 150),
    "Representative License No.": (245, 150),
    "Representative Signature": (380, 150)  # Signature column between License and Date
}

def create_overlay(data, path):
    print("===> Creating overlay...")
    c = canvas.Canvas(path)
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
    
    # Page 1
    # Input 1: Taxpayer (Company) Information - Same format as 8821
    # Line 1: Full company name
    company_name = process_text(data.get("companyName", ""), max_length=80)
    if company_name:
        c.drawString(*FIELD_POSITIONS["Taxpayer Name"], company_name)
    
    # Line 2: Street address (or primary address line)
    company_address = process_text(data.get("companyAddress", ""), max_length=80)
    if company_address:
        c.drawString(*FIELD_POSITIONS["Taxpayer Address 1"], company_address)
    
    # Line 3: Either explicit Address Line 2 from data, or City, State, Zip
    company_address_line2 = process_text(data.get("companyAddressLine2", ""), max_length=80)
    if company_address_line2:
        c.drawString(*FIELD_POSITIONS["Taxpayer Address 2"], company_address_line2)
    else:
        company_city = process_text(data.get("companyCity", ""))
        company_state = process_text(data.get("companyState", ""))
        company_zip = str(data.get("companyZip", "")).strip()
        city_state_zip = ", ".join(filter(None, [company_city, company_state, company_zip]))
        if city_state_zip:
            c.drawString(*FIELD_POSITIONS["Taxpayer Address 2"], truncate_at_word_boundary(city_state_zip, max_length=80))
    
    # Telephone number (same position as 8821)
    # Remove "+1_" or "+1 " prefix if present
    company_phone_raw = data.get("companyPhone", "")
    if company_phone_raw:
        # Remove "+1_" or "+1 " or "+1" prefix (handle space and underscore variants)
        company_phone = str(company_phone_raw).replace("+1_", "").replace("+1 ", "").replace("+1", "").strip()
        company_phone = process_text(company_phone, max_length=20)
        if company_phone:
            c.drawString(*FIELD_POSITIONS["Taxpayer Phone"], company_phone)
    
    # Input 2: Representative (Antonio Regojo) Information - Same format as 8821
    # Name
    representative_name = process_text(data.get("representativeName", ""), max_length=80)
    if representative_name:
        c.drawString(*FIELD_POSITIONS["Representative Name"], representative_name)
    
    # Address Line 1: Street address
    representative_address = process_text(data.get("representativeAddress", ""), max_length=80)
    if representative_address:
        c.drawString(*FIELD_POSITIONS["Representative Address 1"], representative_address)
    
    # Address Line 2: City, State, Zip
    representative_city = process_text(data.get("representativeCity", ""))
    representative_state = process_text(data.get("representativeState", ""))
    representative_zip = str(data.get("representativeZip", "")).strip()
    rep_city_state_zip = ", ".join(filter(None, [representative_city, representative_state, representative_zip]))
    if rep_city_state_zip:
        c.drawString(*FIELD_POSITIONS["Representative Address 2"], truncate_at_word_boundary(rep_city_state_zip, max_length=80))
    
    # Representative Phone and Fax (same positions as 8821)
    representative_phone = process_text(data.get("representativePhone", ""), max_length=20)
    if representative_phone:
        c.drawString(*FIELD_POSITIONS["Representative Phone"], representative_phone)
    
    representative_fax = process_text(data.get("representativeFax", ""), max_length=20)
    if representative_fax:
        c.drawString(*FIELD_POSITIONS["Representative Fax"], representative_fax)
    
    # Section 3: Acts Authorized
    # Description of Matter | Tax Form Number | Year(s) or Period(s)
    authorized_type = process_text(data.get("authorizedType", "INCOME TAX"), max_length=30)
    authorized_form = process_text(data.get("authorizedForm", ""), max_length=20)  # 1065, 1120, or 1120-S
    authorized_year = process_text(data.get("authorizedYear", ""), max_length=10)  # Formation year
    
    # Always draw these fields - they are required
    if authorized_type:
        c.drawString(*FIELD_POSITIONS["Authorized Type 1"], authorized_type)
        print(f"✅ Drew authorized type '{authorized_type}' at {FIELD_POSITIONS['Authorized Type 1']}")
    else:
        # Fallback if not provided
        c.drawString(*FIELD_POSITIONS["Authorized Type 1"], "INCOME TAX")
        print(f"✅ Drew authorized type 'INCOME TAX' (fallback) at {FIELD_POSITIONS['Authorized Type 1']}")
    
    if authorized_form:
        c.drawString(*FIELD_POSITIONS["Authorized Form 1"], authorized_form)
        print(f"✅ Drew authorized form '{authorized_form}' at {FIELD_POSITIONS['Authorized Form 1']}")
    else:
        print(f"⚠️ WARNING: authorizedForm is missing in data")
    
    if authorized_year:
        c.drawString(*FIELD_POSITIONS["Authorized Year 1"], authorized_year)
        print(f"✅ Drew authorized year '{authorized_year}' at {FIELD_POSITIONS['Authorized Year 1']}")
    else:
        print(f"⚠️ WARNING: authorizedYear is missing in data")
    
    # EIN | SS-4 | Year (company being formed) - 20px below Income Tax row
    ein = process_text(data.get("ein", ""), max_length=20)
    ss4 = process_text(data.get("ss4", "SS-4"), max_length=10)
    formation_year = process_text(data.get("formationYear", ""), max_length=10)
    
    # Draw EIN | SS-4 | Year fields
    # Always draw EIN (use value if provided, otherwise use "EIN" as label)
    ein_text = ein if ein else "EIN"
    c.drawString(*FIELD_POSITIONS["EIN"], ein_text)
    print(f"✅ Drew EIN '{ein_text}' at {FIELD_POSITIONS['EIN']}")
    if ss4:
        c.drawString(*FIELD_POSITIONS["SS4"], ss4)
        print(f"✅ Drew SS-4 '{ss4}' at {FIELD_POSITIONS['SS4']}")
    if formation_year:
        c.drawString(*FIELD_POSITIONS["Formation Year"], formation_year)
        print(f"✅ Drew formation year '{formation_year}' at {FIELD_POSITIONS['Formation Year']}")
    
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(570, 160, "✓")  # Checkbox
    c.showPage()
    
    # Page 2
    # IMPORTANT: Set font and color again after showPage() - font settings don't persist across pages
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0, 0, 0)  # Ensure black text (not transparent)
    
    # Section 7: Taxpayer signature
    # Print name: Full name of responsible party
    signature_name = process_text(data.get("signatureName", ""), max_length=80)
    # CRITICAL: Only draw if we have a value (don't draw empty string)
    # If empty, the template's "AUTHORIZED SIGNER" will show through
    if signature_name and signature_name.strip():
        c.drawString(*FIELD_POSITIONS["Signature Name"], signature_name)
        print(f"✅ Drew signature name '{signature_name}' at {FIELD_POSITIONS['Signature Name']} on PAGE 2")
    else:
        print(f"❌ ERROR: Cannot draw signature name - it's empty! This means the template's 'AUTHORIZED SIGNER' will show.")
        print(f"❌ Data received: signatureName='{data.get('signatureName', '')}', processed='{signature_name}'")
        print(f"❌ Available keys: {list(data.keys())}")
    
    # Print name of taxpayer: Full company name
    signature_company = process_text(data.get("signatureCompanyName", ""), max_length=80)
    if signature_company:
        c.drawString(*FIELD_POSITIONS["Signature Company"], signature_company)
        print(f"✅ Drew signature company '{signature_company}' at {FIELD_POSITIONS['Signature Company']} on PAGE 2")
    
    # Title: Responsible party title
    signature_title = process_text(data.get("signatureTitle", ""), max_length=50)
    if signature_title:
        c.drawString(*FIELD_POSITIONS["Signature Title"], signature_title)
        print(f"✅ Drew signature title '{signature_title}' at {FIELD_POSITIONS['Signature Title']} on PAGE 2")
    # Representative Date - only draw if provided (leave blank for manual entry)
    representative_date = process_text(data.get("representativeDate", ""), max_length=20)
    if representative_date and representative_date.strip():
        c.drawString(*FIELD_POSITIONS["Representative Date"], representative_date)
    c.drawString(*FIELD_POSITIONS["Representative Designation"], process_text(data.get("representativeDesignation", ""), max_length=50))
    c.drawString(*FIELD_POSITIONS["Representative Jurisdiction"], process_text(data.get("representativeJurisdiction", ""), max_length=50))
    c.drawString(*FIELD_POSITIONS["Representative License No."], process_text(data.get("representativeLicenseNo", ""), max_length=30))
    # Representative Signature - Leave blank (user will sign manually)
    
    c.save()

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
        # Handle https://bucket.s3.region.amazonaws.com/key or https://s3.amazonaws.com/bucket/key
        if 's3.amazonaws.com' in url:
            parts = url.split('s3.amazonaws.com/')[1].split('/', 1)
            return parts[0], parts[1] if len(parts) > 1 else ''
        else:
            # https://bucket.s3.region.amazonaws.com/key
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
            # Fallback: use default bucket and key from URL
            template_bucket = BUCKET_NAME
            template_key = 'f2848.pdf'
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
    template_path = os.path.join(tmpdir, "template_2848.pdf")
    overlay_path = os.path.join(tmpdir, "overlay.pdf")
    output_path = os.path.join(tmpdir, "filled_2848.pdf")
    
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
                "message": "✅ 2848 PDF uploaded to S3",
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
                "Content-Disposition": f"attachment; filename=2848.pdf"
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

