# Ensure Airtable Fields (Lambda + CDK)

**AWS creates** the required document URL fields on the Airtable Formations table so the app stops getting `UNKNOWN_FIELD_NAME` when updating records.

## What it does

The Lambda uses the [Airtable Metadata API](https://airtable.com/developers/web/api/metadata-api) to add any missing fields to the **Formations** table:

- Membership Registry URL  
- Organizational Resolution URL  
- Operating Agreement URL  
- Shareholder Registry URL  
- Bylaws URL  
- SS-4 URL  
- 2848 URL  
- 8821 URL  

Fields that already exist are left unchanged.

## Prerequisites

- AWS CLI and CDK CLI, profile with deploy permissions (e.g. `llc-admin`)
- Airtable **Personal Access Token** with scopes: `schema.bases:read`, `schema.bases:write`
- Airtable **Base ID** (from the base URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`)

## Deploy and run

```bash
export AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
export AIRTABLE_API_KEY=patXXXXXXXXXXXX

cd airtable-fields-cdk
./deploy.sh
```

`deploy.sh` deploys the stack and invokes the Lambda once so the fields are created immediately.

## Run again later

To ensure fields exist (e.g. after a new base or table):

```bash
aws lambda invoke --function-name <FunctionName> --region us-west-1 out.json && cat out.json
```

Get `<FunctionName>` from the stack output **FunctionName** or:

```bash
aws cloudformation describe-stacks --stack-name AirtableFieldsStack --query 'Stacks[0].Outputs' --region us-west-1
```

## Security

The deploy script passes `airtable_api_key` via CDK context, which ends up in the Lambda’s environment (and in CloudFormation). For production, store the token in **AWS Systems Manager Parameter Store** (SecureString) and have the Lambda read it at runtime, or use another secrets mechanism.
