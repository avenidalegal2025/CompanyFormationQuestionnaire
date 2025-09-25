// src/lib/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

// The DocumentClient wrapper simplifies marshalling/unmarshalling JSON
export const ddb = DynamoDBDocumentClient.from(client);

export const TABLE_NAME =
  process.env.DYNAMO_TABLE_NAME || "Company_Creation_Questionaire_Avenida_Legal";