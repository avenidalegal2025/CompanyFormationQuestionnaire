import { NextRequest, NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = process.env.AWS_REGION || "us-west-1";
const FUNCTION_NAME = process.env.SUNBIZ_LAMBDA_NAME || "check-company-availability";

const lambdaClient = new LambdaClient({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export async function POST(req: NextRequest) {
  try {
    const { companyName, entityType, formationState } = await req.json();

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    if (formationState !== "Florida") {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Availability check is only supported for Florida at this time.",
      });
    }

    const payload = {
      companyName,
      entityType,
    };

    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await lambdaClient.send(command);
    const raw = response.Payload ? Buffer.from(response.Payload).toString("utf-8") : "{}";

    // Lambda might return a JSON string or an object with body
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
      if (parsed && typeof parsed.body === "string") {
        parsed = { ...parsed, ...JSON.parse(parsed.body) };
      }
    } catch {
      parsed = { error: "Invalid response from Lambda" };
    }

    if (parsed.error) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...parsed });
  } catch (err) {
    console.error("check-name API error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


