# Membership Registry Templates - ACTUAL S3 Structure

## Overview

Based on the AWS Console exploration, the actual S3 structure for Membership Registry templates is different from what was initially assumed.

## Actual S3 Structure

**Bucket:** `company-formation-template-llc-and-inc`  
**Base Path:** `llc-formation-templates/membership-registry-all-templates/`

### Folder Structure

Templates are organized in folders by **number of members**:

```
llc-formation-templates/membership-registry-all-templates/
├── membership-registry-1-member/          (singular for 1 member)
├── membership-registry-2-members/         (plural for 2+ members)
├── membership-registry-3-members/
├── membership-registry-4-members/
├── membership-registry-5-members/
└── membership-registry-6-members/
```

### File Naming Pattern

Inside each folder, files are named by **number of managers**:

```
Template Membership Registry_{N} Members_{M} Manager.docx
```

Where:
- `{N}` = Number of members (1-6)
- `{M}` = Number of managers (1-6)

### Examples

**1 member, 1 manager:**
```
llc-formation-templates/membership-registry-all-templates/membership-registry-1-member/Template Membership Registry_1 Members_1 Manager.docx
```

**1 member, 6 managers:**
```
llc-formation-templates/membership-registry-all-templates/membership-registry-1-member/Template Membership Registry_1 Members_6 Manager.docx
```

**2 members, 3 managers:**
```
llc-formation-templates/membership-registry-all-templates/membership-registry-2-members/Template Membership Registry_2 Members_3 Manager.docx
```

**6 members, 6 managers:**
```
llc-formation-templates/membership-registry-all-templates/membership-registry-6-members/Template Membership Registry_6 Members_6 Manager.docx
```

## Implementation

### Function: `getMembershipRegistryTemplateName()`

Located in: `src/lib/airtable-to-forms.ts`

```typescript
export function getMembershipRegistryTemplateName(memberCount: number, managerCount: number): string {
  // Cap at 6 for both members and managers (max supported)
  const members = Math.min(Math.max(memberCount, 1), 6);
  const managers = Math.min(Math.max(managerCount, 0), 6);
  
  // Folder name: membership-registry-{N}-member (singular) or membership-registry-{N}-members (plural)
  const folderName = members === 1 
    ? 'membership-registry-1-member'
    : `membership-registry-${members}-members`;
  
  // File name: Template Membership Registry_{N} Members_{M} Manager.docx
  const fileName = `Template Membership Registry_${members} Members_${managers} Manager.docx`;
  
  // Full path
  return `llc-formation-templates/membership-registry-all-templates/${folderName}/${fileName}`;
}
```

### Template Bucket Configuration

The template bucket is different from the documents bucket:

- **Template Bucket:** `company-formation-template-llc-and-inc` (for templates)
- **Documents Bucket:** `avenida-legal-documents` (for generated documents)

Configure in `.env.local`:
```bash
TEMPLATE_BUCKET=company-formation-template-llc-and-inc
S3_DOCUMENTS_BUCKET=avenida-legal-documents
```

### API Route Usage

In `src/app/api/airtable/generate-membership-registry/route.ts`:

```typescript
const TEMPLATE_BUCKET = process.env.TEMPLATE_BUCKET || 'company-formation-template-llc-and-inc';
const TEMPLATE_BASE_URL = `https://${TEMPLATE_BUCKET}.s3.${process.env.AWS_REGION || 'us-west-1'}.amazonaws.com`;

// Get template path
const templatePath = getMembershipRegistryTemplateName(
  membershipRegistryData.memberCount,
  membershipRegistryData.managerCount
);

// Build full URL
const templateUrl = `${TEMPLATE_BASE_URL}/${templatePath}`;
```

## Complete Template Matrix

The system supports:
- **1-6 members** (folders)
- **1-6 managers** (files within each folder)

Total possible combinations: **6 folders × 6 files = 36 templates**

### Available Templates (from AWS Console)

**Folder: `membership-registry-1-member/`**
- `Template Membership Registry_1 Members_1 Manager.docx`
- `Template Membership Registry_1 Members_2 Manager.docx`
- `Template Membership Registry_1 Members_3 Manager.docx`
- `Template Membership Registry_1 Members_4 Manager.docx`
- `Template Membership Registry_1 Members_5 Manager.docx`
- `Template Membership Registry_1 Members_6 Manager.docx`

**Folders 2-6:** Similar structure with corresponding member counts.

## Lambda Function

The Lambda function (`lambda-functions/membership-registry-lambda.py`) expects:

1. **Template URL** pointing to the correct S3 object
2. **Form data** containing:
   - `companyName`
   - `companyAddress`
   - `formationState`
   - `formationDate`
   - `members[]` - Array of member objects
   - `managers[]` - Array of manager objects

The Lambda will:
1. Download the template from S3
2. Replace placeholders (`{{COMPANY_NAME}}`, etc.)
3. Fill the members table
4. Fill the managers table (if present)
5. Upload the filled document to the company's vault

## Notes

- **Folder naming:** Uses singular "member" for 1, plural "members" for 2-6
- **File naming:** Always uses plural "Members" in the filename
- **Manager count:** Files are numbered 1-6 (no 0 manager file visible, but code supports it)
- **Template bucket:** Separate from documents bucket for organization
