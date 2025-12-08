#!/usr/bin/env python3
"""
Test SS-4 Lambda function mappings locally
Tests different scenarios:
1. LLC with owner SSN
2. LLC without owner SSN
3. Corporation
4. S-Corp
"""

import sys
import os
import json

# Add lambda-functions to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda-functions'))

from ss4_lambda_s3_complete import map_data_to_ss4_fields

def test_scenario(name, form_data):
    """Test a specific scenario"""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"{'='*60}")
    
    try:
        mapped = map_data_to_ss4_fields(form_data)
        
        print(f"\n✅ Mapping successful!")
        print(f"\n📋 Key Fields:")
        print(f"  Line 1 (Company Name): {mapped.get('Line 1', 'N/A')}")
        print(f"  Line 7a (Responsible Party): {mapped.get('Line 7a', 'N/A')}")
        print(f"  Line 7b (SSN): {mapped.get('Line 7b', 'N/A')}")
        print(f"  Line 8b (Date Started): {mapped.get('8b', 'N/A')}")
        print(f"  Line 11 (Business Purpose): {mapped.get('11', 'N/A')[:50]}...")
        
        print(f"\n☑️  Checkboxes:")
        checks = mapped.get('Checks', {})
        for check_name in checks:
            print(f"  ✓ {check_name}")
        
        if not checks:
            print("  (No checkboxes)")
        
        print(f"\n📊 Full Mapped Data (JSON):")
        print(json.dumps(mapped, indent=2, default=str))
        
        return True
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

# Test Scenario 1: LLC with owner SSN
scenario_1 = {
    "companyName": "Test Company LLC",
    "companyNameBase": "Test Company",
    "entityType": "LLC",
    "formationState": "Florida",
    "businessPurpose": "Real estate investment and management",
    "companyAddress": "123 Main St, Miami, FL 33101",
    "responsiblePartyName": "John Doe",
    "responsiblePartySSN": "123-45-6789",
    "responsiblePartyAddress": "456 Ocean Dr, Miami, FL 33139",
    "responsiblePartyCity": "Miami",
    "responsiblePartyState": "FL",
    "responsiblePartyZip": "33139",
    "responsiblePartyCountry": "USA",
    "ownerCount": 1,
    "isLLC": "Yes",
    "llcMemberCount": 1,
    "dateBusinessStarted": "2024-01-15",
    "applicantPhone": "(305) 555-1234"
}

# Test Scenario 2: LLC without owner SSN (international owner)
scenario_2 = {
    "companyName": "International LLC",
    "companyNameBase": "International",
    "entityType": "LLC",
    "formationState": "Florida",
    "businessPurpose": "General business operations",
    "companyAddress": "12550 Biscayne Blvd Ste 110, North Miami, FL 33181",
    "responsiblePartyName": "Maria Garcia",
    "responsiblePartySSN": "",  # No SSN - international owner
    "responsiblePartyAddress": "Calle Principal 123, Mexico City, CDMX 01000",
    "responsiblePartyCity": "Mexico City",
    "responsiblePartyState": "",
    "responsiblePartyZip": "01000",
    "responsiblePartyCountry": "MX",
    "ownerCount": 1,
    "isLLC": "Yes",
    "llcMemberCount": 1,
    "dateBusinessStarted": "2024-02-01"
}

# Test Scenario 3: Corporation
scenario_3 = {
    "companyName": "Tech Corp Inc",
    "companyNameBase": "Tech Corp",
    "entityType": "C-Corp",
    "formationState": "Delaware",
    "businessPurpose": "Software development and consulting",
    "companyAddress": "789 Business Ave, San Francisco, CA 94102",
    "responsiblePartyName": "Jane Smith",
    "responsiblePartySSN": "987-65-4321",
    "responsiblePartyAddress": "789 Business Ave, San Francisco, CA 94102",
    "responsiblePartyCity": "San Francisco",
    "responsiblePartyState": "CA",
    "responsiblePartyZip": "94102",
    "responsiblePartyCountry": "USA",
    "ownerCount": 2,
    "isLLC": "No",
    "dateBusinessStarted": "2024-03-01"
}

# Test Scenario 4: LLC with multiple members
scenario_4 = {
    "companyName": "Partners LLC",
    "companyNameBase": "Partners",
    "entityType": "LLC",
    "formationState": "Florida",
    "businessPurpose": "Investment partnership",
    "companyAddress": "100 Wall St, New York, NY 10005",
    "responsiblePartyName": "Robert Johnson",
    "responsiblePartySSN": "555-12-3456",
    "responsiblePartyAddress": "100 Wall St, New York, NY 10005",
    "responsiblePartyCity": "New York",
    "responsiblePartyState": "NY",
    "responsiblePartyZip": "10005",
    "responsiblePartyCountry": "USA",
    "ownerCount": 3,
    "isLLC": "Yes",
    "llcMemberCount": 3,
    "dateBusinessStarted": "2024-04-01"
}

if __name__ == "__main__":
    print("🧪 SS-4 Lambda Function Mapping Tests")
    print("=" * 60)
    
    results = []
    
    results.append(("LLC with Owner SSN", test_scenario("LLC with Owner SSN", scenario_1)))
    results.append(("LLC without Owner SSN", test_scenario("LLC without Owner SSN", scenario_2)))
    results.append(("Corporation", test_scenario("Corporation", scenario_3)))
    results.append(("LLC with Multiple Members", test_scenario("LLC with Multiple Members", scenario_4)))
    
    print(f"\n{'='*60}")
    print("📊 Test Summary")
    print(f"{'='*60}")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")
    
    print(f"\n✅ Passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed!")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed")
        sys.exit(1)

