// src/lib/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME =
  process.env.DDB_TABLE_NAME || "Company_Creation_Questionaire_Avenida_Legal";

// Prefer the region from env; default to us-east-1 if not set
const REGION = process.env.AWS_REGION || "us-east-1";

// The AWS SDK will automatically use the usual env vars if present:
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional)
// On Vercel, set those in Project Settings → Environment Variables.
const client = new DynamoDBClient({
  region: REGION,
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    // keep undefined out of items
    removeUndefinedValues: true,
    // leave numbers as numbers (don’t stringify)
    convertClassInstanceToMap: true,
  },
});