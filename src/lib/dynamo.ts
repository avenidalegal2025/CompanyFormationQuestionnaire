// src/lib/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// The SDK will read AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION from env.
// You can optionally fall back to a region if not set.
const region =
  process.env.AWS_REGION ??
  process.env.DYNAMO_REGION ??
  "us-west-1";

// Low-level client
const ddb = new DynamoDBClient({ region });

// High-level Document client (maps JS objects <-> DynamoDB JSON)
const ddbDoc = DynamoDBDocumentClient.from(ddb, {
  marshallOptions: { removeUndefinedValues: true },
});

export { ddb, ddbDoc };