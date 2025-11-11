# Airtable CRM Integration Setup

This guide will help you set up Airtable as a CRM for your company formation questionnaire.

## Overview

All questionnaire data will be automatically synced to Airtable after payment, creating a complete CRM with:
- 219 fields covering all questionnaire data
- Company information, owners, directors, officers, managers
- Agreement terms (LLC & C-Corp)
- Document URLs
- Payment information

## Step 1: Create Airtable Base

1. Go to [airtable.com](https://airtable.com)
2. Click **"Create a base"** → **"Start from scratch"**
3. Name it: **"Avenida Legal CRM"**

## Step 2: Create Table

1. In your new base, rename "Table 1" to **"Formations"**
2. You now have an empty table ready for setup

## Step 3: Import Field Structure

### Option A: Import CSV (Easiest)

1. Click the table name → **"..."** → **"Import data"** → **"CSV file"**
2. Upload: `airtable-formations-template.csv` (in project root)
3. Airtable will auto-create all 219 fields!

### Option B: Manual Setup

Create fields manually (not recommended - 219 fields!):
- Company Name (Single line text)
- Entity Type (Single select: LLC, C-Corp)
- Formation State (Single line text)
- ... (see full list in `src/lib/airtable.ts`)

## Step 4: Adjust Field Types

After importing the CSV, you need to change field types from "Single line text" to the correct type:

**Click each field → "Customize field type":**

### Core Fields
- **Total Payment Amount** → Currency (USD)
- **Payment Date** → Date
- **Formation Status** → Single select (Pending, In Progress, Completed, Filed)
- **Entity Type** → Single select (LLC, C-Corp)
- **Internal Status** → Single select (New, Contacted, Documents Sent, Filed, Complete)

### Contact Fields
- **Customer Email** → Email
- **Owner 1-6 Email** → Email
- **Owner 1-6 Phone**, **Business Phone**, **Forward Phone** → Phone number

### Percentage Fields
- **Owner 1-6 Ownership %** → Number (Percent format)
- **LLC New Members Majority %** → Number (Percent format)
- **LLC Company Sale Decision Majority %** → Number (Percent format)
- **Corp New Shareholders Majority %** → Number (Percent format)
- ... (all fields ending with "Majority %")

### URL Fields
- **Owner 1-6 ID Document URL** → URL
- **Membership Registry URL** → URL
- **Organizational Resolution URL** → URL
- **Operating Agreement URL** → URL

### Yes/No Fields
- **Has US Phone** → Single select (Yes, No)
- **Want Agreement** → Single select (Yes, No)
- **LLC Managing Members** → Single select (Yes, No)
- **LLC Member Loans** → Single select (Yes, No)
- **LLC Non Compete** → Single select (Yes, No)
- **LLC ROFR** → Single select (Yes, No)
- ... (all Yes/No fields)

### Decision Fields
- **LLC New Members Admission** → Single select (Decisión Unánime, Mayoría)
- **LLC Company Sale Decision** → Single select (Decisión Unánime, Mayoría)
- ... (all decision fields)

### Number Fields
- **Number of Shares** → Number
- **Owner Count**, **Directors Count**, **Officers Count**, **Managers Count** → Number

## Step 5: Get Airtable Credentials

### Get Base ID
1. Open your base in Airtable
2. Look at the URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`
3. Copy the part starting with `app...` (e.g., `appAbc123Def456Ghi`)

### Get API Key (Personal Access Token)
1. Click your profile picture (top right) → **"Developer hub"**
2. Click **"Create token"**
3. Name: "Avenida Legal API"
4. Scopes: 
   - ✅ `data.records:read`
   - ✅ `data.records:write`
5. Access: Select your "Avenida Legal CRM" base
6. Click **"Create token"**
7. Copy the token (starts with `pat...`)

## Step 6: Add Environment Variables

### Local Development (.env.local)
```bash
AIRTABLE_API_KEY=patXXXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXXXX
AIRTABLE_TABLE_NAME=Formations
```

### Vercel Production
1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add:
   - `AIRTABLE_API_KEY` = `patXXXXXXXXXXXXXXXX`
   - `AIRTABLE_BASE_ID` = `appXXXXXXXXXXXXXXXX`
   - `AIRTABLE_TABLE_NAME` = `Formations`
3. Redeploy your app

## Step 7: Test the Integration

### Option A: Run Setup Script
```bash
npm run setup-airtable
```

This will:
- Test your Airtable connection
- Create a test record
- Verify everything works

### Option B: Use API Endpoint
1. Start your dev server: `npm run dev`
2. Go to: `http://localhost:3000/api/airtable/setup`
3. Check the response for setup instructions
4. POST to the same endpoint to create a test record

### Option C: Complete a Test Payment
1. Go through the questionnaire
2. Complete a test payment (use Stripe test card: `4242 4242 4242 4242`)
3. Check Airtable - a new record should appear automatically!

## Data Flow

```
User completes questionnaire
         ↓
User pays via Stripe
         ↓
Stripe webhook fires
         ↓
System creates S3 vault & documents
         ↓
System syncs to Airtable ← YOU ARE HERE
         ↓
CRM record created with all data
```

## Troubleshooting

### Error: "Table 'Formations' not found"
- Make sure you created the table with the exact name "Formations"
- Check your `AIRTABLE_BASE_ID` is correct

### Error: "Invalid API key"
- Regenerate your Personal Access Token
- Make sure it has `data.records:read` and `data.records:write` scopes
- Check you selected the correct base in the token settings

### Error: "Field not found" or 422 errors
- Make sure you imported the CSV template
- Check all field types are set correctly (not all "Single line text")
- Some fields are required (Company Name, Entity Type, etc.)

### No data syncing after payment
- Check Vercel logs for errors
- Verify environment variables are set in Vercel
- Test the webhook manually using Stripe CLI

## Field Reference

Total fields: **219**

### Categories:
- Core Information: 11 fields
- Company Details: 5 fields
- Phone & Contact: 3 fields
- Owners (1-6): 42 fields (7 per owner)
- Directors (1-6): 12 fields (2 per director)
- Officers (1-6): 18 fields (3 per officer)
- Managers (1-6): 12 fields (2 per manager)
- Documents: 3 fields
- LLC Agreement Terms: ~60 fields
- C-Corp Agreement Terms: ~50 fields
- Admin: 2 fields

## Next Steps

Once Airtable is set up:
1. ✅ Customize views (Grid, Kanban, Calendar)
2. ✅ Set up automations (email notifications, Slack alerts)
3. ✅ Create filtered views (Pending, In Progress, Completed)
4. ✅ Add collaborators to your base
5. ✅ Build custom interfaces for your team

## Support

For issues or questions:
- Check the Airtable API docs: https://airtable.com/developers/web/api/introduction
- Review the code in `src/lib/airtable.ts`
- Test with the setup script: `npm run setup-airtable`

