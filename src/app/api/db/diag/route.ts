import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export async function GET() {
  try {
    const TABLE = process.env.DDB_TABLE_NAME || "Questionnaire"; // adjust if your table has a different name
    const REGION = process.env.AWS_REGION || "us-east-1";

    const client = new DynamoDBClient({ region: REGION });
    const ddb = DynamoDBDocumentClient.from(client);

    // Key for diag test
    const pk = `diag#${new Date().toISOString()}`;

    // Write a test item
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk, __type: "diag", ts: Date.now() },
      })
    );

    // Read it back
    const got = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { pk },
        ConsistentRead: true,
      })
    );

    return NextResponse.json(
      {
        ok: true,
        env: {
          AWS_REGION: REGION,
          DDB_TABLE_NAME: TABLE,
          accessKeySet: !!process.env.AWS_ACCESS_KEY_ID,
          secretKeySet: !!process.env.AWS_SECRET_ACCESS_KEY,
        },
        wroteKey: pk,
        readBack: !!got.Item,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        errorName: err?.name,
        errorMessage: err?.message,
        hint:
          err?.name === "AccessDeniedException"
            ? "IAM policy is missing or wrong resource ARN/region."
            : err?.name === "ResourceNotFoundException"
            ? "Table name/region mismatch."
            : "Check Vercel env vars & IAM user keys.",
      },
      { status: 500 }
    );
  }
}
