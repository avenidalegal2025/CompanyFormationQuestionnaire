import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-1" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMO_TABLE_NAME || "Company_Creation_Questionaire_Avenida_Legal";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { anonymousId, userId } = await request.json();
    if (!anonymousId || !userId) {
      return NextResponse.json({ error: "anonymousId and userId are required" }, { status: 400 });
    }

    // Get the anonymous draft
    const getAnonymousCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `anon_${anonymousId}`,
        sk: "DRAFT"
      }
    });

    const anonymousResult = await docClient.send(getAnonymousCommand);
    if (!anonymousResult.Item) {
      return NextResponse.json({ error: "Anonymous draft not found" }, { status: 404 });
    }

    // Create the user draft
    const userDraft = {
      ...anonymousResult.Item,
      pk: userId,
      sk: "DRAFT",
      owner: userId,
      migratedFrom: `anon_${anonymousId}`,
      migratedAt: Date.now()
    };

    const putUserCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: userDraft
    });

    await docClient.send(putUserCommand);

    // Delete the anonymous draft
    const deleteAnonymousCommand = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `anon_${anonymousId}`,
        sk: "DRAFT"
      }
    });

    await docClient.send(deleteAnonymousCommand);

    return NextResponse.json({ 
      ok: true, 
      migratedDraft: {
        id: userDraft.pk,
        draftId: userDraft.pk,
        owner: userDraft.owner,
        data: userDraft.data,
        updatedAt: userDraft.updatedAt
      }
    });

  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
