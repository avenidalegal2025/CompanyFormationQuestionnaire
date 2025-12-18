# S3 Template Files Required

## Overview
The following template files need to be uploaded to the S3 bucket `avenida-legal-documents` in the `templates/` folder.

## Required Template Files

### 1. Shareholder Registry Template (for Corporations)
- **S3 Path**: `templates/shareholder-registry-template.docx`
- **Used for**: C-Corp, S-Corp, Inc
- **Destination in vault**: `{vault-path}/formation/shareholder-registry.docx`
- **Document ID**: `shareholder-registry`
- **Display Name**: "Shareholder Registry"
- **Appears in**: "Por Firmar" tab for Corporations

### 2. Bylaws Template (for Corporations)
- **S3 Path**: `templates/bylaws-template.docx`
- **Used for**: C-Corp, S-Corp, Inc
- **Destination in vault**: `{vault-path}/formation/bylaws.docx`
- **Document ID**: `bylaws`
- **Display Name**: "Bylaws"
- **Appears in**: "Por Firmar" tab for Corporations

### 3. Membership Registry Template (for LLCs) - Already Exists
- **S3 Path**: `templates/membership-registry-template.docx`
- **Used for**: LLC
- **Destination in vault**: `{vault-path}/formation/membership-registry.docx`
- **Document ID**: `membership-registry`
- **Display Name**: "Membership Registry"
- **Appears in**: "Por Firmar" tab for LLCs

## S3 Bucket Structure

```
avenida-legal-documents/
├── templates/
│   ├── membership-registry-template.docx (already exists)
│   ├── shareholder-registry-template.docx (NEW - needs to be uploaded)
│   ├── bylaws-template.docx (NEW - needs to be uploaded)
│   ├── organizational-resolution-template.docx (already exists)
│   ├── operating-agreement-llc-template.docx (already exists)
│   └── shareholder-agreement-corp-template.docx (already exists)
└── {vault-path}/
    └── formation/
        ├── membership-registry.docx (copied for LLCs)
        ├── shareholder-registry.docx (copied for Corporations)
        ├── bylaws.docx (copied for Corporations)
        └── organizational-resolution.docx (copied for all)
```

## Document Categorization

### For LLCs:
- **Por Firmar**: Membership Registry, Organizational Resolution, Operating Agreement (if purchased)
- **En Proceso**: EIN, Articles of Organization

### For Corporations:
- **Por Firmar**: Shareholder Registry, Bylaws, Organizational Resolution, Shareholder Agreement (if purchased)
- **En Proceso**: EIN, Articles of Incorporation

## Implementation Notes

1. The webhook (`src/app/api/webhooks/stripe/route.ts`) now copies these templates based on entity type:
   - LLCs get: Membership Registry
   - Corporations get: Shareholder Registry + Bylaws

2. Documents with status 'template' are categorized as "Por Firmar" if they are formation documents (Membership Registry, Shareholder Registry, Bylaws, Organizational Resolution)

3. Users can download, sign, and upload these documents from the "Por Firmar" tab

## Action Required

**Upload the following files to S3:**
1. `templates/shareholder-registry-template.docx` - Template for Shareholder Registry
2. `templates/bylaws-template.docx` - Template for Bylaws

These files should be Word documents (.docx) that will be copied to each company's vault when payment is completed.

