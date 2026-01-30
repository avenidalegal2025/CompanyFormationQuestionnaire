# Membership Registry Implementation Summary

## ✅ Completed Implementation

### 1. **S3 Structure Discovery**
Based on AWS Console exploration, the actual structure is:
- **Bucket:** `company-formation-template-llc-and-inc`
- **Base Path:** `llc-formation-templates/membership-registry-all-templates/`
- **Folders:** Organized by member count (1-6)
- **Files:** Named by manager count (1-6)

### 2. **Code Updates**

#### `src/lib/airtable-to-forms.ts`
- ✅ `mapAirtableToMembershipRegistry()` - Maps Airtable data including:
  - Company information
  - Members (owners) with ownership percentages
  - Managers
  - Returns `memberCount` and `managerCount`
- ✅ `getMembershipRegistryTemplateName()` - Generates correct S3 path:
  - Handles singular/plural folder names (1-member vs 2-members)
  - Generates correct filename format
  - Returns full S3 path

#### `src/app/api/airtable/generate-membership-registry/route.ts`
- ✅ Fetches Airtable record
- ✅ Maps to Membership Registry format
- ✅ Selects correct template based on member/manager counts
- ✅ Calls Lambda with correct template URL
- ✅ Uploads filled document to company vault

#### `lambda-functions/membership-registry-lambda.py`
- ✅ Downloads template from S3
- ✅ Replaces placeholders (`{{COMPANY_NAME}}`, etc.)
- ✅ Fills members table
- ✅ Fills managers table
- ✅ Uploads filled document to S3

### 3. **Template Selection Logic**

The system automatically selects templates based on:
- **Member Count** (1-6) → Determines folder
- **Manager Count** (0-6) → Determines file

**Example:**
- 2 members, 3 managers → 
  `llc-formation-templates/membership-registry-all-templates/membership-registry-2-members/Template Membership Registry_2 Members_3 Manager.docx`

### 4. **Configuration**

**Environment Variables:**
```bash
# Template bucket (where templates are stored)
TEMPLATE_BUCKET=company-formation-template-llc-and-inc

# Documents bucket (where filled documents are saved)
S3_DOCUMENTS_BUCKET=avenida-legal-documents

# Lambda URL
LAMBDA_MEMBERSHIP_REGISTRY_URL=<lambda-function-url>
```

## 📋 Template Structure

### Folder Naming:
- `membership-registry-1-member/` (singular)
- `membership-registry-2-members/` (plural)
- `membership-registry-3-members/` (plural)
- ... up to 6

### File Naming:
- `Template Membership Registry_{N} Members_{M} Manager.docx`
- Where N = member count, M = manager count

### Available Templates (from AWS Console):
- **6 folders** (1-6 members)
- **6 files per folder** (1-6 managers)
- **Total: 36 templates**

## 🔄 Data Flow

1. **API receives request** with Airtable `recordId`
2. **Fetches Airtable record** and extracts:
   - Company info
   - Owner count → member count
   - Manager count
3. **Maps data** using `mapAirtableToMembershipRegistry()`
4. **Selects template** using `getMembershipRegistryTemplateName()`
5. **Calls Lambda** with:
   - Form data (company, members, managers)
   - Template URL
   - S3 destination
6. **Lambda processes**:
   - Downloads template
   - Fills placeholders
   - Fills tables
   - Uploads to company vault
7. **Document available** in client dashboard for download

## 📝 Next Steps

1. **Deploy Lambda Function:**
   - Create Lambda function in AWS
   - Install dependencies: `python-docx`, `boto3`
   - Set environment variables
   - Configure Lambda URL

2. **Test Template Selection:**
   - Test with different member/manager combinations
   - Verify correct template is selected
   - Verify template exists in S3

3. **Test Document Generation:**
   - Call API with test Airtable record
   - Verify document is generated correctly
   - Verify document appears in dashboard

4. **Add to Client Dashboard:**
   - Add "Generate Membership Registry" button
   - Show generated document in "Por Firmar" tab
   - Enable download functionality

## 🎯 Key Features

- ✅ Automatic template selection based on LLC structure
- ✅ Dynamic table filling (members and managers)
- ✅ Support for 1-6 members and 0-6 managers
- ✅ Proper handling of singular/plural folder names
- ✅ Integration with existing document vault system
- ✅ Ready for client dashboard integration
