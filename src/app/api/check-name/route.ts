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
    let parsed: unknown = {};
    try {
      const first = JSON.parse(raw) as unknown;
      if (first && typeof first === "object" && "body" in (first as Record<string, unknown>) && typeof (first as { body?: unknown }).body === "string") {
        const merged = { ...(first as Record<string, unknown>), ...(JSON.parse((first as { body: string }).body) as Record<string, unknown>) };
        parsed = merged;
      } else {
        parsed = first;
      }
    } catch {
      parsed = { error: "Invalid response from Lambda" };
    }

    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const p = parsed as { error?: string };
      return NextResponse.json({ success: false, error: p.error || "Unknown error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...(parsed as Record<string, unknown>) });
  } catch (err) {
    console.error("check-name API error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


