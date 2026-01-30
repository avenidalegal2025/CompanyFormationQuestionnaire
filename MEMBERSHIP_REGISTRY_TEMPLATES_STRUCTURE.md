# Membership Registry Templates Structure

## Overview

The Membership Registry templates are stored in S3 bucket `avenida-legal-documents` under the `templates/` folder. The templates are organized by the number of **members** (owners) and **managers** that the LLC has.

## Template Naming Convention

Templates follow this naming pattern:
```
templates/membership-registry-template-{members}-{managers}.docx
```

Where:
- `{members}` = Number of members (owners) in the LLC (1-6)
- `{managers}` = Number of managers in the LLC (0-6)

### Examples:
- `membership-registry-template-1-0.docx` - 1 member, 0 managers (sole member, member-managed)
- `membership-registry-template-2-1.docx` - 2 members, 1 manager (manager-managed)
- `membership-registry-template-3-2.docx` - 3 members, 2 managers
- `membership-registry-template-6-6.docx` - 6 members, 6 managers (maximum)

## Expected Template Structure

Based on the Lambda function code (`lambda-functions/membership-registry-lambda.py`), each template should contain:

### 1. Placeholders for Company Information
- `{{COMPANY_NAME}}` - Full legal name of the LLC
- `{{COMPANY_ADDRESS}}` - Full address of the LLC (multi-line)
- `{{FORMATION_STATE}}` - State where the LLC is being formed
- `{{FORMATION_DATE}}` - Date of formation (MM/DD/YYYY format)

### 2. Members Table
A table with the following columns:
- **Column 0**: Member Name
- **Column 1**: Member Address
- **Column 2**: Ownership Percentage
- **Column 3**: SSN (optional, shows "N/A" if not available)

The table should have:
- A header row with column names
- Dynamic rows that will be filled with member data
- The Lambda will add/remove rows as needed based on the number of members

### 3. Managers Table (if managers > 0)
A table with the following columns:
- **Column 0**: Manager Name
- **Column 1**: Manager Address

The table should have:
- A header row with column names (must contain "manager" and "name" in the header text)
- Dynamic rows that will be filled with manager data
- The Lambda will add/remove rows as needed based on the number of managers

## Template Selection Logic

The system automatically selects the correct template based on:
1. **Member Count**: Number of owners in the LLC (from Airtable `Owner Count` field)
2. **Manager Count**: Number of managers in the LLC (from Airtable `Managers Count` field)

The selection function (`getMembershipRegistryTemplateName` in `src/lib/airtable-to-forms.ts`):
- Caps member count at 6 (maximum supported)
- Caps manager count at 6 (maximum supported)
- Ensures minimum of 1 member
- Ensures minimum of 0 managers

## Complete Template Matrix

The system supports up to **6 members** and **6 managers**, which means there could be up to **42 different templates** (6 × 7 = 42 combinations):

| Members | Managers | Template Name |
|---------|----------|---------------|
| 1 | 0 | `membership-registry-template-1-0.docx` |
| 1 | 1 | `membership-registry-template-1-1.docx` |
| 1 | 2 | `membership-registry-template-1-2.docx` |
| ... | ... | ... |
| 1 | 6 | `membership-registry-template-1-6.docx` |
| 2 | 0 | `membership-registry-template-2-0.docx` |
| 2 | 1 | `membership-registry-template-2-1.docx` |
| ... | ... | ... |
| 6 | 6 | `membership-registry-template-6-6.docx` |

## Current Implementation

### Code Locations:
1. **Template Selection**: `src/lib/airtable-to-forms.ts` - `getMembershipRegistryTemplateName()`
2. **Data Mapping**: `src/lib/airtable-to-forms.ts` - `mapAirtableToMembershipRegistry()`
3. **API Endpoint**: `src/app/api/airtable/generate-membership-registry/route.ts`
4. **Lambda Function**: `lambda-functions/membership-registry-lambda.py`

### Data Flow:
1. API receives Airtable `recordId`
2. Fetches record from Airtable
3. Maps data using `mapAirtableToMembershipRegistry()` which:
   - Extracts company information
   - Collects all members (owners) with their ownership percentages
   - Collects all managers
   - Returns `memberCount` and `managerCount`
4. Selects template using `getMembershipRegistryTemplateName(memberCount, managerCount)`
5. Calls Lambda with:
   - Form data (company info, members, managers)
   - Template URL
   - S3 destination path
6. Lambda:
   - Downloads template from S3
   - Replaces placeholders
   - Fills member table
   - Fills manager table (if applicable)
   - Uploads filled document to company vault

## Template Requirements

### For Each Template:
1. **Must be a valid Word document** (.docx format)
2. **Must contain placeholders** for company information
3. **Must have a members table** with proper header row
4. **Must have a managers table** (if managers > 0) with proper header row
5. **Tables must be editable** - Lambda will add/remove rows dynamically

### Table Detection:
The Lambda identifies tables by:
- **Members table**: Header row contains "name" AND ("address" OR "ownership")
- **Managers table**: Header row contains "manager" AND "name"

## Folder Structure in S3

```
avenida-legal-documents/
└── templates/
    ├── membership-registry-template-1-0.docx
    ├── membership-registry-template-1-1.docx
    ├── membership-registry-template-1-2.docx
    ├── ...
    ├── membership-registry-template-2-0.docx
    ├── membership-registry-template-2-1.docx
    ├── ...
    ├── membership-registry-template-6-6.docx
    ├── shareholder-registry-template.docx
    ├── bylaws-template.docx
    ├── organizational-resolution-template.docx
    └── ...
```

## Legacy Support

The code still supports the legacy single template format:
- `templates/membership-registry-template.docx` (without member/manager counts)

If a specific template is not found, the system will fall back to this legacy template.

## Next Steps

To explore the actual templates in S3:

1. **Using AWS CLI** (if configured):
   ```bash
   aws s3 ls s3://avenida-legal-documents/templates/ --recursive | grep membership-registry
   ```

2. **Using the Python script** (requires valid AWS credentials):
   ```bash
   python3 scripts/list_membership_registry_templates.py
   ```

3. **Using AWS Console**:
   - Navigate to S3 bucket `avenida-legal-documents`
   - Go to `templates/` folder
   - Filter by `membership-registry-template`

## Notes

- Templates are case-sensitive
- Template names must match exactly: `membership-registry-template-{N}-{M}.docx`
- The Lambda will create/remove table rows dynamically, so templates should have at least one data row as a template
- All placeholders use double curly braces: `{{PLACEHOLDER_NAME}}`
