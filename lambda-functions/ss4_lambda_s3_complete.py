import os
import json
import tempfile
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import boto3
import re

# Constants
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'ss4-template-bucket-043206426879')
OUTPUT_BUCKET = os.environ.get('OUTPUT_BUCKET', 'avenida-legal-documents')

# Initialize AWS Translate client
translate_client = boto3.client('translate', region_name='us-west-1')

# SS-4 Form Field Coordinates
FIELD_COORDS = {
    "Line 1": (65, 690),      # Legal name of entity (full name including LLC/L.L.C. suffix)
    "Line 2": (65, 670),      # Trade name (if different) - moved down 30 pixels total (700 - 30 = 670)
    "Line 3": (315, 690),     # Mailing address line 1 - moved down to same level as Line 1
    "Line 4a": (65, 640),     # Mailing address line 2
    "Line 4b": (65, 617),     # City, State, ZIP
    "Line 5a": (305, 640),    # Street address line 1
    "Line 5b": (315, 617),    # Street address line 2
    "Line 6": (65, 594),      # City, State, ZIP (street address)
    "Line 7a": (65, 570),     # Responsible party name
    "Line 7b": (342, 570),    # Responsible party SSN
    "8b": (500, 542),        # Number of LLC members (if LLC) or date business started (if non-LLC)
    "9a_sole_ssn": (164, 509), # Sole proprietor SSN (100 pixels to the right of 9a_sole checkbox at 64)
    "9b": (290, 414),        # Closing month / State of incorporation
    "16_other_specify": (400, 196),  # Other (specify) text field - same position as healthcare checkbox (where the category description goes)
    "10": (65, 375),         # Reason for applying - text field (summarized business purpose)
    "11": (115, 317),        # Date business started in (month, day, year) format
    "12": (495, 327),        # Closing month of accounting year (DECEMBER) - 15px more right (480+15=495), 10px down (337-10=327)
    "13_Ag": (100, 257),     # Agricultural
    "13_Hh": (180, 257),     # Household
    "13_Ot": (280, 257),     # Other
    "15": (400, 232),        # First date wages paid - 2 pixels up (230 + 2 = 232)
    "17": (65, 172),         # Additional information - 2 pixels higher (170 + 2 = 172)
    "Designee Name": (100, 115),
    "Designee Address": (100, 90),
    "Designee Phone": (450, 112),
    "Designee Fax": (450, 90),
    "Applicant Phone": (450, 65),
    "Applicant Fax": (450, 43),  # Same X as Applicant Phone, Y = 65 - (112 - 90) = 65 - 22 = 43
    "Signature Name": (150, 65)
}

CHECK_COORDS = {
    "8a_yes": [257, 545],     # Is this a LLC? (Yes)
    "8a_no": [300, 545],      # Is this a LLC? (No) - 43 pixels to the right (257 + 43 = 300)
    "8c_yes": [495, 533],
    "9a": [64, 496],          # Entity type checkbox (non-sole proprietor - stays where it is)
    "9a_sole": [64, 509],     # Entity type checkbox (sole proprietor) - 13 pixels up (496 + 13 = 509)
    "9a_corp_sole": [64, 484], # Corporation checkbox (sole proprietor) - 25 pixels below Partnership sole (509 - 25 = 484)
    "9a_corp_form_number": (139, 496),  # Form number input field (1120 or 1120-S) - 75px to the right of Corporation checkbox (64 + 75 = 139)
    "9a_corp_sole_form_number": (139, 484),  # Form number input field for sole proprietor (1120 or 1120-S) - 75px to the right of Corporation checkbox
    "10": [63, 388],
    "14": [407, 256],  # First date wages paid - 1 pixel to the right (406 + 1 = 407)
    # Line 16: Principal activity checkboxes (two-column vertical layout)
    # Left column (X=65): Construction, Real estate, Manufacturing, Rental & leasing, Finance & insurance, Transportation & warehousing, Other
    "16_construction": [63, 208],       # Construction (top of left column) - 2 pixels left, 2 pixels up
    "16_real_estate": [63, 196],        # Real estate - 12 pixels under Construction (208 - 12 = 196)
    "16_manufacturing": [128, 196],    # Manufacturing - 1 more pixel down (197 - 1 = 196)
    "16_rental": [128, 208],            # Rental & leasing - 3 more pixels to the left (131 - 3 = 128)
    "16_finance": [207, 196],           # Finance & insurance - same distance under Transportation as Rental-Manufacturing (208 - 12 = 196)
    "16_transportation": [207, 208],    # Transportation & warehousing - 4 more pixels to the right (203 + 4 = 207)
    "16_other": [322, 196],             # Other (specify) - same line as Finance & insurance (Y=196), under Accommodation & food service (X=322)
    # Right column (X=400): Health care & social assistance, Accommodation & food service, Wholesale—agent/broker, Wholesale—other, Retail
    "16_healthcare": [322, 220],        # Health care & social assistance - above Accommodation, same distance as Accommodation-Other (208 + 12 = 220)
    "16_accommodation": [322, 208],     # Accommodation & food service - 75 more pixels to the right (247 + 75 = 322)
    "16_wholesale_broker": [452, 220],  # Wholesale—agent/broker - 3 pixels to the right (449 + 3 = 452)
    "16_wholesale_other": [452, 208],   # Wholesale—other - under Wholesale—agent/broker, same distance as Healthcare-Accommodation (220 - 12 = 208)
    "16_retail": [537, 208],            # Retail - 10 more pixels to the right (527 + 10 = 537)
    "18_no": [402, 160]  # Has applicant applied for EIN before? (No) - 1 pixel right, 1 pixel up (401 + 1 = 402, 159 + 1 = 160)
}

def translate_to_english(text):
    """
    Translate Spanish text to English using AWS Translate.
    Returns the original text if translation fails or if text is already in English.
    """
    if not text or not isinstance(text, str) or len(text.strip()) == 0:
        return text
    
    # Skip translation for very short text or if it looks like it's already in English
    # (contains mostly ASCII characters and common English words)
    text_clean = text.strip()
    if len(text_clean) < 3:
        return text
    
    # Check if text contains Spanish characters (á, é, í, ó, ú, ñ, etc.) or common Spanish words
    spanish_indicators = [
        r'[áéíóúñÁÉÍÓÚÑ]',  # Spanish accented characters
        r'\b(y|el|la|los|las|de|del|en|con|por|para|que|es|son|un|una|uno|dos|tres)\b',  # Common Spanish words
    ]
    
    has_spanish = any(re.search(pattern, text_clean, re.IGNORECASE) for pattern in spanish_indicators)
    
    if not has_spanish:
        # Likely already in English
        return text
    
    try:
        # Use AWS Translate to translate from Spanish to English
        response = translate_client.translate_text(
            Text=text_clean,
            SourceLanguageCode='es',
            TargetLanguageCode='en'
        )
        translated = response['TranslatedText']
        print(f"===> Translated: '{text_clean[:50]}...' -> '{translated[:50]}...'")
        return translated
    except Exception as e:
        # If translation fails, return original text
        print(f"===> Translation failed for '{text_clean[:50]}...': {e}")
        return text

def map_data_to_ss4_fields(form_data):
    """
    Map TypeScript form data format to SS-4 form field format.
    form_data comes from transformDataForSS4 which sends:
    - companyName, companyNameBase, entityType, formationState, businessPurpose
    - companyAddress
    - responsiblePartyName, responsiblePartySSN, responsiblePartyAddress, etc.
    - ownerCount, isLLC, llcMemberCount, etc.
    
    Logic for different scenarios:
    - LLC with owner SSN: Use owner SSN as responsible party
    - LLC without owner SSN: May need ITIN or handle differently
    - Corporation: Different entity type checkbox
    - Multiple owners: Use primary owner (Owner 1) as responsible party
    """
    import re
    from datetime import datetime
    
    # TypeScript sends flat structure from transformDataForSS4
    # Translate all text fields from Spanish to English
    company_name = translate_to_english(form_data.get("companyName", ""))
    company_name_base = translate_to_english(form_data.get("companyNameBase", company_name))
    entity_type = form_data.get("entityType", "")  # Entity type codes don't need translation
    business_purpose = translate_to_english(form_data.get("businessPurpose", ""))
    formation_state = form_data.get("formationState", "")  # State names are usually in English
    
    # Company address - parse from Company Address field (should include full address: street, city, state, zip)
    # DO NOT translate addresses - keep original format
    company_address = form_data.get("companyAddress", "")
    
    # Parse company address for Line 5a (street address) and Line 5b (city, state, zip)
    # Expected format: "Street Address, City, State ZIP" or "Street Address, City State ZIP"
    company_street_line1 = ""
    company_street_line2 = ""
    company_city_state_zip = ""
    
    if company_address:
        # Split by comma to separate street from city/state/zip
        address_parts = [p.strip() for p in company_address.split(",")]
        
        # Handle different address formats
        # Common formats:
        # 1. "Street, City, State ZIP" (3 parts)
        # 2. "Street, City, State ZIP, Country" (4 parts)
        # 3. "Street, City State ZIP" (2 parts)
        # 4. "Street, City State ZIP, Country" (3 parts, but last is country)
        
        if len(address_parts) >= 4:
            # Format: "Street, City, State ZIP, Country" or "Street, Suite, City, State ZIP"
            # Check if last part looks like a country (USA, US, etc.)
            last_part = address_parts[-1].strip().upper()
            if last_part in ['USA', 'US', 'UNITED STATES', 'UNITED STATES OF AMERICA']:
                # Last part is country, so everything before it is address
                company_street_line1 = address_parts[0].strip()
                # Join middle parts as city, state, zip (everything except first and last)
                if len(address_parts) > 4:
                    # "Street, Suite, City, State ZIP, Country"
                    company_street_line2 = address_parts[1].strip()  # Suite
                    company_city_state_zip = ", ".join(address_parts[2:-1]).strip()  # City, State ZIP
                else:
                    # "Street, City, State ZIP, Country" (4 parts)
                    company_city_state_zip = ", ".join(address_parts[1:-1]).strip()  # City, State ZIP
            else:
                # "Street, Suite, City, State ZIP" (no country)
                company_street_line1 = address_parts[0].strip()
                company_street_line2 = address_parts[1].strip() if len(address_parts) > 3 else ""
                company_city_state_zip = ", ".join(address_parts[-2:]).strip()  # City, State ZIP
        elif len(address_parts) == 3:
            # Format: "Street, City, State ZIP" or "Street, City State ZIP, Country"
            # Check if last part looks like a country
            last_part = address_parts[-1].strip().upper()
            if last_part in ['USA', 'US', 'UNITED STATES', 'UNITED STATES OF AMERICA']:
                # "Street, City State ZIP, Country"
                company_street_line1 = address_parts[0].strip()
                company_city_state_zip = address_parts[1].strip()  # City State ZIP
            else:
                # "Street, City, State ZIP"
                company_street_line1 = address_parts[0].strip()
                company_city_state_zip = ", ".join(address_parts[1:]).strip()  # City, State ZIP
        elif len(address_parts) == 2:
            # Format: "Street, City State ZIP" or "Street, State ZIP"
            company_street_line1 = address_parts[0].strip()
            # Last part is city, state, zip
            company_city_state_zip = address_parts[-1].strip()
        elif len(address_parts) == 1:
            # Only one part - assume it's just the street address
            company_street_line1 = address_parts[0].strip()
    
    # Parse city, state, zip from company_city_state_zip
    # Format: "City State ZIP" or "City, State ZIP" or "City State, ZIP"
    company_city = ""
    company_state = ""
    company_zip = ""
    if company_city_state_zip:
        # Try to parse: "City State ZIP" or "City, State ZIP"
        # First, try splitting by comma
        city_state_parts = company_city_state_zip.split(",")
        if len(city_state_parts) >= 2:
            # Format: "City, State ZIP"
            company_city = city_state_parts[0].strip()
            state_zip = city_state_parts[1].strip().split()
            if len(state_zip) >= 2:
                company_state = state_zip[0]
                company_zip = state_zip[1]
            elif len(state_zip) == 1:
                company_state = state_zip[0]
        else:
            # Format: "City State ZIP" - try to parse by spaces
            # Assume last part is ZIP (5 digits), second to last is State (2 letters), rest is City
            parts = company_city_state_zip.split()
            if len(parts) >= 3:
                # Last part is ZIP
                company_zip = parts[-1]
                # Second to last is State
                company_state = parts[-2]
                # Everything before is City
                company_city = " ".join(parts[:-2])
            elif len(parts) == 2:
                # Could be "City State" or "State ZIP"
                # If second part is 2 letters, it's State; otherwise assume it's ZIP
                if len(parts[1]) == 2:
                    company_city = parts[0]
                    company_state = parts[1]
                else:
                    company_state = parts[0]
                    company_zip = parts[1]
            else:
                # Single part - assume it's city
                company_city = parts[0]
    
    # Debug: Print parsed address components
    print(f"===> ========== ADDRESS PARSING ==========")
    print(f"===> Original company_address: '{company_address}'")
    print(f"===> Number of comma-separated parts: {len(address_parts) if company_address else 0}")
    print(f"===> Parsed street_line1: '{company_street_line1}'")
    print(f"===> Parsed city: '{company_city}'")
    print(f"===> Parsed state: '{company_state}'")
    print(f"===> Parsed zip: '{company_zip}'")
    print(f"===> Parsed city_state_zip: '{company_city_state_zip}'")
    print(f"===> =====================================")
    
    # Responsible party (primary owner)
    # DO NOT translate names and addresses - keep original format
    responsible_name = form_data.get("responsiblePartyName", "")
    responsible_ssn = form_data.get("responsiblePartySSN", "")
    responsible_address = form_data.get("responsiblePartyAddress", "")
    responsible_city = form_data.get("responsiblePartyCity", "")
    responsible_state = form_data.get("responsiblePartyState", "")
    responsible_zip = form_data.get("responsiblePartyZip", "")
    responsible_country = form_data.get("responsiblePartyCountry", "USA")
    
    # Signature name - use pre-formatted signatureName if provided, otherwise format it
    # DO NOT translate signature name - keep original format
    signature_name = form_data.get("signatureName", "")
    
    # Owner information
    owner_count = form_data.get("ownerCount", 1)
    # Determine if entity is LLC - check both isLLC field and entityType
    is_llc = (
        form_data.get("isLLC", "").upper() == "YES" or 
        entity_type.upper() == "LLC" or 
        "LLC" in entity_type.upper() or
        "L.L.C." in entity_type.upper()
    )
    # If entity type contains "PARTNERSHIP", it's not an LLC
    if "PARTNERSHIP" in entity_type.upper():
        is_llc = False
    llc_member_count = form_data.get("llcMemberCount", owner_count if is_llc else None)
    
    # Check if sole proprietor: one member/shareholder with 100% ownership
    is_sole_proprietor = (owner_count == 1)
    sole_proprietor_ssn = None
    # Check ownership percentage if available
    owners = form_data.get("owners", [])
    if owners and len(owners) == 1:
        owner = owners[0]
        owner_ownership = owner.get("ownership", 100)
        # Convert to number if it's a string percentage
        if isinstance(owner_ownership, str):
            owner_ownership = float(owner_ownership.replace("%", ""))
        is_sole_proprietor = (owner_ownership == 100)
        # Get SSN if available
        if is_sole_proprietor:
            sole_proprietor_ssn = owner.get("ssn", "") or owner.get("taxId", "")
            # Clean SSN format (remove dashes, spaces)
            if sole_proprietor_ssn:
                sole_proprietor_ssn = sole_proprietor_ssn.replace("-", "").replace(" ", "")
                # Validate it's not empty, "N/A", or "FOREIGN"
                if sole_proprietor_ssn.upper() in ['N/A', 'FOREIGN', '']:
                    sole_proprietor_ssn = None
    
    # Date business started (use payment date or current date)
    date_business_started = form_data.get("dateBusinessStarted", datetime.now().strftime("%m/%d/%Y"))
    # Convert ISO date to MM/DD/YYYY if needed
    if "-" in date_business_started:
        try:
            dt = datetime.fromisoformat(date_business_started.replace("Z", "+00:00"))
            date_business_started = dt.strftime("%m/%d/%Y")
        except:
            pass
    
    # Build city/state/zip strings
    responsible_city_state_zip = f"{responsible_city}, {responsible_state} {responsible_zip}".strip(", ")
    if not responsible_city_state_zip or responsible_city_state_zip == ", ":
        responsible_city_state_zip = responsible_country
    
    # Helper function to convert to uppercase
    def to_upper(text):
        return str(text).upper() if text else ""
    
    # Helper function to format payment date as (month, day, year)
    def format_payment_date(date_str):
        if not date_str:
            return ""
        try:
            from datetime import datetime
            date_obj = None
            
            # Handle different date formats
            if "-" in date_str:
                # ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
                date_str_clean = date_str.split("T")[0]  # Remove time if present
                try:
                    date_obj = datetime.strptime(date_str_clean, "%Y-%m-%d")
                except:
                    # Try other ISO formats
                    try:
                        date_obj = datetime.fromisoformat(date_str_clean.replace("Z", "+00:00"))
                    except:
                        pass
            elif "/" in date_str:
                # MM/DD/YYYY or M/D/YYYY format
                parts = date_str.split("/")
                if len(parts) == 3:
                    try:
                        # Try MM/DD/YYYY first
                        date_obj = datetime.strptime(date_str, "%m/%d/%Y")
                    except:
                        try:
                            # Try M/D/YYYY
                            date_obj = datetime.strptime(date_str, "%m/%d/%Y")
                        except:
                            # Manual parsing with zero-padding
                            month = parts[0].zfill(2)
                            day = parts[1].zfill(2)
                            year = parts[2]
                            date_obj = datetime(int(year), int(month), int(day))
            elif date_str.startswith("(") and date_str.endswith(")"):
                # Already in (month, day, year) format, return as is
                return date_str
            
            # Format as (MM, DD, YYYY) with proper zero-padding
            if date_obj:
                month = date_obj.strftime('%m')  # Zero-padded month (01-12)
                day = date_obj.strftime('%d')    # Zero-padded day (01-31)
                year = date_obj.strftime('%Y')   # Full year (YYYY)
                return f"({month}, {day}, {year})"
            
            # If we couldn't parse it, return empty string
            print(f"===> ⚠️ Could not parse date: '{date_str}'")
            return ""
        except Exception as e:
            print(f"===> ⚠️ Error formatting date '{date_str}': {e}")
            return ""
    
    # Helper function to format SSN as XXX-XX-XXXX
    def format_ssn(ssn):
        if not ssn or not isinstance(ssn, str):
            return ssn
        # Remove all non-digits
        ssn_clean = ''.join(filter(str.isdigit, ssn))
        # Format as XXX-XX-XXXX if we have 9 digits
        if len(ssn_clean) == 9:
            return f"{ssn_clean[:3]}-{ssn_clean[3:5]}-{ssn_clean[5:]}"
        # If already formatted or invalid, return as is
        return ssn
    
    # Helper function to format signature name with member designation
    def format_signature_name(name, is_llc, owner_count):
        name_upper = to_upper(name)
        if is_llc:
            if owner_count == 1:
                return f"{name_upper},SOLE MEMBER"
            else:
                return f"{name_upper},MEMBER"
        return name_upper
    
    # Helper function to format designee name with officer title for C-Corp only
    def format_designee_name(form_data, entity_type):
        base_name = "ANTONIO REGOJO"
        entity_type_upper = entity_type.upper() if entity_type else ""
        
        # For C-Corp only, add officer title (President or whoever has SSN)
        # For LLC, S-Corp, Partnership, etc., just use base name
        if "C-CORP" in entity_type_upper and "S-CORP" not in entity_type_upper:
            # Get responsible party officer role from form_data
            officer_role = form_data.get("responsiblePartyOfficerRole", "")
            if officer_role:
                # Use the officer role (e.g., "President", "Vice-President", "Treasurer", "Secretary")
                return f"{base_name},{to_upper(officer_role)}"
            else:
                # Default to President if no role specified
                return f"{base_name},PRESIDENT"
        
        # For LLC, S-Corp, Partnership, and other entity types, just return the base name
        return base_name
    
    mapped_data = {
        "Line 1": to_upper(company_name),  # Legal name of entity (FULL NAME including LLC/L.L.C. suffix) - ALL CAPS
        "Line 2": "",  # Trade name (if different, usually empty)
        "Line 3": to_upper(company_street_line1),  # Mailing address line 1 (same as street address)
        "Line 4a": "12550 BISCAYNE BLVD STE 110",  # Mailing address line 2 (Avenida Legal address) - HARDCODED
        "Line 4b": "MIAMI FL, 33181",  # City, State, ZIP (mailing - Avenida Legal) - HARDCODED - Note: No comma after MIAMI
        "Line 5a": to_upper(company_street_line1) if company_street_line1 else "",  # Street address line 1 (ONLY street address, NOT full address)
        "Line 5b": to_upper(f"{company_city}, {company_state} {company_zip}".strip()) if (company_city or company_state or company_zip) else "",  # City, State, ZIP (from Company Address column in Airtable)
        "Line 6": to_upper(f"{company_city}, {company_state}".strip(", ")) if company_city and company_state else to_upper(company_city_state_zip),  # City, State (Company's US City and State)
        "Line 7a": to_upper(responsible_name),  # Responsible party name - ALL CAPS
        "Line 7b": format_ssn(responsible_ssn),  # Responsible party SSN/ITIN/EIN - formatted as XXX-XX-XXXX
        "8b": "",  # Will be set to member count if LLC, or date if not LLC
        "8b_date": date_business_started,  # Date business started (for non-LLC)
        "9b": to_upper(formation_state or "FL"),  # Closing month / State of incorporation - ALL CAPS
        "10": to_upper(translate_to_english(form_data.get("summarizedBusinessPurpose", business_purpose or "General business operations"))[:45]),  # Summarized Business Purpose (max 45 chars, ALL CAPS) - translated from Spanish
        "11": format_payment_date(form_data.get("dateBusinessStarted", form_data.get("paymentDate", ""))),  # Date business started in (month, day, year) format - use paymentDate as fallback
        "12": "DECEMBER",  # Closing month of accounting year - always DECEMBER
        "13": {
            "Agricultural": "0",
            "Household": "0",
            "Other": "0"
        },
        "15": "N/A",  # First date wages paid - always N/A
        "17": to_upper(translate_to_english(form_data.get("line17PrincipalMerchandise", ""))[:168]),  # Principal line of merchandise/construction/products/services (max 168 chars, ALL CAPS) - translated from Spanish
        "Designee Name": format_designee_name(form_data, entity_type),  # ALL CAPS - includes officer title for C-Corp only
        "Designee Address": "10634 NE 11 AVE, MIAMI, FL, 33138",  # ALL CAPS
        "Designee Phone": "(786) 512-0434",  # Updated phone number
        "Designee Fax": "866-496-4957",  # Updated fax number
        "Applicant Phone": to_upper(form_data.get("applicantPhone", "")),  # Business Phone from Airtable - ALL CAPS
        "Applicant Fax": "",  # Usually empty
        "Signature Name": format_signature_name(responsible_name, is_llc, owner_count) if not signature_name else (to_upper(signature_name) if ",MEMBER" in signature_name.upper() or ",SOLE MEMBER" in signature_name.upper() else format_signature_name(responsible_name, is_llc, owner_count)),  # Always ensure ",MEMBER" or ",SOLE MEMBER" suffix
        "Checks": {}
    }
    
    # Line 8a: Is this a LLC? (Checkbox)
    if is_llc:
        mapped_data["Checks"]["8a_yes"] = CHECK_COORDS["8a_yes"]  # Check "Yes" for LLC
        # Line 8b: Number of LLC members (required for LLC)
        if llc_member_count:
            mapped_data["8b"] = str(llc_member_count)  # Member count for LLC
        else:
            mapped_data["8b"] = "1"  # Default to 1 if not specified
        # Line 8c: If LLC, check "Yes" if all members are individuals
        # For now, assume yes if we have owner SSN
        if responsible_ssn and responsible_ssn.upper() not in ['N/A-FOREIGN', 'N/A', '']:
            mapped_data["Checks"]["8c_yes"] = CHECK_COORDS["8c_yes"]
    else:
        # For non-LLC (C-Corp, etc.), check "No" and move 25 pixels to the right
        mapped_data["Checks"]["8a_no"] = CHECK_COORDS["8a_no"]  # Check "No" for C-Corp
        # For non-LLC, Line 8b is empty (only used for LLC member count)
        mapped_data["8b"] = ""  # Empty for non-LLC entities
    
    # Line 9a: Type of entity (Checkboxes)
    # Position depends on whether it's a sole proprietor or not
    # Sole proprietor: 1 member/shareholder with 100% ownership -> move 15 pixels up (64, 511)
    # Not sole proprietor: -> stays where it is (64, 496)
    entity_type_upper = entity_type.upper()
    checkbox_position = "9a_sole" if is_sole_proprietor else "9a"
    
    # IMPORTANT: If sole proprietor (single member with 100% ownership), check "Sole proprietor" checkbox
    # For sole proprietors, we check "Sole proprietor" regardless of entity type (LLC, C-Corp, etc.)
    if is_sole_proprietor:
        # Check "Sole proprietor" checkbox
        mapped_data["Checks"]["9a_sole"] = CHECK_COORDS["9a_sole"]
    elif is_llc:
        # LLC checkbox (only if NOT sole proprietor)
        mapped_data["Checks"]["9a_llc"] = CHECK_COORDS["9a"]
    elif "CORP" in entity_type_upper or "INC" in entity_type_upper or "C-CORP" in entity_type_upper:
        # C-Corp: Corporation checkbox (only if NOT sole proprietor)
        mapped_data["Checks"]["9a_corp"] = CHECK_COORDS["9a"]
        mapped_data["9a_corp_form_number"] = "1120"  # Form number for C-Corp (75px to the right of checkbox)
        # Line 9b: State of incorporation (ALL CAPS from Formation State column in Airtable)
        mapped_data["9b"] = (formation_state or "FL").upper()
    elif "S-CORP" in entity_type_upper or "S CORP" in entity_type_upper:
        # S-Corp: S Corporation checkbox (only if NOT sole proprietor)
        mapped_data["Checks"]["9a_scorp"] = CHECK_COORDS["9a"]
        # Add form number "1120-S" for S-Corp (75px to the right of checkbox)
        mapped_data["9a_corp_form_number"] = "1120-S"  # Form number for S-Corp
        # Line 9b: State of incorporation (ALL CAPS from Formation State column in Airtable)
        mapped_data["9b"] = (formation_state or "FL").upper()
    elif "PARTNERSHIP" in entity_type_upper:
        # Partnership checkbox (only if NOT sole proprietor)
        mapped_data["Checks"]["9a_partnership"] = CHECK_COORDS["9a"]
    else:
        # Other entity type (only if NOT sole proprietor)
        mapped_data["Checks"]["9a_other"] = CHECK_COORDS["9a"]
    
    # Line 9a: If sole proprietor, add SSN to the field next to the "Sole proprietor" checkbox
    # Use same SSN as Line 7b (or "N/A-FOREIGN" if no SSN) - formatted as XXX-XX-XXXX
    # IMPORTANT: This applies to ALL sole proprietors, regardless of entity type (LLC, C-Corp, etc.)
    if is_sole_proprietor:
        if responsible_ssn and responsible_ssn.upper() not in ['N/A-FOREIGN', 'N/A', '']:
            mapped_data["9a_sole_ssn"] = format_ssn(responsible_ssn)  # Formatted as XXX-XX-XXXX
        else:
            mapped_data["9a_sole_ssn"] = "N/A-FOREIGN"  # Same as Line 7b when no SSN
    
    # Line 10: Reason for applying (Checkbox - "Started new business")
    mapped_data["Checks"]["10_started"] = CHECK_COORDS["10"]
    
    # Line 14: First date wages paid (Checkbox - "Will not have employees")
    mapped_data["Checks"]["14_no_employees"] = CHECK_COORDS["14"]
    
    # Line 16: Principal activity checkbox (categorized from Business Purpose via OpenAI)
    line16_category = form_data.get("line16Category", "")
    line16_other_specify = form_data.get("line16OtherSpecify", "")
    
    if line16_category:
        # Map OpenAI category to checkbox (category names match OpenAI response)
        category_lower = line16_category.lower().strip()
        if category_lower == "construction":
            mapped_data["Checks"]["16_construction"] = CHECK_COORDS["16_construction"]
        elif category_lower == "rental":
            mapped_data["Checks"]["16_rental"] = CHECK_COORDS["16_rental"]
        elif category_lower == "transportation":
            mapped_data["Checks"]["16_transportation"] = CHECK_COORDS["16_transportation"]
        elif category_lower == "healthcare":
            mapped_data["Checks"]["16_healthcare"] = CHECK_COORDS["16_healthcare"]
        elif category_lower == "accommodation":
            mapped_data["Checks"]["16_accommodation"] = CHECK_COORDS["16_accommodation"]
        elif category_lower == "wholesale_broker":
            mapped_data["Checks"]["16_wholesale_broker"] = CHECK_COORDS["16_wholesale_broker"]
        elif category_lower == "wholesale_other":
            mapped_data["Checks"]["16_wholesale_other"] = CHECK_COORDS["16_wholesale_other"]
        elif category_lower == "retail":
            mapped_data["Checks"]["16_retail"] = CHECK_COORDS["16_retail"]
        elif category_lower == "real_estate":
            mapped_data["Checks"]["16_real_estate"] = CHECK_COORDS["16_real_estate"]
        elif category_lower == "manufacturing":
            mapped_data["Checks"]["16_manufacturing"] = CHECK_COORDS["16_manufacturing"]
        elif category_lower == "finance":
            mapped_data["Checks"]["16_finance"] = CHECK_COORDS["16_finance"]
        elif category_lower == "other" or line16_other_specify:
            # Use "Other" checkbox with custom specification
            mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
            if line16_other_specify:
                mapped_data["16_other_specify"] = to_upper(translate_to_english(line16_other_specify)[:45])  # Max 45 chars, ALL CAPS - translated from Spanish
            else:
                # Default specification if none provided
                mapped_data["16_other_specify"] = to_upper(translate_to_english(business_purpose or "GENERAL BUSINESS")[:45])
        else:
            # Default to "Other" if category doesn't match any known category
            mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
            if line16_other_specify:
                mapped_data["16_other_specify"] = to_upper(translate_to_english(line16_other_specify)[:45])  # Translated from Spanish
            else:
                mapped_data["16_other_specify"] = to_upper(translate_to_english(business_purpose or "GENERAL BUSINESS")[:45])
    elif line16_other_specify:
        # If only other_specify is provided, check "Other"
        mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
        mapped_data["16_other_specify"] = to_upper(translate_to_english(line16_other_specify)[:45])  # Translated from Spanish
    
    # Line 17: Has applicant applied for EIN before? (default to No)
    # No checkbox needed if answer is No
    
    # Line 18: Has applicant applied for EIN before? - Always "No" checked
    mapped_data["Checks"]["18_no"] = CHECK_COORDS["18_no"]
    
    return mapped_data

def create_overlay(data, path):
    """
    Create overlay PDF with form data for SS-4.
    Data should be in SS-4 field format (use map_data_to_ss4_fields first)
    
    Handles:
    - Text fields (company name, addresses, SSN, etc.)
    - Checkboxes (entity type, LLC status, reason for applying, etc.)
    - Special fields (Line 8b for LLC member count, Line 9b for state of incorporation)
    """
    print("===> Creating overlay for SS-4...")
    c = canvas.Canvas(path)
    c.setFont("Helvetica", 9)
    
    # Fill text fields
    print(f"===> Starting to draw text fields. Total fields in FIELD_COORDS: {len(FIELD_COORDS)}")
    print(f"===> Data keys available: {list(data.keys())}")
    
    for field, coord in FIELD_COORDS.items():
        if field.startswith("13_"):
            # Line 13: Number of employees (Agricultural, Household, Other)
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
            # Draw if value exists and is not None (but allow empty strings for fields that should be empty)
            # Special handling for fields that should always be drawn (like "15" which is "N/A")
            should_draw = False
            if value is not None:
                if isinstance(value, str):
                    # Draw if not empty, or if it's a field that should always be drawn (hardcoded fields)
                    # Always draw hardcoded fields (Line 4a, 4b, 12, 15) even if empty
                    if value.strip() or field in ["15", "Line 4a", "Line 4b", "12"]:  # Always draw hardcoded fields
                        should_draw = True
                    # For hardcoded fields, ensure we have a value
                    if field in ["Line 4a", "Line 4b", "12", "15"] and not value.strip():
                        # These should never be empty, but if they are, use default values
                        if field == "Line 4a":
                            value = "12550 BISCAYNE BLVD STE 110"
                        elif field == "Line 4b":
                            value = "MIAMI FL, 33181"
                        elif field == "12":
                            value = "DECEMBER"
                        elif field == "15":
                            value = "N/A"
                        should_draw = True
                else:
                    # Non-string values (shouldn't happen, but handle it)
                    should_draw = True
            
            if should_draw:
                # Convert to uppercase for SS-4 (all content must be ALL CAPS)
                value_str = str(value).upper()
                # Truncate long values to fit in field (but allow longer for specific fields)
                if field == "17":  # Line 17 can be up to 168 chars
                    max_length = 168
                elif field == "10":  # Line 10 can be up to 45 chars
                    max_length = 45
                elif field in ["Line 1", "Line 3", "Line 5a", "Line 5b", "Designee Address"]:  # Longer fields
                    max_length = 80
                else:
                    max_length = 50  # Default max length
                if len(value_str) > max_length:
                    value_str = value_str[:max_length]
                # Draw the text
                try:
                    c.drawString(coord[0], coord[1], value_str)
                    print(f"===> ✅ Drew field '{field}' at {coord}: '{value_str[:50]}'")
                except Exception as e:
                    print(f"===> ❌ Error drawing field '{field}' at {coord}: {e}")
                    print(f"===> Value: {value_str[:50]}...")
            else:
                # Always draw hardcoded fields even if empty
                if field in ["Line 4a", "Line 4b", "15", "12"]:
                    # These should always have values
                    print(f"===> ⚠️ WARNING: Field '{field}' should have a value but is empty!")
                else:
                    print(f"===> ⚠️ Skipping field '{field}' - value is None or empty: '{value}'")
        else:
            # Field not in data - log important missing fields
            if field in ["10", "11", "12", "15", "17", "Line 4a", "Line 4b", "Line 5a", "Line 5b", "Line 6", "Designee Name", "Designee Address", "Designee Phone", "Designee Fax", "Applicant Phone", "Signature Name", "8b", "9b"]:
                print(f"===> ⚠️ Field '{field}' NOT FOUND in data")
    
    # Handle Line 16 "Other" specification text field (if present)
    if "16_other_specify" in data:
        other_specify = str(data["16_other_specify"]).upper()[:45]  # Max 45 chars, ALL CAPS
        if other_specify and "16_other_specify" in FIELD_COORDS:
            coord = FIELD_COORDS["16_other_specify"]
            c.drawString(coord[0], coord[1], other_specify)
    
    # Handle Line 9a form number field (1120 for C-Corp, 1120-S for S-Corp)
    if "9a_corp_form_number" in data:
        form_number = str(data["9a_corp_form_number"]).upper()
        # Determine Y coordinate based on whether it's sole proprietor or not
        # Check if 9a_corp checkbox is at sole position (484) or regular position (496)
        checks = data.get("Checks", {})
        if "9a_corp" in checks:
            corp_coords = checks["9a_corp"]
            if isinstance(corp_coords, (list, tuple)) and len(corp_coords) >= 2:
                corp_y = corp_coords[1]
                # Form number is 75px to the right of checkbox
                form_x = corp_coords[0] + 75
                form_y = corp_y
                c.drawString(form_x, form_y, form_number)
        elif "9a_scorp" in checks:
            scorp_coords = checks["9a_scorp"]
            if isinstance(scorp_coords, (list, tuple)) and len(scorp_coords) >= 2:
                scorp_y = scorp_coords[1]
                # Form number is 75px to the right of checkbox
                form_x = scorp_coords[0] + 75
                form_y = scorp_y
                c.drawString(form_x, form_y, form_number)
    
    # Line 8b is handled in the main field loop above (FIELD_COORDS["8b"])
    # It will show LLC member count for LLCs, or be empty for non-LLCs
    
    # Fill checkboxes from Checks dictionary
    checks = data.get("Checks", {})
    print(f"===> Drawing checkboxes. Total checks: {len(checks)}")
    print(f"===> Checkbox keys: {list(checks.keys())}")
    for label, coords in checks.items():
        if isinstance(coords, list) and len(coords) >= 2:
            x, y = coords[0], coords[1]
            # Draw checkmark (X) for checkbox
            c.drawString(x, y, "X")
            print(f"===> ✅ Drew checkbox '{label}' at ({x}, {y})")
        elif isinstance(coords, tuple) and len(coords) >= 2:
            x, y = coords[0], coords[1]
            c.drawString(x, y, "X")
            print(f"===> ✅ Drew checkbox '{label}' at ({x}, {y})")
    
    # Special checkbox handling for entity types (Line 9a)
    # Position depends on whether it's a sole proprietor or not
    # The checkbox position is already set in the Checks dictionary with the correct coordinates
    # Just draw the X at the coordinates provided
    if "9a_llc" in checks:
        coords = checks["9a_llc"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
    elif "9a_corp" in checks:
        coords = checks["9a_corp"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
    elif "9a_scorp" in checks:
        coords = checks["9a_scorp"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
    elif "9a_partnership" in checks:
        coords = checks["9a_partnership"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
    elif "9a_other" in checks:
        coords = checks["9a_other"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
    
    # Line 8a: Is this a LLC? (Yes checkbox for LLC, No checkbox for C-Corp)
    if "8a_yes" in checks:
        c.drawString(CHECK_COORDS["8a_yes"][0], CHECK_COORDS["8a_yes"][1], "X")
    elif "8a_no" in checks:
        c.drawString(CHECK_COORDS["8a_no"][0], CHECK_COORDS["8a_no"][1], "X")
    
    # Line 8c: If LLC, are all members individuals? (Yes checkbox)
    if "8c_yes" in checks:
        c.drawString(CHECK_COORDS["8c_yes"][0], CHECK_COORDS["8c_yes"][1], "X")
    
    # Line 10: Reason for applying - Started new business
    if "10_started" in checks:
        c.drawString(CHECK_COORDS["10"][0], CHECK_COORDS["10"][1], "X")
        print(f"===> ✅ Drew Line 10 checkbox at {CHECK_COORDS['10']}")
    else:
        print(f"===> ⚠️ Line 10 checkbox NOT FOUND in checks")
    
    # Line 14: First date wages paid - Will not have employees
    if "14_no_employees" in checks:
        c.drawString(CHECK_COORDS["14"][0], CHECK_COORDS["14"][1], "X")
        print(f"===> ✅ Drew Line 14 checkbox at {CHECK_COORDS['14']}")
    else:
        print(f"===> ⚠️ Line 14 checkbox NOT FOUND in checks")
    
    # Line 18: Has applicant applied for EIN before? - Always "No" checked
    if "18_no" in checks:
        coords = checks["18_no"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
            print(f"===> ✅ Drew Line 18 checkbox at {coords}")
        else:
            print(f"===> ⚠️ Line 18 checkbox has invalid coordinates: {coords}")
    else:
        print(f"===> ⚠️ Line 18 checkbox NOT FOUND in checks")
    
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
        print(f"===> Form data keys: {list(form_data.keys())}")
        print(f"===> Company name: {form_data.get('companyName', 'NOT FOUND')}")
        print(f"===> Entity type: {form_data.get('entityType', 'NOT FOUND')}")
        print(f"===> Is LLC: {form_data.get('isLLC', 'NOT FOUND')}")
        print(f"===> Company address: {form_data.get('companyAddress', 'NOT FOUND')}")
        print(f"===> Payment date: {form_data.get('paymentDate', form_data.get('dateBusinessStarted', 'NOT FOUND'))}")
        print(f"===> Signature name: {form_data.get('signatureName', 'NOT FOUND')}")
        ss4_fields = map_data_to_ss4_fields(form_data)
        print(f"===> Mapped {len(ss4_fields)} fields")
        print(f"===> Line 4a: {ss4_fields.get('Line 4a', 'NOT FOUND')}")
        print(f"===> Line 4b: {ss4_fields.get('Line 4b', 'NOT FOUND')}")
        print(f"===> Line 5a: {ss4_fields.get('Line 5a', 'NOT FOUND')}")
        print(f"===> Line 5b: {ss4_fields.get('Line 5b', 'NOT FOUND')}")
        print(f"===> Line 6: {ss4_fields.get('Line 6', 'NOT FOUND')}")
        print(f"===> ========== ALL SS-4 FIELD VALUES ==========")
        print(f"===> Line 1: '{ss4_fields.get('Line 1', 'NOT FOUND')}'")
        print(f"===> Line 2: '{ss4_fields.get('Line 2', 'NOT FOUND')}'")
        print(f"===> Line 3: '{ss4_fields.get('Line 3', 'NOT FOUND')}'")
        print(f"===> Line 4a: '{ss4_fields.get('Line 4a', 'NOT FOUND')}'")
        print(f"===> Line 4b: '{ss4_fields.get('Line 4b', 'NOT FOUND')}'")
        print(f"===> Line 5a: '{ss4_fields.get('Line 5a', 'NOT FOUND')}'")
        print(f"===> Line 5b: '{ss4_fields.get('Line 5b', 'NOT FOUND')}'")
        print(f"===> Line 6: '{ss4_fields.get('Line 6', 'NOT FOUND')}'")
        print(f"===> Line 7a: '{ss4_fields.get('Line 7a', 'NOT FOUND')}'")
        print(f"===> Line 7b: '{ss4_fields.get('Line 7b', 'NOT FOUND')}'")
        print(f"===> Line 8b: '{ss4_fields.get('8b', 'NOT FOUND')}'")
        print(f"===> Line 9b: '{ss4_fields.get('9b', 'NOT FOUND')}'")
        print(f"===> Line 10: '{ss4_fields.get('10', 'NOT FOUND')}'")
        print(f"===> Line 11: '{ss4_fields.get('11', 'NOT FOUND')}'")
        print(f"===> Line 12: '{ss4_fields.get('12', 'NOT FOUND')}'")
        print(f"===> Line 15: '{ss4_fields.get('15', 'NOT FOUND')}'")
        print(f"===> Line 17: '{ss4_fields.get('17', 'NOT FOUND')}'")
        print(f"===> Designee Name: '{ss4_fields.get('Designee Name', 'NOT FOUND')}'")
        print(f"===> Designee Address: '{ss4_fields.get('Designee Address', 'NOT FOUND')}'")
        print(f"===> Designee Phone: '{ss4_fields.get('Designee Phone', 'NOT FOUND')}'")
        print(f"===> Designee Fax: '{ss4_fields.get('Designee Fax', 'NOT FOUND')}'")
        print(f"===> Applicant Phone: '{ss4_fields.get('Applicant Phone', 'NOT FOUND')}'")
        print(f"===> Applicant Fax: '{ss4_fields.get('Applicant Fax', 'NOT FOUND')}'")
        print(f"===> Signature Name: '{ss4_fields.get('Signature Name', 'NOT FOUND')}'")
        print(f"===> ============================================")
        checks = ss4_fields.get('Checks', {})
        print(f"===> Checks found: {list(checks.keys())}")
        print(f"===> Line 8a_yes: {'8a_yes' in checks}")
        print(f"===> Line 8a_no: {'8a_no' in checks}")
        print(f"===> Line 8c_yes: {'8c_yes' in checks}")
        print(f"===> Line 9a_llc: {'9a_llc' in checks}")
        print(f"===> Line 9a_partnership: {'9a_partnership' in checks}")
        print(f"===> Line 10 checkbox: {'10_started' in checks}")
        print(f"===> Line 14 checkbox: {'14_no_employees' in checks}")
        print(f"===> Line 16 checkbox: {[k for k in checks.keys() if k.startswith('16_')]}")
        print(f"===> Line 18 checkbox: {'18_no' in checks}")
        print(f"===> All mapped data keys: {list(ss4_fields.keys())}")
        
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

