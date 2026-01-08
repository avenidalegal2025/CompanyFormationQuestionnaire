import os
import json
import tempfile
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
import boto3
import re
import urllib.request
import urllib.parse

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
    "Line 6": (65, 594),      # County, State (converted from city)
    "Line 7a": (65, 570),     # Responsible party name
    "Line 7b": (342, 570),    # Responsible party SSN
    "8b": (500, 542),        # Number of LLC members (if LLC) or date business started (if non-LLC)
    "9a_sole_ssn": (164, 509), # Sole proprietor SSN (100 pixels to the right of 9a_sole checkbox at 64)
    "9b": (290, 414),        # Closing month / State of incorporation
    "16_other_specify": (400, 196),  # Other (specify) text field - same position as healthcare checkbox (where the category description goes)
    "10": (65, 375),         # Reason for applying - text field (summarized business purpose)
    "11": (115, 317),        # Date business started in MM/DD/YYYY format
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
    "9a": [64, 496],          # Partnership / default position
    "9a_corp": [64, 483],     # Corporation (non-sole proprietor) - 24px up from previous position (459 + 24 = 483)
    "9a_sole": [64, 509],     # Entity type checkbox (sole proprietor) - 13 pixels up (496 + 13 = 509)
    "9a_corp_sole": [64, 484], # Corporation checkbox (sole proprietor) - 25 pixels below Partnership sole (509 - 25 = 484)
    "9a_corp_form_number": (244, 485),  # Form number input field (1120 or 1120-S) - X: 244, Y: 485
    "9a_corp_sole_form_number": (244, 485),  # Form number input field for sole proprietor (1120 or 1120-S) - X: 244, Y: 485
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
    company_name_raw = translate_to_english(form_data.get("companyName", ""))
    print(f"===> Company name RAW (before cleaning): '{company_name_raw}'")
    # Clean company name: Remove any address that might be concatenated
    # Common patterns: "Company Name 123 Street" or "Company Name, 123 Street" or "Company Name 1150 BROADWAY"
    # AGGRESSIVE cleaning: Remove any part that looks like an address
    company_name = company_name_raw
    if company_name:
        import re
        # First, split by comma and take only the first part if second part looks like an address
        parts = company_name.split(',')
        if len(parts) > 1:
            # Check if any part after the first looks like an address
            for i in range(1, len(parts)):
                part = parts[i].strip().upper()
                # Check if this part contains address indicators
                if re.search(r'\d+.*(STREET|ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CIRCLE|CIR|BROADWAY)', part):
                    # This part is an address, use only parts before it
                    company_name = ','.join(parts[:i]).strip()
                    break
        
        # Remove any standalone address patterns anywhere in the string
        # Pattern 1: Number followed by street name (e.g., "1150 BROADWAY", "123 MAIN STREET")
        # This matches: optional space, number, optional space, street name
        address_patterns = [
            r'\s+\d+\s+(STREET|ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CIRCLE|CIR|BROADWAY)\s*$',  # At end
            r'\s+\d+\s+(STREET|ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CIRCLE|CIR|BROADWAY)\s+',  # In middle
            r'^\s*\d+\s+(STREET|ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CIRCLE|CIR|BROADWAY)\s+',  # At start
        ]
        for pattern in address_patterns:
            company_name = re.sub(pattern, ' ', company_name, flags=re.IGNORECASE).strip()
        
        # Also check for patterns like "1150 BROADWAY" (number + space + street name, no comma)
        # This is more specific: match a number followed by a street name word
        standalone_address = r'\s+\d+\s+(BROADWAY|STREET|ST|AVE|AVENUE|BLVD|BOULEVARD|DR|DRIVE|RD|ROAD|LN|LANE|CT|COURT|PL|PLACE|WAY|CIRCLE|CIR)\s*'
        company_name = re.sub(standalone_address, ' ', company_name, flags=re.IGNORECASE).strip()
        
        # Clean up any extra spaces
        company_name = re.sub(r'\s+', ' ', company_name).strip()
    
    print(f"===> Company name CLEANED (after removing addresses): '{company_name}'")
    
    company_name_base = translate_to_english(form_data.get("companyNameBase", company_name))
    entity_type = form_data.get("entityType", "")  # Entity type codes don't need translation
    business_purpose = translate_to_english(form_data.get("businessPurpose", ""))
    formation_state = form_data.get("formationState", "")  # State names are usually in English
    
    # Company address - parse from Company Address field (should include full address: street, city, state, zip)
    # DO NOT translate addresses - keep original format
    company_address = form_data.get("companyAddress", "")
    
    # Check if company address is Avenida Legal's address (US Address service purchased)
    # If so, Line 5a and 5b should be blank
    # Avenida Legal address format: "12550 Biscayne Blvd Ste 110, North Miami, FL 33181"
    is_avenida_legal_address = False
    if company_address:
        company_address_upper = company_address.upper()
        # Check for Avenida Legal address by looking for key identifiers:
        # - Street: "12550" and "BISCAYNE" (or "BISC")
        # - City: "NORTH MIAMI" or "MIAMI" 
        # - ZIP: "33181"
        # Match if street contains 12550 and BISCAYNE, and address contains 33181
        has_street = "12550" in company_address_upper and ("BISCAYNE" in company_address_upper or "BISC" in company_address_upper)
        has_zip = "33181" in company_address
        if has_street and has_zip:
            is_avenida_legal_address = True
            print(f"===> Detected Avenida Legal address (US Address service purchased): '{company_address}'")
            print(f"===> Line 5a and 5b will be left blank")
    
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
    # CRITICAL: Must handle multi-word states like "NEW YORK", "NEW JERSEY", "NORTH CAROLINA", etc.
    company_city = ""
    company_state = ""
    company_zip = ""
    
    # List of valid US states (2-letter codes and full names including multi-word)
    US_STATES = {
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
        'DC', 'PR', 'VI', 'GU', 'AS', 'MP'
    }
    US_STATE_NAMES = {
        'ALABAMA', 'ALASKA', 'ARIZONA', 'ARKANSAS', 'CALIFORNIA', 'COLORADO',
        'CONNECTICUT', 'DELAWARE', 'FLORIDA', 'GEORGIA', 'HAWAII', 'IDAHO',
        'ILLINOIS', 'INDIANA', 'IOWA', 'KANSAS', 'KENTUCKY', 'LOUISIANA',
        'MAINE', 'MARYLAND', 'MASSACHUSETTS', 'MICHIGAN', 'MINNESOTA', 'MISSISSIPPI',
        'MISSOURI', 'MONTANA', 'NEBRASKA', 'NEVADA', 'NEW HAMPSHIRE', 'NEW JERSEY',
        'NEW MEXICO', 'NEW YORK', 'NORTH CAROLINA', 'NORTH DAKOTA', 'OHIO', 'OKLAHOMA',
        'OREGON', 'PENNSYLVANIA', 'RHODE ISLAND', 'SOUTH CAROLINA', 'SOUTH DAKOTA',
        'TENNESSEE', 'TEXAS', 'UTAH', 'VERMONT', 'VIRGINIA', 'WASHINGTON',
        'WEST VIRGINIA', 'WISCONSIN', 'WYOMING', 'DISTRICT OF COLUMBIA', 'PUERTO RICO',
        'VIRGIN ISLANDS', 'GUAM', 'AMERICAN SAMOA', 'NORTHERN MARIANA ISLANDS'
    }
    
    if company_city_state_zip:
        # Try to parse: "City State ZIP" or "City, State ZIP"
        # First, try splitting by comma
        city_state_parts = company_city_state_zip.split(",")
        if len(city_state_parts) >= 2:
            # Format: "City, State ZIP"
            company_city = city_state_parts[0].strip().strip(',').strip()  # Remove any leading/trailing commas
            state_zip_str = city_state_parts[1].strip()
            state_zip_parts = state_zip_str.split()
            
            # Check if last part is ZIP (5 digits)
            if state_zip_parts and state_zip_parts[-1].isdigit() and len(state_zip_parts[-1]) == 5:
                company_zip = state_zip_parts[-1]
                state_parts = state_zip_parts[:-1]
            else:
                state_parts = state_zip_parts
            
            # Try to match state: check 2-letter code first, then multi-word states
            if len(state_parts) >= 2:
                # Try last 2 words as state name (e.g., "NEW YORK", "NORTH CAROLINA")
                two_word_state = " ".join(state_parts[-2:]).upper()
                if two_word_state in US_STATE_NAMES:
                    company_state = two_word_state
                    # Everything before is city (if any remaining)
                    if len(state_parts) > 2:
                        company_city = f"{company_city} {''.join(state_parts[:-2])}".strip()
                elif len(state_parts) >= 3:
                    # Try last 3 words (e.g., "NORTH CAROLINA", "SOUTH CAROLINA")
                    three_word_state = " ".join(state_parts[-3:]).upper()
                    if three_word_state in US_STATE_NAMES:
                        company_state = three_word_state
                        if len(state_parts) > 3:
                            company_city = f"{company_city} {''.join(state_parts[:-3])}".strip()
                    else:
                        # Fallback: use last word as state (might be 2-letter code)
                        company_state = state_parts[-1].upper()
                        if len(state_parts) > 1:
                            company_city = f"{company_city} {''.join(state_parts[:-1])}".strip()
                else:
                    # Use last word as state
                    company_state = state_parts[-1].upper()
                    if len(state_parts) > 1:
                        company_city = f"{company_city} {''.join(state_parts[:-1])}".strip()
            elif len(state_parts) == 1:
                company_state = state_parts[0].upper()
        else:
            # Format: "City State ZIP" - try to parse by spaces
            # Must handle multi-word states
            parts = company_city_state_zip.split()
            if len(parts) >= 3:
                # Check if last part is ZIP (5 digits)
                if parts[-1].isdigit() and len(parts[-1]) == 5:
                    company_zip = parts[-1]
                    remaining = parts[:-1]
                else:
                    remaining = parts
                    # Last part might be ZIP even if not 5 digits
                    if parts[-1].isdigit():
                        company_zip = parts[-1]
                        remaining = parts[:-1]
                
                # Try to match state from the end
                if len(remaining) >= 2:
                    # Try last 2 words as state
                    two_word_state = " ".join(remaining[-2:]).upper()
                    if two_word_state in US_STATE_NAMES:
                        company_state = two_word_state
                        company_city = " ".join(remaining[:-2]).strip(',').strip()
                    elif len(remaining) >= 3:
                        # Try last 3 words
                        three_word_state = " ".join(remaining[-3:]).upper()
                        if three_word_state in US_STATE_NAMES:
                            company_state = three_word_state
                            company_city = " ".join(remaining[:-3]).strip(',').strip()
                        else:
                            # Check if second to last is 2-letter state code
                            if len(remaining[-2]) == 2 and remaining[-2].upper() in US_STATES:
                                company_state = remaining[-2].upper()
                                company_city = " ".join(remaining[:-2]).strip(',').strip()
                            else:
                                # Fallback: assume last word is state
                                company_state = remaining[-1].upper()
                                company_city = " ".join(remaining[:-1]).strip(',').strip()
                    else:
                        # Check if last word is 2-letter state code
                        if len(remaining[-1]) == 2 and remaining[-1].upper() in US_STATES:
                            company_state = remaining[-1].upper()
                            company_city = " ".join(remaining[:-1]).strip(',').strip()
                        else:
                            # Fallback: use last word as state
                            company_state = remaining[-1].upper()
                            company_city = " ".join(remaining[:-1]).strip(',').strip()
                else:
                    # Only 1-2 parts left
                    if len(remaining) == 2:
                        # Check if second is 2-letter state code
                        if len(remaining[1]) == 2 and remaining[1].upper() in US_STATES:
                            company_state = remaining[1].upper()
                            company_city = remaining[0].strip(',').strip()
                        else:
                            company_state = remaining[1].upper()
                            company_city = remaining[0].strip(',').strip()
                    else:
                        company_city = remaining[0].strip(',').strip() if remaining else ""
            elif len(parts) == 2:
                # Could be "City State" or "State ZIP"
                # If second part is 2 letters, it's State; if it's digits, it's ZIP
                if len(parts[1]) == 2 and parts[1].upper() in US_STATES:
                    company_city = parts[0].strip(',').strip()
                    company_state = parts[1].upper()
                elif parts[1].isdigit():
                    company_state = parts[0].upper()
                    company_zip = parts[1]
                else:
                    # Assume "City State" where state might be full name
                    company_city = parts[0].strip(',').strip()
                    company_state = parts[1].upper()
            else:
                # Single part - assume it's city
                company_city = parts[0].strip(',').strip() if parts else ""
    
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
    
    # Debug logging for responsible party
    print(f"===> Responsible party from form_data:")
    print(f"===>   Name: '{responsible_name}'")
    print(f"===>   SSN: '{responsible_ssn}'")
    print(f"===>   Address: '{responsible_address}'")
    
    # Signature name - use pre-formatted signatureName if provided, otherwise format it
    # DO NOT translate signature name - keep original format
    signature_name = form_data.get("signatureName", "")
    print(f"===> Signature name from form_data: '{signature_name}'")
    print(f"===> Responsible party officer role: '{form_data.get('responsiblePartyOfficerRole', 'NOT FOUND')}'")
    
    # Owner information
    owner_count = form_data.get("ownerCount", 1)
    # Determine if entity is LLC - check both isLLC field and entityType
    # IMPORTANT: Check for Corporation FIRST before checking LLC or Partnership
    entity_type_upper = entity_type.upper()
    is_corp = (
        "CORP" in entity_type_upper or 
        "INC" in entity_type_upper or 
        "C-CORP" in entity_type_upper or
        "S-CORP" in entity_type_upper or
        "S CORP" in entity_type_upper
    )
    is_partnership = "PARTNERSHIP" in entity_type_upper
    
    is_llc = (
        form_data.get("isLLC", "").upper() == "YES" or 
        entity_type_upper == "LLC" or 
        "LLC" in entity_type_upper or
        "L.L.C." in entity_type_upper
    )
    # If entity type is Corporation or Partnership, it's not an LLC
    if is_corp or is_partnership:
        is_llc = False
    llc_member_count = form_data.get("llcMemberCount", owner_count if is_llc else None)
    
    # Check if sole proprietor: one member/shareholder with 100% ownership
    # For LLCs, also check llc_member_count
    is_sole_proprietor = (owner_count == 1) or (is_llc and llc_member_count == 1)
    sole_proprietor_ssn = None
    # Check ownership percentage if available
    owners = form_data.get("owners", [])
    print(f"===> ========== SOLE PROPRIETOR DETECTION ==========")
    print(f"===> owner_count: {owner_count}")
    print(f"===> owners array length: {len(owners) if owners else 0}")
    print(f"===> Initial is_sole_proprietor (based on owner_count): {is_sole_proprietor}")
    if owners and len(owners) == 1:
        owner = owners[0]
        owner_ownership = owner.get("ownership", 100)
        print(f"===> Owner ownership (raw): {owner_ownership} (type: {type(owner_ownership)})")
        # Convert to number if it's a string percentage
        if isinstance(owner_ownership, str):
            owner_ownership = float(owner_ownership.replace("%", ""))
        # Handle both decimal format (0.01 = 1%) and percentage format (1 = 1%, 100 = 100%)
        # Airtable stores percentages as decimals (0.01 = 1%, 1.0 = 100%)
        # If ownership is between 0 and 1 (exclusive), it's a decimal, so multiply by 100
        if 0 < owner_ownership < 1:
            owner_ownership = owner_ownership * 100
            print(f"===> Converted decimal to percentage: {owner_ownership}%")
        # Also handle case where it's exactly 1.0 - this could be 1% (decimal) or 100% (if already multiplied)
        # For sole proprietor, we expect 100% ownership
        # If ownership is 1.0, check if it's likely 100% (sole proprietor) or 1% (not sole proprietor)
        # Since we're checking for sole proprietor, if owner_count == 1 and ownership == 1.0, 
        # it's most likely 100% (1.0 = 100% in decimal format)
        if owner_ownership == 1.0 and owner_count == 1:
            # Assume it's 100% (1.0 in decimal format) for sole proprietor
            owner_ownership = 100
            print(f"===> Interpreted 1.0 as 100% for sole proprietor")
        # Check if ownership equals 100% (sole proprietor)
        is_sole_proprietor = (owner_ownership == 100 or owner_ownership >= 99.99)
        print(f"===> Owner ownership (final): {owner_ownership}%")
        print(f"===> is_sole_proprietor (after ownership check): {is_sole_proprietor}")
        # Get SSN if available
        if is_sole_proprietor:
            sole_proprietor_ssn = owner.get("ssn", "") or owner.get("taxId", "")
            # Clean SSN format (remove dashes, spaces)
            if sole_proprietor_ssn:
                sole_proprietor_ssn = sole_proprietor_ssn.replace("-", "").replace(" ", "")
                # Validate it's not empty, "N/A", or "FOREIGN"
                if sole_proprietor_ssn.upper() in ['N/A', 'FOREIGN', '']:
                    sole_proprietor_ssn = None
    else:
        print(f"===> No owners array or multiple owners, using owner_count check: is_sole_proprietor={is_sole_proprietor}")
    print(f"===> Final is_sole_proprietor: {is_sole_proprietor}")
    print(f"===> entity_type: {entity_type}")
    print(f"===> ==============================================")
    
    # Date business started (use payment date or current date)
    date_business_started = form_data.get("dateBusinessStarted", datetime.now().strftime("%m/%d/%Y"))
    # Convert ISO date to MM/DD/YYYY if needed
    if "-" in date_business_started:
        try:
            dt = datetime.fromisoformat(date_business_started.replace("Z", "+00:00"))
            date_business_started = dt.strftime("%m/%d/%Y")
        except:
            pass
    
    # Build city/state/zip strings - ensure no leading/trailing commas
    # Clean city and state to remove any leading/trailing commas
    responsible_city_clean = responsible_city.strip().strip(',').strip() if responsible_city else ""
    responsible_state_clean = responsible_state.strip().strip(',').strip() if responsible_state else ""
    responsible_city_state_zip = f"{responsible_city_clean}, {responsible_state_clean} {responsible_zip}".strip()
    if not responsible_city_state_zip or responsible_city_state_zip == ",":
        responsible_city_state_zip = responsible_country
    
    # Helper function to convert to uppercase
    def to_upper(text):
        return str(text).upper() if text else ""
    
    # Helper function to get county from Google Maps Geocoding API
    def get_county_from_google_maps(city, state):
        """
        Use Google Maps Geocoding API to get county name for a city/state.
        Returns county name or None if not found/error.
        """
        google_api_key = os.environ.get('GOOGLE_MAPS_API_KEY') or os.environ.get('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')
        
        if not google_api_key:
            print(f"===> ⚠️ Google Maps API key not found in environment variables")
            return None
        
        try:
            # Build address query: "City, State, USA"
            address_query = f"{city}, {state}, USA"
            encoded_address = urllib.parse.quote(address_query)
            
            # Google Maps Geocoding API endpoint
            url = f"https://maps.googleapis.com/maps/api/geocode/json?address={encoded_address}&key={google_api_key}"
            
            print(f"===> Calling Google Maps API: {url.replace(google_api_key, '***')}")
            
            # Make API request
            with urllib.request.urlopen(url, timeout=5) as response:
                data = json.loads(response.read().decode())
                
                if data.get('status') != 'OK':
                    print(f"===> ⚠️ Google Maps API returned status: {data.get('status')}")
                    return None
                
                results = data.get('results', [])
                if not results:
                    print(f"===> ⚠️ No results from Google Maps API")
                    return None
                
                # Get the first result
                result = results[0]
                address_components = result.get('address_components', [])
                
                # Look for administrative_area_level_2 (county) in address components
                for component in address_components:
                    types = component.get('types', [])
                    if 'administrative_area_level_2' in types:
                        county_name = component.get('long_name', '')
                        if county_name:
                            # Remove "County" suffix if present (e.g., "Miami-Dade County" -> "Miami-Dade")
                            county_name = county_name.replace(' County', '').replace(' county', '').strip()
                            return county_name
                
                # If no county found, try to extract from formatted_address or other components
                print(f"===> ⚠️ County not found in address components for '{city}, {state}'")
                return None
                
        except urllib.error.URLError as e:
            print(f"===> ⚠️ Error calling Google Maps API: {e}")
            return None
        except json.JSONDecodeError as e:
            print(f"===> ⚠️ Error parsing Google Maps API response: {e}")
            return None
        except Exception as e:
            print(f"===> ⚠️ Unexpected error calling Google Maps API: {e}")
            return None
    
    # Helper function to convert city and state to county
    # Returns "County, State" format (e.g., "MIAMI-DADE, FL")
    def city_to_county(city, state):
        """
        Convert city name to county name for SS-4 Line 6.
        Returns county name in format "COUNTY, STATE" or falls back to city if not found.
        """
        if not city or not state:
            print(f"===> ⚠️ city_to_county called with empty city/state: city='{city}', state='{state}'")
            return ""
        
        # Normalize inputs
        city_upper = city.upper().strip()
        state_upper = state.upper().strip()
        
        # Convert full state names to 2-letter codes for lookup
        # Keep original state for return value
        state_name_to_code = {
            'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR',
            'CALIFORNIA': 'CA', 'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE',
            'FLORIDA': 'FL', 'GEORGIA': 'GA', 'HAWAII': 'HI', 'IDAHO': 'ID',
            'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA', 'KANSAS': 'KS',
            'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
            'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS',
            'MISSOURI': 'MO', 'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV',
            'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
            'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH', 'OKLAHOMA': 'OK',
            'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
            'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT',
            'VERMONT': 'VT', 'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV',
            'WISCONSIN': 'WI', 'WYOMING': 'WY', 'DISTRICT OF COLUMBIA': 'DC',
            'PUERTO RICO': 'PR', 'VIRGIN ISLANDS': 'VI', 'GUAM': 'GU',
            'AMERICAN SAMOA': 'AS', 'NORTHERN MARIANA ISLANDS': 'MP'
        }
        
        # Convert state to 2-letter code for lookup (if it's a full name)
        state_for_lookup = state_name_to_code.get(state_upper, state_upper)
        # Keep original state for return value (use code if original was code, otherwise use original)
        state_for_return = state_upper if len(state_upper) == 2 else state_upper
        
        # Comprehensive city-to-county mapping
        # Format: (city_name, state): county_name
        city_county_map = {
            # Florida cities
            ("MIAMI", "FL"): "MIAMI-DADE",
            ("MIAMI BEACH", "FL"): "MIAMI-DADE",
            ("MIAMI GARDENS", "FL"): "MIAMI-DADE",
            ("CORAL GABLES", "FL"): "MIAMI-DADE",
            ("HIALEAH", "FL"): "MIAMI-DADE",
            ("NORTH MIAMI", "FL"): "MIAMI-DADE",
            ("AVENTURA", "FL"): "MIAMI-DADE",
            ("KEY BISCAYNE", "FL"): "MIAMI-DADE",
            ("HOMESTEAD", "FL"): "MIAMI-DADE",
            ("ORLANDO", "FL"): "ORANGE",
            ("TAMPA", "FL"): "HILLSBOROUGH",
            ("JACKSONVILLE", "FL"): "DUVAL",
            ("FORT LAUDERDALE", "FL"): "BROWARD",
            ("WEST PALM BEACH", "FL"): "PALM BEACH",
            ("PALM BEACH", "FL"): "PALM BEACH",
            ("BOCA RATON", "FL"): "PALM BEACH",
            ("DELRAY BEACH", "FL"): "PALM BEACH",
            ("ST. PETERSBURG", "FL"): "PINELLAS",
            ("SAINT PETERSBURG", "FL"): "PINELLAS",
            ("ST PETERSBURG", "FL"): "PINELLAS",
            ("CLEARWATER", "FL"): "PINELLAS",
            ("TALLAHASSEE", "FL"): "LEON",
            ("GAINESVILLE", "FL"): "ALACHUA",
            ("SARASOTA", "FL"): "SARASOTA",
            ("NAPLES", "FL"): "COLLIER",
            ("FORT MYERS", "FL"): "LEE",
            ("PENSACOLA", "FL"): "ESCAMBIA",
            ("DAYTONA BEACH", "FL"): "VOLUSIA",
            ("MELBOURNE", "FL"): "BREVARD",
            ("LAKELAND", "FL"): "POLK",
            ("OCALA", "FL"): "MARION",
            ("PORT ST. LUCIE", "FL"): "ST. LUCIE",
            ("PORT SAINT LUCIE", "FL"): "ST. LUCIE",
            ("PORT ST LUCIE", "FL"): "ST. LUCIE",
            ("BOYNTON BEACH", "FL"): "PALM BEACH",
            ("POMPANO BEACH", "FL"): "BROWARD",
            ("HOLLYWOOD", "FL"): "BROWARD",
            ("MIRAMAR", "FL"): "BROWARD",
            ("PLANTATION", "FL"): "BROWARD",
            ("SUNRISE", "FL"): "BROWARD",
            ("KENDALL", "FL"): "MIAMI-DADE",
            ("DORAL", "FL"): "MIAMI-DADE",
            ("WESTON", "FL"): "BROWARD",
            ("DELTONA", "FL"): "VOLUSIA",
            ("PALM COAST", "FL"): "FLAGLER",
            ("LARGO", "FL"): "PINELLAS",
            ("DEERFIELD BEACH", "FL"): "BROWARD",
            ("PEMBROKE PINES", "FL"): "BROWARD",
            ("CAPE CORAL", "FL"): "LEE",
            ("FORT PIERCE", "FL"): "ST. LUCIE",
            ("STUART", "FL"): "MARTIN",
            ("VERO BEACH", "FL"): "INDIAN RIVER",
            ("SEBASTIAN", "FL"): "INDIAN RIVER",
            ("JUPITER", "FL"): "PALM BEACH",
            ("TEQUESTA", "FL"): "PALM BEACH",
            ("WELLINGTON", "FL"): "PALM BEACH",
            ("ROYAL PALM BEACH", "FL"): "PALM BEACH",
            ("RIVIERA BEACH", "FL"): "PALM BEACH",
            ("LAKE WORTH", "FL"): "PALM BEACH",
            ("GREENACRES", "FL"): "PALM BEACH",
            ("WEST PALM", "FL"): "PALM BEACH",
            
            # New York cities
            ("NEW YORK", "NY"): "NEW YORK",
            ("BROOKLYN", "NY"): "KINGS",
            ("MANHATTAN", "NY"): "NEW YORK",
            ("QUEENS", "NY"): "QUEENS",
            ("BRONX", "NY"): "BRONX",
            ("THE BRONX", "NY"): "BRONX",  # Handle "The Bronx" variation
            ("STATEN ISLAND", "NY"): "RICHMOND",
            ("BUFFALO", "NY"): "ERIE",
            ("ROCHESTER", "NY"): "MONROE",
            ("ALBANY", "NY"): "ALBANY",
            ("SYRACUSE", "NY"): "ONONDAGA",
            ("YONKERS", "NY"): "WESTCHESTER",
            ("WHITE PLAINS", "NY"): "WESTCHESTER",
            ("WHITE PLAINS", "NEW YORK"): "WESTCHESTER",  # Handle full state name
            ("MOUNT VERNON", "NY"): "WESTCHESTER",
            ("NEW ROCHELLE", "NY"): "WESTCHESTER",
            ("RYE", "NY"): "WESTCHESTER",
            ("SCARSDALE", "NY"): "WESTCHESTER",
            
            # California cities
            ("LOS ANGELES", "CA"): "LOS ANGELES",
            ("SAN FRANCISCO", "CA"): "SAN FRANCISCO",
            ("SAN DIEGO", "CA"): "SAN DIEGO",
            ("SAN JOSE", "CA"): "SANTA CLARA",
            ("OAKLAND", "CA"): "ALAMEDA",
            ("SACRAMENTO", "CA"): "SACRAMENTO",
            ("FRESNO", "CA"): "FRESNO",
            ("LONG BEACH", "CA"): "LOS ANGELES",
            ("ANAHEIM", "CA"): "ORANGE",
            ("SANTA ANA", "CA"): "ORANGE",
            ("RIVERSIDE", "CA"): "RIVERSIDE",
            ("STOCKTON", "CA"): "SAN JOAQUIN",
            ("IRVINE", "CA"): "ORANGE",
            ("CHULA VISTA", "CA"): "SAN DIEGO",
            ("FREMONT", "CA"): "ALAMEDA",
            ("SAN BERNARDINO", "CA"): "SAN BERNARDINO",
            ("MODESTO", "CA"): "STANISLAUS",
            ("FONTANA", "CA"): "SAN BERNARDINO",
            ("OXNARD", "CA"): "VENTURA",
            ("MORENO VALLEY", "CA"): "RIVERSIDE",
            ("HUNTINGTON BEACH", "CA"): "ORANGE",
            ("GLENDALE", "CA"): "LOS ANGELES",
            ("SANTA CLARITA", "CA"): "LOS ANGELES",
            ("GARDEN GROVE", "CA"): "ORANGE",
            ("OCEANSIDE", "CA"): "SAN DIEGO",
            ("RANCHO CUCAMONGA", "CA"): "SAN BERNARDINO",
            ("SANTA ROSA", "CA"): "SONOMA",
            ("ONTARIO", "CA"): "SAN BERNARDINO",
            ("LANCASTER", "CA"): "LOS ANGELES",
            ("ELK GROVE", "CA"): "SACRAMENTO",
            ("CORONA", "CA"): "RIVERSIDE",
            ("PALMDALE", "CA"): "LOS ANGELES",
            ("SALINAS", "CA"): "MONTEREY",
            ("POMONA", "CA"): "LOS ANGELES",
            ("HAYWARD", "CA"): "ALAMEDA",
            ("ESCONDIDO", "CA"): "SAN DIEGO",
            ("TORRANCE", "CA"): "LOS ANGELES",
            ("SUNNYVALE", "CA"): "SANTA CLARA",
            ("ORANGE", "CA"): "ORANGE",
            ("FULLERTON", "CA"): "ORANGE",
            ("PASADENA", "CA"): "LOS ANGELES",
            ("THOUSAND OAKS", "CA"): "VENTURA",
            ("VISALIA", "CA"): "TULARE",
            ("SIMI VALLEY", "CA"): "VENTURA",
            ("CONCORD", "CA"): "CONTRA COSTA",
            ("ROSEVILLE", "CA"): "PLACER",
            ("VALLEJO", "CA"): "SOLANO",
            ("VICTORVILLE", "CA"): "SAN BERNARDINO",
            ("EL MONTE", "CA"): "LOS ANGELES",
            ("BERKELEY", "CA"): "ALAMEDA",
            ("DOWNEY", "CA"): "LOS ANGELES",
            ("COSTA MESA", "CA"): "ORANGE",
            ("INGLEWOOD", "CA"): "LOS ANGELES",
            ("VENTURA", "CA"): "VENTURA",
            ("WEST COVINA", "CA"): "LOS ANGELES",
            ("NORWALK", "CA"): "LOS ANGELES",
            ("CARLSBAD", "CA"): "SAN DIEGO",
            ("FAIRFIELD", "CA"): "SOLANO",
            ("RICHMOND", "CA"): "CONTRA COSTA",
            ("MURRIETA", "CA"): "RIVERSIDE",
            ("ANTIOCH", "CA"): "CONTRA COSTA",
            ("DAILY CITY", "CA"): "SAN MATEO",
            ("TEMECULA", "CA"): "RIVERSIDE",
            ("SANTA MARIA", "CA"): "SANTA BARBARA",
            ("EL CAJON", "CA"): "SAN DIEGO",
            ("RIALTO", "CA"): "SAN BERNARDINO",
            ("SAN MATEO", "CA"): "SAN MATEO",
            ("COMPTON", "CA"): "LOS ANGELES",
            ("JURUPA VALLEY", "CA"): "RIVERSIDE",
            ("VISTA", "CA"): "SAN DIEGO",
            ("SOUTH GATE", "CA"): "LOS ANGELES",
            ("MISSION VIEJO", "CA"): "ORANGE",
            ("VACAVILLE", "CA"): "SOLANO",
            ("CARSON", "CA"): "LOS ANGELES",
            ("HESPERIA", "CA"): "SAN BERNARDINO",
            ("SANTA MONICA", "CA"): "LOS ANGELES",
            ("WESTMINSTER", "CA"): "ORANGE",
            ("REDDING", "CA"): "SHASTA",
            ("SANTA BARBARA", "CA"): "SANTA BARBARA",
            ("CHICO", "CA"): "BUTTE",
            ("NEWPORT BEACH", "CA"): "ORANGE",
            ("SAN LEANDRO", "CA"): "ALAMEDA",
            ("HAWTHORNE", "CA"): "LOS ANGELES",
            ("CITRUS HEIGHTS", "CA"): "SACRAMENTO",
            ("ALHAMBRA", "CA"): "LOS ANGELES",
            ("LAKE FOREST", "CA"): "ORANGE",
            ("TRACY", "CA"): "SAN JOAQUIN",
            ("REDWOOD CITY", "CA"): "SAN MATEO",
            ("BELLFLOWER", "CA"): "LOS ANGELES",
            ("CHINO HILLS", "CA"): "SAN BERNARDINO",
            ("LAKEWOOD", "CA"): "LOS ANGELES",
            ("HEMET", "CA"): "RIVERSIDE",
            ("MERCADO", "CA"): "MERCED",
            ("MENIFEE", "CA"): "RIVERSIDE",
            ("LYNWOOD", "CA"): "LOS ANGELES",
            ("MANTECA", "CA"): "SAN JOAQUIN",
            ("NAPA", "CA"): "NAPA",
            ("REDONDO BEACH", "CA"): "LOS ANGELES",
            ("CHINO", "CA"): "SAN BERNARDINO",
            ("TULARE", "CA"): "TULARE",
            ("MADERA", "CA"): "MADERA",
            ("SANTA CLARA", "CA"): "SANTA CLARA",
            ("SAN BRUNO", "CA"): "SAN MATEO",
            ("SAN RAFAEL", "CA"): "MARIN",
            ("WHITTIER", "CA"): "LOS ANGELES",
            ("NEWARK", "CA"): "ALAMEDA",
            ("SOUTH SAN FRANCISCO", "CA"): "SAN MATEO",
            ("ALAMEDA", "CA"): "ALAMEDA",
            ("TURLOCK", "CA"): "STANISLAUS",
            ("PERRIS", "CA"): "RIVERSIDE",
            ("MILPITAS", "CA"): "SANTA CLARA",
            ("MOUNTAIN VIEW", "CA"): "SANTA CLARA",
            ("BUENA PARK", "CA"): "ORANGE",
            ("PALO ALTO", "CA"): "SANTA CLARA",
            ("HAYWARD", "CA"): "ALAMEDA",
            ("SANTA CRUZ", "CA"): "SANTA CRUZ",
            ("EUREKA", "CA"): "HUMBOLDT",
            ("BARSTOW", "CA"): "SAN BERNARDINO",
            ("YUBA CITY", "CA"): "SUTTER",
            ("SAN LUIS OBISPO", "CA"): "SAN LUIS OBISPO",
            ("HANFORD", "CA"): "KINGS",
            ("MERCED", "CA"): "MERCED",
            ("CHULA VISTA", "CA"): "SAN DIEGO",
            ("CHULA VISTA", "CA"): "SAN DIEGO",
            
            # Texas cities
            ("HOUSTON", "TX"): "HARRIS",
            ("SAN ANTONIO", "TX"): "BEXAR",
            ("DALLAS", "TX"): "DALLAS",
            ("AUSTIN", "TX"): "TRAVIS",
            ("FORT WORTH", "TX"): "TARRANT",
            ("EL PASO", "TX"): "EL PASO",
            ("ARLINGTON", "TX"): "TARRANT",
            ("CORPUS CHRISTI", "TX"): "NUECES",
            ("PLANO", "TX"): "COLLIN",
            ("LAREDO", "TX"): "WEBB",
            ("LUBBOCK", "TX"): "LUBBOCK",
            ("GARLAND", "TX"): "DALLAS",
            ("IRVING", "TX"): "DALLAS",
            ("AMARILLO", "TX"): "POTTER",
            ("GRAND PRAIRIE", "TX"): "DALLAS",
            ("BROWNSVILLE", "TX"): "CAMERON",
            ("MCKINNEY", "TX"): "COLLIN",
            ("FRISCO", "TX"): "COLLIN",
            ("PASADENA", "TX"): "HARRIS",
            ("KILLEEN", "TX"): "BELL",
            ("MESQUITE", "TX"): "DALLAS",
            ("MCALLEN", "TX"): "HIDALGO",
            ("CARROLLTON", "TX"): "DALLAS",
            ("MIDLAND", "TX"): "MIDLAND",
            ("DENTON", "TX"): "DENTON",
            ("ABILENE", "TX"): "TAYLOR",
            ("ROUND ROCK", "TX"): "WILLIAMSON",
            ("ODESSA", "TX"): "ECTOR",
            ("WACO", "TX"): "MCLENNAN",
            ("RICHARDSON", "TX"): "DALLAS",
            ("LEWISVILLE", "TX"): "DENTON",
            ("TYLER", "TX"): "SMITH",
            ("PEARLAND", "TX"): "BRAZORIA",
            ("COLLEGE STATION", "TX"): "BRAZOS",
            ("SAN ANGELO", "TX"): "TOM GREEN",
            ("ALLEN", "TX"): "COLLIN",
            ("SUGAR LAND", "TX"): "FORT BEND",
            ("KILLEEN", "TX"): "BELL",
            ("WICHITA FALLS", "TX"): "WICHITA",
            ("LONGVIEW", "TX"): "GREGG",
            ("MISSION", "TX"): "HIDALGO",
            ("EDINBURG", "TX"): "HIDALGO",
            ("BRYAN", "TX"): "BRAZOS",
            ("BAYTOWN", "TX"): "HARRIS",
            ("PHARR", "TX"): "HIDALGO",
            ("TEMPLE", "TX"): "BELL",
            ("MISSOURI CITY", "TX"): "FORT BEND",
            ("FLOWER MOUND", "TX"): "DENTON",
            ("HARLINGEN", "TX"): "CAMERON",
            ("NORTH RICHLAND HILLS", "TX"): "TARRANT",
            ("VICTORIA", "TX"): "VICTORIA",
            ("CONROE", "TX"): "MONTGOMERY",
            ("NEW BRAUNFELS", "TX"): "COMAL",
            ("MANSFIELD", "TX"): "TARRANT",
            ("ROWLETT", "TX"): "DALLAS",
            ("WESLACO", "TX"): "HIDALGO",
            ("PORT ARTHUR", "TX"): "JEFFERSON",
            ("GALVESTON", "TX"): "GALVESTON",
            ("BEAUMONT", "TX"): "JEFFERSON",
            ("PORT ARTHUR", "TX"): "JEFFERSON",
            ("ORANGE", "TX"): "ORANGE",
            ("TEXAS CITY", "TX"): "GALVESTON",
            ("LAKE JACKSON", "TX"): "BRAZORIA",
            ("FRIENDSWOOD", "TX"): "GALVESTON",
            ("LEAGUE CITY", "TX"): "GALVESTON",
            ("PEARLAND", "TX"): "BRAZORIA",
            ("ALVIN", "TX"): "BRAZORIA",
            ("ANGLETON", "TX"): "BRAZORIA",
            ("ROSENBERG", "TX"): "FORT BEND",
            ("RICHMOND", "TX"): "FORT BEND",
            ("SUGAR LAND", "TX"): "FORT BEND",
            ("STAFFORD", "TX"): "FORT BEND",
            ("MISSOURI CITY", "TX"): "FORT BEND",
            ("FULSHEAR", "TX"): "FORT BEND",
            ("KATY", "TX"): "HARRIS",
            ("CYPRESS", "TX"): "HARRIS",
            ("SPRING", "TX"): "HARRIS",
            ("THE WOODLANDS", "TX"): "MONTGOMERY",
            ("MAGNOLIA", "TX"): "MONTGOMERY",
            ("TOMBALL", "TX"): "HARRIS",
            ("HUMBLE", "TX"): "HARRIS",
            ("KINGWOOD", "TX"): "HARRIS",
            ("ATASCOCITA", "TX"): "HARRIS",
            ("CLEAR LAKE", "TX"): "HARRIS",
            ("WEBSTER", "TX"): "HARRIS",
            ("SEABROOK", "TX"): "HARRIS",
            ("KEMAH", "TX"): "GALVESTON",
            ("DICKINSON", "TX"): "GALVESTON",
            ("LA MARQUE", "TX"): "GALVESTON",
            ("SANTA FE", "TX"): "GALVESTON",
            ("ALVIN", "TX"): "BRAZORIA",
            ("ANGLETON", "TX"): "BRAZORIA",
            ("LAKE JACKSON", "TX"): "BRAZORIA",
            ("CLUTE", "TX"): "BRAZORIA",
            ("FREEPORT", "TX"): "BRAZORIA",
            ("WEST COLUMBIA", "TX"): "BRAZORIA",
            ("BRAZORIA", "TX"): "BRAZORIA",
            ("DANBURY", "TX"): "BRAZORIA",
            ("SURFSIDE BEACH", "TX"): "BRAZORIA",
            ("QUINTANA", "TX"): "BRAZORIA",
            ("BAILEY'S PRAIRIE", "TX"): "BRAZORIA",
            ("BONNEY", "TX"): "BRAZORIA",
            ("CLUTE", "TX"): "BRAZORIA",
            ("DANBURY", "TX"): "BRAZORIA",
            ("HILLCREST", "TX"): "BRAZORIA",
            ("IOWA COLONY", "TX"): "BRAZORIA",
            ("JONES CREEK", "TX"): "BRAZORIA",
            ("LIVERPOOL", "TX"): "BRAZORIA",
            ("MANVEL", "TX"): "BRAZORIA",
            ("OLDEMAN", "TX"): "BRAZORIA",
            ("RICHWOOD", "TX"): "BRAZORIA",
            ("SANDY POINT", "TX"): "BRAZORIA",
            ("SWEENY", "TX"): "BRAZORIA",
            ("WEST COLUMBIA", "TX"): "BRAZORIA",
            
            # Illinois cities
            ("CHICAGO", "IL"): "COOK",
            ("AURORA", "IL"): "KANE",
            ("NAPERVILLE", "IL"): "DUPAGE",
            ("JOLIET", "IL"): "WILL",
            ("ROCKFORD", "IL"): "WINNEBAGO",
            ("ELGIN", "IL"): "KANE",
            ("PEORIA", "IL"): "PEORIA",
            ("CHAMPAGN", "IL"): "CHAMPAGN",
            ("WAUKEGAN", "IL"): "LAKE",
            ("CICERO", "IL"): "COOK",
            ("BLOOMINGTON", "IL"): "MCLEAN",
            ("ARLINGTON HEIGHTS", "IL"): "COOK",
            ("EVANSTON", "IL"): "COOK",
            ("DECATUR", "IL"): "MACON",
            ("SCHAUMBURG", "IL"): "COOK",
            ("BOLINGBROOK", "IL"): "WILL",
            ("PALATINE", "IL"): "COOK",
            ("SKOKIE", "IL"): "COOK",
            ("DES PLAINES", "IL"): "COOK",
            ("ORLAND PARK", "IL"): "COOK",
            ("TINLEY PARK", "IL"): "COOK",
            ("OAK LAWN", "IL"): "COOK",
            ("BERWYN", "IL"): "COOK",
            ("MOUNT PROSPECT", "IL"): "COOK",
            ("NORMAL", "IL"): "MCLEAN",
            ("WHEATON", "IL"): "DUPAGE",
            ("HOFFMAN ESTATES", "IL"): "COOK",
            ("OAK PARK", "IL"): "COOK",
            ("DOWNERS GROVE", "IL"): "DUPAGE",
            ("ELMHURST", "IL"): "DUPAGE",
            ("GLENVIEW", "IL"): "COOK",
            ("DEKALB", "IL"): "DEKALB",
            ("LOMBARD", "IL"): "DUPAGE",
            ("BUFFALO GROVE", "IL"): "COOK",
            ("BARTLETT", "IL"): "DUPAGE",
            ("URBANA", "IL"): "CHAMPAGN",
            ("SCHAUMBURG", "IL"): "COOK",
            ("CRYSTAL LAKE", "IL"): "MCHENRY",
            ("PARK RIDGE", "IL"): "COOK",
            ("PLAINFIELD", "IL"): "WILL",
            ("HANOVER PARK", "IL"): "COOK",
            ("CARPENTERSVILLE", "IL"): "KANE",
            ("WHEELING", "IL"): "COOK",
            ("NORTHBROOK", "IL"): "COOK",
            ("ST. CHARLES", "IL"): "KANE",
            ("ST CHARLES", "IL"): "KANE",
            ("SAINT CHARLES", "IL"): "KANE",
            ("GENEVA", "IL"): "KANE",
            ("BATAVIA", "IL"): "KANE",
            ("ELBURN", "IL"): "KANE",
            ("SUGAR GROVE", "IL"): "KANE",
            ("MAPLE PARK", "IL"): "KANE",
            ("BURLINGTON", "IL"): "KANE",
            ("BLACKBERRY", "IL"): "KANE",
            ("CAMPTON HILLS", "IL"): "KANE",
            ("VIRGIL", "IL"): "KANE",
            ("BIG ROCK", "IL"): "KANE",
            ("KANEVILLE", "IL"): "KANE",
            ("LILY LAKE", "IL"): "KANE",
            ("LA FOX", "IL"): "KANE",
            ("MONTGOMERY", "IL"): "KENDALL",
            ("OSWEGO", "IL"): "KENDALL",
            ("PLANO", "IL"): "KENDALL",
            ("YORKVILLE", "IL"): "KENDALL",
            ("SANDWICH", "IL"): "DEKALB",
            ("SYCAMORE", "IL"): "DEKALB",
            ("GENOA", "IL"): "DEKALB",
            ("KIRKLAND", "IL"): "DEKALB",
            ("CORTLAND", "IL"): "DEKALB",
            ("HINCKLEY", "IL"): "DEKALB",
            ("MAPLE PARK", "IL"): "KANE",
            ("MALTA", "IL"): "DEKALB",
            ("SOMONAUK", "IL"): "DEKALB",
            ("WATERMAN", "IL"): "DEKALB",
            ("SHABBONA", "IL"): "DEKALB",
            ("KINGSTON", "IL"): "DEKALB",
            ("KIRKLAND", "IL"): "DEKALB",
            ("CORTLAND", "IL"): "DEKALB",
            ("HINCKLEY", "IL"): "DEKALB",
            ("MAPLE PARK", "IL"): "KANE",
            ("MALTA", "IL"): "DEKALB",
            ("SOMONAUK", "IL"): "DEKALB",
            ("WATERMAN", "IL"): "DEKALB",
            ("SHABBONA", "IL"): "DEKALB",
            ("KINGSTON", "IL"): "DEKALB",
            
            # Other major cities
            ("PHOENIX", "AZ"): "MARICOPA",
            ("TUCSON", "AZ"): "PIMA",
            ("MESA", "AZ"): "MARICOPA",
            ("CHANDLER", "AZ"): "MARICOPA",
            ("SCOTTSDALE", "AZ"): "MARICOPA",
            ("GLENDALE", "AZ"): "MARICOPA",
            ("GILBERT", "AZ"): "MARICOPA",
            ("TEMPE", "AZ"): "MARICOPA",
            ("PEORIA", "AZ"): "MARICOPA",
            ("SURPRISE", "AZ"): "MARICOPA",
            ("YUMA", "AZ"): "YUMA",
            ("FLAGSTAFF", "AZ"): "COCONINO",
            ("SEDONA", "AZ"): "YAVAPAI",
            ("PRESCOTT", "AZ"): "YAVAPAI",
            ("LAKE HAVASU CITY", "AZ"): "MOHAVE",
            ("BULLHEAD CITY", "AZ"): "MOHAVE",
            ("KINGMAN", "AZ"): "MOHAVE",
            ("NOGALES", "AZ"): "SANTA CRUZ",
            ("SIERRA VISTA", "AZ"): "COCHISE",
            ("DOUGLAS", "AZ"): "COCHISE",
            ("BISBEE", "AZ"): "COCHISE",
            ("CLIFTON", "AZ"): "GREENLEE",
            ("SAFFORD", "AZ"): "GRAHAM",
            ("PAYSON", "AZ"): "GILA",
            ("GLOBE", "AZ"): "GILA",
            ("SHOW LOW", "AZ"): "NAVAJO",
            ("HOLBROOK", "AZ"): "NAVAJO",
            ("WINSLOW", "AZ"): "NAVAJO",
            ("PAGE", "AZ"): "COCONINO",
            ("WILLIAMS", "AZ"): "COCONINO",
            ("GRAND CANYON", "AZ"): "COCONINO",
            ("TUBA CITY", "AZ"): "COCONINO",
            ("KAYENTA", "AZ"): "NAVAJO",
            ("CHINLE", "AZ"): "APACHE",
            ("FORT DEFIANCE", "AZ"): "APACHE",
            ("WINDOW ROCK", "AZ"): "APACHE",
            ("SAINT JOHNS", "AZ"): "APACHE",
            ("SAINT JOHNS", "AZ"): "APACHE",
            ("EAGAR", "AZ"): "APACHE",
            ("SPRINGERVILLE", "AZ"): "APACHE",
            ("ALPINE", "AZ"): "APACHE",
            ("VERNON", "AZ"): "APACHE",
            ("CONCHO", "AZ"): "APACHE",
            ("GREER", "AZ"): "APACHE",
            ("MC NARY", "AZ"): "APACHE",
            ("MC NARY", "AZ"): "APACHE",
            ("NAZLINI", "AZ"): "APACHE",
            ("LUPTON", "AZ"): "APACHE",
            ("HOUCK", "AZ"): "APACHE",
            ("SAINT MICHAELS", "AZ"): "APACHE",
            ("SAWMILL", "AZ"): "APACHE",
            ("TEEC NOS POS", "AZ"): "APACHE",
            ("RED MESA", "AZ"): "APACHE",
            ("ROCK POINT", "AZ"): "APACHE",
            ("ROUND ROCK", "AZ"): "APACHE",
            ("STEAMBOAT", "AZ"): "APACHE",
            ("TSAILE", "AZ"): "APACHE",
            ("WHITE RIVER", "AZ"): "APACHE",
            ("WHITERIVER", "AZ"): "APACHE",
            ("WIDE RUINS", "AZ"): "APACHE",
        }
        
        # Look up city in mapping (use 2-letter state code for lookup)
        lookup_key = (city_upper, state_for_lookup)
        county = city_county_map.get(lookup_key)
        
        if county:
            print(f"===> ✅ Found county '{county}' for '{city_upper}, {state_for_lookup}' via local map")
            # Return with original state format (full name if that's what was passed)
            return f"{county}, {state_for_return}"
        else:
            # Fallback: Use Google Maps Geocoding API to get county
            # Use 2-letter state code for API call (more reliable)
            print(f"===> City '{city}' in state '{state_for_lookup}' not in local mapping, querying Google Maps API...")
            county_from_api = get_county_from_google_maps(city, state_for_lookup)
            
            if county_from_api:
                print(f"===> ✅ Found county '{county_from_api}' for '{city}, {state_for_lookup}' via Google Maps API")
                # Return with original state format
                return f"{county_from_api.upper()}, {state_for_return}"
            else:
                # Final fallback: we DO NOT pretend the city is the county.
                # Leave Line 6 blank so we don't send incorrect data to the IRS.
                print(f"===> ❌ Could not determine county for '{city}, {state}' (no map match, Google failed) – leaving Line 6 blank")
                return ""
    
    # Helper function to format payment date as MM/DD/YYYY
    def format_payment_date(date_str):
        """
        Normalize many date formats to strict MM/DD/YYYY.
        Handles:
        - ISO: 2025-12-18 or 2025-12-18T...
        - Slash: 12/18/2025 or 3/7/2025
        - Tuple-style: (12, 18, 2025)
        - Generic: any string containing three integers (month, day, year)
        """
        if not date_str:
            return ""
        try:
            from datetime import datetime
            import re

            raw = str(date_str).strip()
            date_obj = None

            # 1) Tuple-style "(12, 18, 2025)" or variations
            if raw.startswith("(") and raw.endswith(")"):
                # Extract all numbers in order
                nums = re.findall(r"\d{1,4}", raw)
                if len(nums) == 3:
                    month, day, year = nums
                    date_obj = datetime(int(year), int(month), int(day))

            # 2) ISO "YYYY-MM-DD" (or with time)
            if date_obj is None and "-" in raw:
                date_str_clean = raw.split("T")[0].replace("Z", "")
                try:
                    date_obj = datetime.strptime(date_str_clean, "%Y-%m-%d")
                except Exception:
                    try:
                        date_obj = datetime.fromisoformat(date_str_clean)
                    except Exception:
                        pass

            # 3) Slash formats "MM/DD/YYYY" or "M/D/YYYY"
            if date_obj is None and "/" in raw:
                parts = raw.split("/")
                if len(parts) == 3:
                    month = parts[0].zfill(2)
                    day = parts[1].zfill(2)
                    year = parts[2]
                    try:
                        date_obj = datetime(int(year), int(month), int(day))
                    except Exception:
                        pass

            # 4) Generic: pull out three integers (month, day, year)
            if date_obj is None:
                nums = re.findall(r"\d{1,4}", raw)
                if len(nums) >= 3:
                    month, day, year = nums[0], nums[1], nums[2]
                    # Heuristic: treat 4‑digit piece as year
                    if len(year) != 4:
                        for n in nums:
                            if len(n) == 4:
                                year = n
                                break
                    try:
                        date_obj = datetime(int(year), int(month), int(day))
                    except Exception:
                        date_obj = None

            if date_obj:
                return date_obj.strftime("%m/%d/%Y")

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
    
    # Helper function to format phone number as xxx-xxx-xxxx (without +1 prefix)
    def format_phone(phone):
        try:
            if not phone:
                return ""
            # Convert to string if not already
            phone_str = str(phone) if not isinstance(phone, str) else phone
            # Remove all non-digits
            phone_clean = ''.join(filter(str.isdigit, phone_str))
            # Remove leading +1 or 1 if present (US country code)
            if phone_clean.startswith('1') and len(phone_clean) == 11:
                phone_clean = phone_clean[1:]  # Remove leading 1
            # Format as xxx-xxx-xxxx if we have 10 digits
            if len(phone_clean) == 10:
                return f"{phone_clean[:3]}-{phone_clean[3:6]}-{phone_clean[6:]}"
            # If not 10 digits, return cleaned version (might be international or invalid)
            return phone_clean if phone_clean else ""
        except Exception as e:
            print(f"===> ⚠️ Error formatting phone '{phone}': {e}")
            return str(phone) if phone else ""
    
    # Helper function to format signature name from signature_name or responsible_name
    def format_signature_name_from_data(signature_name, responsible_name, is_llc, owner_count, form_data, entity_type, is_corp):
        # If signature_name is provided and already has a role suffix (contains comma), use it
        if signature_name and "," in signature_name and len(signature_name.split(",")) >= 2:
            print(f"===> Using signature_name with existing role: '{signature_name}'")
            return to_upper(signature_name)
        
        # If we have responsible_name, format it with the appropriate suffix
        if responsible_name:
            print(f"===> Formatting signature name from responsible_name: '{responsible_name}'")
            return format_signature_name(responsible_name, is_llc, owner_count, form_data, entity_type)
        
        # If signature_name exists but doesn't have a role, try to add the role from form_data
        if signature_name:
            name_upper = to_upper(signature_name)
            # For C-Corp, try to add officer role from form_data
            if is_corp and form_data:
                officer_role = form_data.get("responsiblePartyOfficerRole", "")
                if officer_role and officer_role.strip() != "":
                    print(f"===> Adding officer role to signature_name: '{name_upper}, {to_upper(officer_role)}'")
                    return f"{name_upper}, {to_upper(officer_role)}"
            print(f"===> Using signature_name without role: '{name_upper}'")
            return name_upper
        
        # Fallback: return empty string
        print(f"===> ⚠️ No signature name available")
        return ""
    
    # Helper function to format signature name with member designation or officer title
    def format_signature_name(name, is_llc, owner_count, form_data=None, entity_type=""):
        name_upper = to_upper(name)
        entity_type_upper = entity_type.upper() if entity_type else ""
        
        # For C-Corp and S-Corp, add officer title (use ACTUAL role, NOT hardcoded to President)
        # Format: "NAME, ROLE" (with space after comma)
        if "C-CORP" in entity_type_upper or "S-CORP" in entity_type_upper or "S CORP" in entity_type_upper:
            if form_data:
                officer_role = form_data.get("responsiblePartyOfficerRole", "")
                if officer_role and officer_role.strip() != "":
                    # Use the officer role (e.g., "President", "Vice-President", "Treasurer", "Secretary")
                    return f"{name_upper}, {to_upper(officer_role)}"
            # Don't default to President - return name without role if no role specified
            print(f"===> ⚠️ No officer role found in form_data for {name_upper} ({entity_type_upper}) - returning name without role (NOT defaulting to President)")
            return name_upper
        
        # For LLC, add member designation
        if is_llc:
            if owner_count == 1:
                return f"{name_upper},SOLE MEMBER"
            else:
                return f"{name_upper},MEMBER"
        
        return name_upper
    
    # Helper function to format designee name - always just "ANTONIO REGOJO" (no officer title)
    def format_designee_name(form_data, entity_type):
        # Designee name is always just "ANTONIO REGOJO" - officer title goes in Signature Name, not Designee Name
        return "ANTONIO REGOJO"
    
    # Ensure Line 1 only contains company name (no address) and limit length
    # Line 1 should only be the company name, max ~60 characters to fit on one line
    company_name_clean = company_name.strip()
    if len(company_name_clean) > 60:
        # Truncate if too long (shouldn't happen, but safety check)
        company_name_clean = company_name_clean[:60].strip()
    
    # If TypeScript already resolved county+state (from Airtable), prefer that
    # and send it straight to Line 6. This avoids any mismatch between what
    # the app shows and what the PDF prints, and Google/maps stay as a backup.
    county_state_from_ts = form_data.get("countyState", "")
    if county_state_from_ts:
        print(f"===> Using countyState from TypeScript for Line 6: '{county_state_from_ts}'")
    else:
        print(f"===> No countyState from TypeScript; will derive county from city/state via city_to_county()")

    mapped_data = {
        "Line 1": to_upper(company_name_clean),  # Legal name of entity (FULL NAME including LLC/L.L.C. suffix) - ALL CAPS, NO ADDRESS
        "Line 2": "",  # Trade name (if different, usually empty)
        "Line 3": "",  # Executor, administrator, trustee, "care of" name - Usually empty, should NOT contain address
        "Line 4a": "12550 BISCAYNE BLVD STE 110",  # Mailing address line 2 (Avenida Legal address) - HARDCODED
        "Line 4b": "MIAMI, FL 33181",  # City, State, ZIP (mailing - Avenida Legal) - HARDCODED - Format: "CITY, STATE ZIP"
        "Line 5a": "" if is_avenida_legal_address else (to_upper(company_street_line1) if company_street_line1 else ""),  # Street address line 1 (ONLY street address, NOT full address) - BLANK if US Address service purchased
        "Line 5b": "" if is_avenida_legal_address else (to_upper(f"{company_city}, {company_state} {company_zip}".strip(", ")) if (company_city or company_state or company_zip) else ""),  # City, State, ZIP (from Company Address column in Airtable) - BLANK if US Address service purchased - Format: "CITY, STATE ZIP"
        "Line 6": (
            to_upper(county_state_from_ts)
            if county_state_from_ts
            else (to_upper(city_to_county(company_city, company_state)) if company_city and company_state else "")
        ),  # County, State (converted from city) - e.g., "MIAMI-DADE, FL" or "KINGS, NY"
        # DEBUG: Log Line 6 calculation for troubleshooting
        "_debug_line6": {
            "county_state_from_ts": county_state_from_ts or "EMPTY",
            "company_city": company_city or "EMPTY",
            "company_state": company_state or "EMPTY",
            "calculated_county": city_to_county(company_city, company_state) if company_city and company_state else "N/A (city or state missing)",
        },
        "Line 7a": to_upper(responsible_name) if responsible_name else "",  # Responsible party name - ALL CAPS
        "Line 7b": format_ssn(responsible_ssn) if responsible_ssn and responsible_ssn.upper() not in ['N/A-FOREIGN', 'N/A', ''] else "N/A-FOREIGN",  # Responsible party SSN/ITIN/EIN - formatted as XXX-XX-XXXX
        "8b": "",  # Will be set to member count if LLC, or date if not LLC
        "8b_date": date_business_started,  # Date business started (for non-LLC)
        "9b": to_upper(formation_state or "FL"),  # Closing month / State of incorporation - ALL CAPS
        "10": to_upper(truncate_at_word_boundary(translate_to_english(form_data.get("summarizedBusinessPurpose", business_purpose or "General business operations")), 35).strip()),  # Summarized Business Purpose (max 35 chars, ALL CAPS) - translated from Spanish - TRUNCATE at word boundaries
        "11": format_payment_date(form_data.get("dateBusinessStarted", form_data.get("paymentDate", ""))),  # Date business started in MM/DD/YYYY format - use paymentDate as fallback
        "12": "DECEMBER",  # Closing month of accounting year - always DECEMBER
        "13": {
            "Agricultural": "0",
            "Household": "0",
            "Other": "0"
        },
        "15": "N/A",  # First date wages paid - always N/A
        "17": to_upper(translate_to_english(form_data.get("line17PrincipalMerchandise", ""))[:80]),  # Principal line of merchandise/construction/products/services (max 80 chars, ALL CAPS) - translated from Spanish
        "Designee Name": format_designee_name(form_data, entity_type),  # ALL CAPS - includes officer title for C-Corp only
        "Designee Address": "10634 NE 11 AVE, MIAMI, FL, 33138",  # ALL CAPS
        "Designee Phone": format_phone("(786) 512-0434"),  # Updated phone number - formatted as xxx-xxx-xxxx
        "Designee Fax": "866-496-4957",  # Updated fax number
        "Applicant Phone": format_phone(form_data.get("applicantPhone", "")),  # Business Phone from Airtable - formatted as xxx-xxx-xxxx
        "Applicant Fax": "",  # Usually empty
        "Signature Name": format_signature_name_from_data(signature_name, responsible_name, is_llc, owner_count, form_data, entity_type, is_corp),
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
        # For LLCs, we assume all members are individuals (this is the standard case)
        # Always check "Yes" for LLCs
        mapped_data["Checks"]["8c_yes"] = CHECK_COORDS["8c_yes"]
        print(f"===> ✅ LLC detected - checking 8c_yes at {CHECK_COORDS['8c_yes']}")
    else:
        # For non-LLC (C-Corp, etc.), check "No" and move 25 pixels to the right
        mapped_data["Checks"]["8a_no"] = CHECK_COORDS["8a_no"]  # Check "No" for C-Corp
        # For non-LLC, Line 8b is empty (only used for LLC member count)
        mapped_data["8b"] = ""  # Empty for non-LLC entities
    
    # Line 9a: Type of entity (Checkboxes)
    # IMPORTANT: Check entity types in priority order:
    # 1. Corporation (C-Corp or S-Corp) - check Corporation checkbox (even if sole proprietor)
    # 2. LLC - check LLC checkbox (even if sole proprietor)
    # 3. Partnership - check Partnership checkbox (only for actual partnerships, not LLCs or Corps)
    # 4. Sole proprietor - only check "Sole proprietor" if NOT a Corporation, LLC, or Partnership
    
    entity_type_upper = entity_type.upper()
    
    # Debug logging for entity type detection
    print(f"===> ========== LINE 9A ENTITY TYPE DETECTION ==========")
    print(f"===> entity_type: '{entity_type}'")
    print(f"===> entity_type_upper: '{entity_type_upper}'")
    print(f"===> is_corp: {is_corp}")
    print(f"===> is_llc: {is_llc}")
    print(f"===> is_partnership: {is_partnership}")
    print(f"===> is_sole_proprietor: {is_sole_proprietor}")
    print(f"===> owner_count: {owner_count}")
    print(f"===> ==================================================")
    
    # Check Corporation FIRST (even if sole proprietor)
    if is_corp:
        # Corporation: Check Corporation checkbox
        # If sole proprietor, use sole proprietor position, otherwise use regular position
        if is_sole_proprietor:
            # Sole proprietor corporation: use 9a_corp_sole position
            mapped_data["Checks"]["9a_corp_sole"] = CHECK_COORDS["9a_corp_sole"]
            # Determine form number (1120 for C-Corp, 1120-S for S-Corp)
            if "S-CORP" in entity_type_upper or "S CORP" in entity_type_upper:
                mapped_data["9a_corp_sole_form_number"] = "1120-S"
            else:
                mapped_data["9a_corp_sole_form_number"] = "1120"
            print(f"===> ✅ Sole proprietor corporation detected!")
            print(f"===> ✅ Setting 9a_corp_sole checkbox at {CHECK_COORDS['9a_corp_sole']}")
            print(f"===> ✅ Form number: {mapped_data.get('9a_corp_sole_form_number', 'NOT SET')}")
        else:
            # Regular corporation: use dedicated corporation position
            mapped_data["Checks"]["9a_corp"] = CHECK_COORDS["9a_corp"]
            # Determine form number (1120 for C-Corp, 1120-S for S-Corp)
            if "S-CORP" in entity_type_upper or "S CORP" in entity_type_upper:
                mapped_data["9a_corp_form_number"] = "1120-S"
            else:
                mapped_data["9a_corp_form_number"] = "1120"
            print(f"===> ✅ Regular corporation (not sole proprietor)")
            print(f"===> ✅ Setting 9a_corp checkbox at {CHECK_COORDS['9a_corp']}")
            print(f"===> ✅ Form number: {mapped_data.get('9a_corp_form_number', 'NOT SET')}")
        
        # Line 9b: State of incorporation (ALL CAPS from Formation State column in Airtable)
        mapped_data["9b"] = (formation_state or "FL").upper()
    elif is_llc:
        # LLC checkbox - but if sole proprietor (single member), check "Sole proprietor" instead
        # For LLCs, check if it's a single-member LLC (owner_count == 1 or llc_member_count == 1)
        is_single_member_llc = (owner_count == 1) or (llc_member_count == 1) or is_sole_proprietor
        if is_single_member_llc:
            # Single-member LLC: check "Sole proprietor" checkbox
            mapped_data["Checks"]["9a_sole"] = CHECK_COORDS["9a_sole"]
            print(f"===> Single-member LLC (sole proprietor), checking 9a_sole at {CHECK_COORDS['9a_sole']}")
            print(f"===>   owner_count: {owner_count}, llc_member_count: {llc_member_count}, is_sole_proprietor: {is_sole_proprietor}")
        else:
            # Multi-member LLC: check LLC checkbox
            mapped_data["Checks"]["9a_llc"] = CHECK_COORDS["9a"]
            print(f"===> Multi-member LLC, checking 9a_llc at {CHECK_COORDS['9a']}")
    elif is_partnership:
        # Partnership checkbox (should NOT be used for LLCs or Corporations)
        mapped_data["Checks"]["9a_partnership"] = CHECK_COORDS["9a"]
        print(f"===> Partnership, checking 9a_partnership at {CHECK_COORDS['9a']}")
    elif is_sole_proprietor:
        # True sole proprietorship (not LLC, not Corp, not Partnership)
        # Check "Sole proprietor" checkbox
        mapped_data["Checks"]["9a_sole"] = CHECK_COORDS["9a_sole"]
        print(f"===> True sole proprietorship, checking 9a_sole at {CHECK_COORDS['9a_sole']}")
    else:
        # Other entity type
        mapped_data["Checks"]["9a_other"] = CHECK_COORDS["9a"]
        print(f"===> Other entity type, checking 9a_other at {CHECK_COORDS['9a']}")
    
    # Line 9a: If sole proprietor (true sole proprietorship OR single-member LLC),
    # add SSN to the field next to the "Sole proprietor" checkbox
    # Use same SSN as Line 7b (or "N/A-FOREIGN" if no SSN) - formatted as XXX-XX-XXXX
    # This applies to:
    # 1. True sole proprietorships (not Corp/LLC/Partnership)
    # 2. Single-member LLCs (sole proprietor)
    # Check if 9a_sole checkbox was set (either for LLC sole proprietor or true sole proprietorship)
    if "9a_sole" in mapped_data.get("Checks", {}):
        # Add the SSN from Line 7b (responsible_ssn) - ALWAYS use responsible_ssn from Line 7b
        if responsible_ssn and responsible_ssn.upper() not in ['N/A-FOREIGN', 'N/A', '']:
            mapped_data["9a_sole_ssn"] = format_ssn(responsible_ssn)  # Formatted as XXX-XX-XXXX
            print(f"===> ✅ Adding SSN to 9a_sole_ssn: {mapped_data['9a_sole_ssn']} (from Line 7b: {responsible_ssn})")
        else:
            mapped_data["9a_sole_ssn"] = "N/A-FOREIGN"  # Same as Line 7b when no SSN
            print(f"===> ⚠️ No SSN available, setting 9a_sole_ssn to 'N/A-FOREIGN'")
    
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
                # CRITICAL: Max 32 chars, truncate at word boundaries, never cut words
                translated = translate_to_english(line16_other_specify)
                mapped_data["16_other_specify"] = to_upper(truncate_at_word_boundary(translated, 28))
            else:
                # Default specification if none provided
                translated = translate_to_english(business_purpose or "GENERAL BUSINESS")
                mapped_data["16_other_specify"] = to_upper(truncate_at_word_boundary(translated, 28))
        else:
            # Default to "Other" if category doesn't match any known category
            mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
            if line16_other_specify:
                # CRITICAL: Max 32 chars, truncate at word boundaries, never cut words
                translated = translate_to_english(line16_other_specify)
                mapped_data["16_other_specify"] = to_upper(truncate_at_word_boundary(translated, 28))
            else:
                # Default specification if none provided
                translated = translate_to_english(business_purpose or "GENERAL BUSINESS")
                mapped_data["16_other_specify"] = to_upper(truncate_at_word_boundary(translated, 28))
    elif line16_other_specify:
        # If only other_specify is provided, check "Other"
        mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
        # CRITICAL: Max 28 chars, truncate at word boundaries, never cut words
        translated = translate_to_english(line16_other_specify)
        mapped_data["16_other_specify"] = to_upper(truncate_at_word_boundary(translated, 28))
    
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
                if field == "17":  # Line 17 can be up to 80 chars
                    max_length = 80
                elif field == "10":  # Line 10 can be up to 35 chars (truncate at word boundaries)
                    max_length = 35
                elif field in ["Line 1", "Line 3", "Line 5a", "Line 5b", "Designee Address"]:  # Longer fields
                    max_length = 80
                else:
                    max_length = 50  # Default max length
                if len(value_str) > max_length:
                    # For Field 10, use word-boundary truncation to avoid cutting words
                    if field == "10":
                        value_str = truncate_at_word_boundary(value_str, max_length)
                    else:
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
        # CRITICAL: Max 28 chars, truncate at word boundaries, never cut words
        other_specify_raw = str(data["16_other_specify"]).upper()
        other_specify = truncate_at_word_boundary(other_specify_raw, 28)
        if other_specify and "16_other_specify" in FIELD_COORDS:
            coord = FIELD_COORDS["16_other_specify"]
            c.drawString(coord[0], coord[1], other_specify)
    
    # Handle Line 9a form number field (1120 for C-Corp, 1120-S for S-Corp)
    checks = data.get("Checks", {})
    
    # Check for regular corporation form number
    if "9a_corp_form_number" in data:
        form_number = str(data["9a_corp_form_number"]).upper()
        if "9a_corp" in checks:
            # Use coordinates from CHECK_COORDS (5px more to the right than before: 139 + 5 = 144)
            form_coords = CHECK_COORDS.get("9a_corp_form_number")
            if form_coords and isinstance(form_coords, (list, tuple)) and len(form_coords) >= 2:
                form_x = form_coords[0]
                form_y = form_coords[1]
                c.drawString(form_x, form_y, form_number)
                print(f"===> Drawing form number {form_number} at ({form_x}, {form_y}) for regular corporation")
        elif "9a_scorp" in checks:
            scorp_coords = checks["9a_scorp"]
            if isinstance(scorp_coords, (list, tuple)) and len(scorp_coords) >= 2:
                scorp_y = scorp_coords[1]
                # Form number is 75px to the right of checkbox
                form_x = scorp_coords[0] + 75
                form_y = scorp_y
                c.drawString(form_x, form_y, form_number)
                print(f"===> Drawing form number {form_number} at ({form_x}, {form_y}) for S-Corp")
    
    # Check for sole proprietor corporation form number
    if "9a_corp_sole_form_number" in data:
        form_number = str(data["9a_corp_sole_form_number"]).upper()
        if "9a_corp_sole" in checks:
            # Use coordinates from CHECK_COORDS (5px more to the right than before: 139 + 5 = 144)
            form_coords = CHECK_COORDS.get("9a_corp_sole_form_number")
            if form_coords and isinstance(form_coords, (list, tuple)) and len(form_coords) >= 2:
                form_x = form_coords[0]
                form_y = form_coords[1]
                c.drawString(form_x, form_y, form_number)
                print(f"===> Drawing form number {form_number} at ({form_x}, {form_y}) for sole proprietor corporation")
    
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
    print(f"===> ========== DRAWING LINE 9A CHECKBOXES ==========")
    print(f"===> Available checkboxes in checks dict: {list(checks.keys())}")
    print(f"===> Checking for 9a_llc: {'9a_llc' in checks}")
    print(f"===> Checking for 9a_corp: {'9a_corp' in checks}")
    print(f"===> Checking for 9a_corp_sole: {'9a_corp_sole' in checks}")
    if "9a_llc" in checks:
        coords = checks["9a_llc"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
            print(f"===> ✅ Drew 9a_llc checkbox at ({coords[0]}, {coords[1]})")
    elif "9a_corp" in checks:
        coords = checks["9a_corp"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
            print(f"===> ✅ Drew 9a_corp checkbox at ({coords[0]}, {coords[1]})")
    elif "9a_corp_sole" in checks:
        coords = checks["9a_corp_sole"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
            print(f"===> ✅ Drew 9a_corp_sole checkbox at ({coords[0]}, {coords[1]})")
        else:
            print(f"===> ⚠️ 9a_corp_sole found but coords invalid: {coords}")
    elif "9a_scorp" in checks:
        coords = checks["9a_scorp"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
            print(f"===> Drawing X at ({coords[0]}, {coords[1]}) for 9a_scorp")
    elif "9a_partnership" in checks:
        coords = checks["9a_partnership"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
            print(f"===> Drawing X at ({coords[0]}, {coords[1]}) for 9a_partnership")
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
        print(f"===> ✅ Drew 8c_yes checkbox at {CHECK_COORDS['8c_yes']}")
    else:
        print(f"===> ⚠️ 8c_yes checkbox NOT found in checks dict!")
    
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
        debug_line6 = ss4_fields.get('_debug_line6', {})
        print(f"===> Line 6 DEBUG: county_from_ts='{debug_line6.get('county_state_from_ts', 'N/A')}', city='{debug_line6.get('company_city', 'N/A')}', state='{debug_line6.get('company_state', 'N/A')}', calculated='{debug_line6.get('calculated_county', 'N/A')}'")
        print(f"===> Line 7a: '{ss4_fields.get('Line 7a', 'NOT FOUND')}'")
        print(f"===> Line 7b: '{ss4_fields.get('Line 7b', 'NOT FOUND')}'")
        print(f"===> Line 8b: '{ss4_fields.get('8b', 'NOT FOUND')}'")
        print(f"===> Line 9b: '{ss4_fields.get('9b', 'NOT FOUND')}'")
        print(f"===> Line 10: '{ss4_fields.get('10', 'NOT FOUND')}'")
        print(f"===> Line 11: '{ss4_fields.get('11', 'NOT FOUND')}'")
        print(f"===> Line 12: '{ss4_fields.get('12', 'NOT FOUND')}'")
        print(f"===> Line 15: '{ss4_fields.get('15', 'NOT FOUND')}'")
        print(f"===> Line 17: '{ss4_fields.get('17', 'NOT FOUND')}'")
        print(f"===> Line 7a (Responsible Party Name): '{ss4_fields.get('Line 7a', 'NOT FOUND')}'")
        print(f"===> Line 7b (Responsible Party SSN): '{ss4_fields.get('Line 7b', 'NOT FOUND')}'")
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
        error_trace = traceback.format_exc()
        print(f"===> ERROR TRACEBACK:\n{error_trace}")
        # Return proper error response that Lambda Function URL can handle
        error_response = {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "error": str(e),
                "message": "Internal server error in SS-4 Lambda",
                "traceback": error_trace if len(error_trace) < 1000 else error_trace[:1000] + "..."
            })
        }
        print(f"===> Returning error response: {json.dumps(error_response)}")
        return error_response

