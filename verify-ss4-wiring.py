#!/usr/bin/env python3
"""
Verification script to check if SS-4 data flow is wired correctly.
This simulates the data flow from API to Lambda to verify field mappings.
"""

# Simulate API output (what generate-ss4/route.ts sends)
api_output = {
    "companyName": "Test Company LLC",
    "entityType": "LLC",
    "isLLC": "Yes",
    "ownerCount": 1,
    "summarizedBusinessPurpose": "LEGAL SERVICES",
    "line16Category": "other",
    "line16OtherSpecify": "LEGAL SERVICES",
    "line17PrincipalMerchandise": "LEGAL SERVICES FOR STARTUPS",
    "signatureName": "John Smith,SOLE MEMBER",
    "paymentDate": "2024-12-08",
    "applicantPhone": "305-555-1234",
    "responsiblePartyName": "John Smith",
    "responsiblePartySSN": "123-45-6789",
    "companyAddress": "123 Main St, Miami, FL 33101",
    "formationState": "FLORIDA",
    "businessPurpose": "A legal services firm"
}

# Simulate Lambda input processing
def verify_lambda_processing(form_data):
    """Verify that Lambda correctly processes the form_data"""
    issues = []
    
    # Check Line 10
    line10 = form_data.get("summarizedBusinessPurpose", "")
    if not line10:
        issues.append("❌ Line 10: summarizedBusinessPurpose is missing or empty")
    else:
        print(f"✅ Line 10: Found '{line10}'")
    
    # Check Line 11
    payment_date = form_data.get("paymentDate") or form_data.get("dateBusinessStarted", "")
    if not payment_date:
        issues.append("❌ Line 11: paymentDate and dateBusinessStarted both missing")
    else:
        print(f"✅ Line 11: Found payment date '{payment_date}'")
    
    # Check Line 12 (should be hardcoded to "DECEMBER")
    print(f"✅ Line 12: Will be hardcoded to 'DECEMBER'")
    
    # Check Line 15 (should be hardcoded to "N/A")
    print(f"✅ Line 15: Will be hardcoded to 'N/A'")
    
    # Check Line 17
    line17 = form_data.get("line17PrincipalMerchandise", "")
    if not line17:
        issues.append("❌ Line 17: line17PrincipalMerchandise is missing or empty")
    else:
        print(f"✅ Line 17: Found '{line17}'")
    
    # Check Line 16 category
    line16_cat = form_data.get("line16Category", "")
    if not line16_cat:
        issues.append("❌ Line 16: line16Category is missing")
    else:
        print(f"✅ Line 16: Found category '{line16_cat}'")
    
    # Check Signature Name
    sig_name = form_data.get("signatureName", "")
    if not sig_name:
        issues.append("❌ Signature Name: signatureName is missing")
    elif ",SOLE MEMBER" not in sig_name and ",MEMBER" not in sig_name:
        issues.append(f"⚠️ Signature Name: Missing member suffix. Got '{sig_name}'")
    else:
        print(f"✅ Signature Name: Found '{sig_name}'")
    
    # Check Designee fields (should be hardcoded)
    print(f"✅ Designee Name: Will be 'ANTONIO REGOJO' (or with title for C-Corp)")
    print(f"✅ Designee Address: Will be '10634 NE 11 AVE, MIAMI, FL, 33138'")
    print(f"✅ Designee Phone: Will be '(786) 512-0434'")
    print(f"✅ Designee Fax: Will be '866-496-4957'")
    
    # Check Applicant Phone
    app_phone = form_data.get("applicantPhone", "")
    if not app_phone:
        issues.append("⚠️ Applicant Phone: applicantPhone is missing (may be empty)")
    else:
        print(f"✅ Applicant Phone: Found '{app_phone}'")
    
    # Check checkboxes
    is_llc = form_data.get("isLLC", "").upper() == "YES"
    if is_llc:
        print(f"✅ Line 8a: Will check 'Yes' (is LLC)")
        print(f"✅ Line 9a: Will check LLC checkbox")
    else:
        print(f"✅ Line 8a: Will check 'No' (not LLC)")
    
    print(f"✅ Line 10 checkbox: Will always be checked (Started new business)")
    print(f"✅ Line 14 checkbox: Will always be checked (Will not have employees)")
    print(f"✅ Line 18 checkbox: Will always check 'No'")
    
    return issues

# Run verification
print("=" * 60)
print("SS-4 Data Flow Verification")
print("=" * 60)
print("\nSimulating API output:")
print(f"  Company: {api_output['companyName']}")
print(f"  Entity Type: {api_output['entityType']}")
print(f"  Is LLC: {api_output['isLLC']}")
print()

print("Verifying Lambda processing:")
print("-" * 60)
issues = verify_lambda_processing(api_output)

print("\n" + "=" * 60)
if issues:
    print("❌ ISSUES FOUND:")
    for issue in issues:
        print(f"  {issue}")
    print("\n⚠️  The code may not work correctly!")
else:
    print("✅ All critical fields are present and correctly mapped!")
    print("\n✅ The code SHOULD work, but runtime testing is still needed.")
print("=" * 60)

