# Subdomain Setup for AWS SES

## Step 1: Create Subdomain
1. Go to your domain registrar (where you manage avenidalegal.com)
2. Add a CNAME record:
   - Name: questionnaire (or forms, app, etc.)
   - Value: your-app-domain.com (where you'll host the app)
   - TTL: 300 (5 minutes)

## Step 2: Verify Subdomain in AWS SES
1. Go to AWS SES Console
2. Create identity → Domain
3. Enter: questionnaire.avenidalegal.com
4. Add the required DNS records to your domain

## Step 3: Update Environment Variables
```bash
FROM_EMAIL=noreply@questionnaire.avenidalegal.com
NEXT_PUBLIC_BASE_URL=https://questionnaire.avenidalegal.com
```

## Benefits:
- ✅ Professional email address
- ✅ No impact on main domain
- ✅ Easy to manage
- ✅ Can be removed anytime
