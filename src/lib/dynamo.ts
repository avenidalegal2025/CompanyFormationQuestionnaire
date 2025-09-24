// src/lib/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Use region from env or default
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

// Create DynamoDB client
const base = new DynamoDBClient({ region: REGION });

// DocumentClient wrapper for easier JSON use
export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  unmarshallOptions: { wrapNumbers: false },
});

// Hard-coded table name for now
export const TABLE_NAME = "Company_Creation_Questionaire_Avenida_Legal";
// If you prefer env-based, swap to:
// export const TABLE_NAME = process.env.DDB_TABLE || "Company_Creation_Questionaire_Avenida_Legal";