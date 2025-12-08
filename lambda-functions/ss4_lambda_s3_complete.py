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
    "9b": (290, 414),        # Closing month
    "16_other_specify": (400, 196),  # Other (specify) text field - same position as healthcare checkbox (where the category description goes)
    "10": (65, 375),         # Highest number of employees
    "11": (115, 317),        # Principal activity
    "12": (485, 327),        # Principal activity code
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
    company_name = form_data.get("companyName", "")
    company_name_base = form_data.get("companyNameBase", company_name)
    entity_type = form_data.get("entityType", "")
    business_purpose = form_data.get("businessPurpose", "")
    formation_state = form_data.get("formationState", "")
    
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
    responsible_country = form_data.get("responsiblePartyCountry", "USA")
    
    # Owner information
    owner_count = form_data.get("ownerCount", 1)
    is_llc = form_data.get("isLLC", "").upper() == "YES" or entity_type.upper() == "LLC"
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
    
    # Parse company address
    # Line 4a: Default to Avenida Legal address for mailing
    # Line 4b: Miami, FL, 33181
    # Line 5a: Company's US street address
    # Line 5b: Company's US City, State
    # Line 6: Company's US City and State
    
    # Parse company address for street address (Line 5a, 5b, 6)
    company_street_line1 = address_parts[0].strip() if address_parts else company_address
    company_street_line2 = ", ".join([p.strip() for p in address_parts[1:-1]]) if len(address_parts) > 2 else ""
    company_city_state_zip = address_parts[-1].strip() if len(address_parts) > 1 else ""
    
    # Parse city, state, zip from company_city_state_zip
    # Format: "City, State ZIP" or "City, State, ZIP"
    company_city = ""
    company_state = ""
    company_zip = ""
    if company_city_state_zip:
        city_state_parts = company_city_state_zip.split(",")
        if len(city_state_parts) >= 2:
            company_city = city_state_parts[0].strip()
            state_zip = city_state_parts[1].strip().split()
            if len(state_zip) >= 2:
                company_state = state_zip[0]
                company_zip = state_zip[1]
            elif len(state_zip) == 1:
                company_state = state_zip[0]
    
    # Helper function to convert to uppercase
    def to_upper(text):
        return str(text).upper() if text else ""
    
    # Helper function to format payment date as (month, day, year)
    def format_payment_date(date_str):
        if not date_str:
            return ""
        try:
            # Handle different date formats
            if "-" in date_str:
                # ISO format: YYYY-MM-DD
                from datetime import datetime
                date_obj = datetime.strptime(date_str.split("T")[0], "%Y-%m-%d")
                return f"({date_obj.strftime('%m')}, {date_obj.strftime('%d')}, {date_obj.strftime('%Y')})"
            elif "/" in date_str:
                # MM/DD/YYYY format
                parts = date_str.split("/")
                if len(parts) == 3:
                    return f"({parts[0]}, {parts[1]}, {parts[2]})"
            # If already in (month, day, year) format, return as is
            if date_str.startswith("(") and date_str.endswith(")"):
                return date_str
            return date_str
        except:
            return date_str
    
    # Helper function to format signature name with member designation
    def format_signature_name(name, is_llc, owner_count):
        name_upper = to_upper(name)
        if is_llc:
            if owner_count == 1:
                return f"{name_upper},SOLE MEMBER"
            else:
                return f"{name_upper},MEMBER"
        return name_upper
    
    # Helper function to format designee name with officer title for C-Corp
    def format_designee_name(form_data, entity_type):
        base_name = "ANTONIO REGOJO"
        entity_type_upper = entity_type.upper() if entity_type else ""
        
        # For C-Corp, add officer title (President or whoever has SSN)
        if "C-CORP" in entity_type_upper or ("CORP" in entity_type_upper and "S-CORP" not in entity_type_upper):
            # Get responsible party officer role from form_data
            officer_role = form_data.get("responsiblePartyOfficerRole", "")
            if officer_role:
                # Use the officer role (e.g., "President", "Vice-President", "Treasurer", "Secretary")
                return f"{base_name},{to_upper(officer_role)}"
            else:
                # Default to President if no role specified
                return f"{base_name},PRESIDENT"
        
        # For other entity types, just return the base name
        return base_name
    
    mapped_data = {
        "Line 1": to_upper(company_name),  # Legal name of entity (FULL NAME including LLC/L.L.C. suffix) - ALL CAPS
        "Line 2": "",  # Trade name (if different, usually empty)
        "Line 3": to_upper(company_street_line1),  # Mailing address line 1 (same as street address)
        "Line 4a": "12550 BISCAYNE BLVD STE 110",  # Mailing address line 2 (Avenida Legal address)
        "Line 4b": "MIAMI, FL, 33181",  # City, State, ZIP (mailing - Avenida Legal)
        "Line 5a": to_upper(company_street_line1),  # Street address line 1 (Company's US street address)
        "Line 5b": to_upper(company_street_line2),  # Street address line 2 (if exists)
        "Line 6": to_upper(f"{company_city}, {company_state}".strip(", ")) if company_city and company_state else to_upper(company_city_state_zip),  # City, State (Company's US City and State)
        "Line 7a": to_upper(responsible_name),  # Responsible party name - ALL CAPS
        "Line 7b": to_upper(responsible_ssn),  # Responsible party SSN/ITIN/EIN
        "8b": "",  # Will be set to member count if LLC, or date if not LLC
        "8b_date": date_business_started,  # Date business started (for non-LLC)
        "9b": to_upper(formation_state or "FL"),  # Closing month / State of incorporation - ALL CAPS
        "10": to_upper(form_data.get("summarizedBusinessPurpose", business_purpose or "General business operations")[:45]),  # Summarized Business Purpose (max 45 chars, ALL CAPS)
        "11": format_payment_date(form_data.get("dateBusinessStarted", "")),  # Payment date in (month, day, year) format
        "12": "DECEMBER",  # Closing month of accounting year - always DECEMBER
        "13": {
            "Agricultural": "0",
            "Household": "0",
            "Other": "0"
        },
        "15": "N/A",  # First date wages paid - always N/A
        "17": to_upper(form_data.get("line17PrincipalMerchandise", "")[:168]),  # Principal line of merchandise/construction/products/services (max 168 chars, ALL CAPS)
        "Designee Name": "ANTONIO REGOJO",  # ALL CAPS
        "Designee Address": "10634 NE 11 AVE, MIAMI, FL, 33138",  # ALL CAPS
        "Designee Phone": "(305) 123-4567",
        "Designee Fax": "866-496-4957",
        "Applicant Phone": form_data.get("applicantPhone", ""),  # Business Phone from Airtable
        "Applicant Fax": "",
        "Signature Name": format_signature_name(responsible_name, is_llc, owner_count),  # Same as Line 7a with ",SOLE MEMBER" or ",MEMBER"
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
    
    if is_llc:
        # LLC checkbox
        mapped_data["Checks"]["9a_llc"] = CHECK_COORDS[checkbox_position]
    elif "CORP" in entity_type_upper or "INC" in entity_type_upper or "C-CORP" in entity_type_upper:
        # C-Corp: Corporation checkbox - 25 pixels below Partnership position (only for sole proprietor)
        if is_sole_proprietor:
            mapped_data["Checks"]["9a_corp"] = CHECK_COORDS["9a_corp_sole"]
            mapped_data["9a_corp_form_number"] = "1120"  # Form number for C-Corp (75px to the right of checkbox)
        else:
            # For non-sole proprietor, use the regular position (same as Partnership)
            mapped_data["Checks"]["9a_corp"] = CHECK_COORDS["9a"]
            mapped_data["9a_corp_form_number"] = "1120"  # Form number for C-Corp (75px to the right of checkbox)
        # Line 9b: State of incorporation (ALL CAPS from Formation State column in Airtable)
        mapped_data["9b"] = (formation_state or "FL").upper()
    elif "S-CORP" in entity_type_upper or "S CORP" in entity_type_upper:
        # S-Corp: S Corporation checkbox
        mapped_data["Checks"]["9a_scorp"] = CHECK_COORDS[checkbox_position]
        # Add form number "1120-S" for S-Corp (75px to the right of checkbox)
        mapped_data["9a_corp_form_number"] = "1120-S"  # Form number for S-Corp
        # Line 9b: State of incorporation (ALL CAPS from Formation State column in Airtable)
        mapped_data["9b"] = (formation_state or "FL").upper()
    elif "PARTNERSHIP" in entity_type_upper:
        # Partnership checkbox
        mapped_data["Checks"]["9a_partnership"] = CHECK_COORDS[checkbox_position]
    else:
        # Other entity type
        mapped_data["Checks"]["9a_other"] = CHECK_COORDS[checkbox_position]
    
    # If sole proprietor (single member LLC), add SSN to the field next to the checkbox
    # Use same SSN as Line 7b (or "N/A-FOREIGN" if no SSN)
    if is_sole_proprietor and is_llc:
        if responsible_ssn and responsible_ssn.upper() not in ['N/A-FOREIGN', 'N/A', '']:
            mapped_data["9a_sole_ssn"] = responsible_ssn  # Same SSN as Line 7b
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
                mapped_data["16_other_specify"] = to_upper(line16_other_specify[:45])  # Max 45 chars, ALL CAPS
            else:
                # Default specification if none provided
                mapped_data["16_other_specify"] = to_upper((business_purpose or "GENERAL BUSINESS")[:45])
        else:
            # Default to "Other" if category doesn't match any known category
            mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
            if line16_other_specify:
                mapped_data["16_other_specify"] = to_upper(line16_other_specify[:45])
            else:
                mapped_data["16_other_specify"] = to_upper((business_purpose or "GENERAL BUSINESS")[:45])
    elif line16_other_specify:
        # If only other_specify is provided, check "Other"
        mapped_data["Checks"]["16_other"] = CHECK_COORDS["16_other"]
        mapped_data["16_other_specify"] = to_upper(line16_other_specify[:45])
    
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
            if value:  # Only draw if value exists
                # Convert to uppercase for SS-4 (all content must be ALL CAPS)
                value_str = str(value).upper()
                # Truncate long values to fit in field
                max_length = 50  # Adjust based on field width
                if len(value_str) > max_length:
                    value_str = value_str[:max_length]
                c.drawString(coord[0], coord[1], value_str)
    
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
    for label, coords in checks.items():
        if isinstance(coords, list) and len(coords) >= 2:
            x, y = coords[0], coords[1]
            # Draw checkmark (X) for checkbox
            c.drawString(x, y, "X")
        elif isinstance(coords, tuple) and len(coords) >= 2:
            x, y = coords[0], coords[1]
            c.drawString(x, y, "X")
    
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
    
    # Line 14: First date wages paid - Will not have employees
    if "14_no_employees" in checks:
        c.drawString(CHECK_COORDS["14"][0], CHECK_COORDS["14"][1], "X")
    
    # Line 18: Has applicant applied for EIN before? - Always "No" checked
    if "18_no" in checks:
        coords = checks["18_no"]
        if isinstance(coords, list) and len(coords) >= 2:
            c.drawString(coords[0], coords[1], "X")
    
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

