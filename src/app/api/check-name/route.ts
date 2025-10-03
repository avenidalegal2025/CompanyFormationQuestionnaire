import { NextRequest, NextResponse } from "next/server";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const REGION = "us-west-1";
const SUNBIZ_FUNCTION_NAME = "SearchfNewLLCSunbiz";
const WYOMING_FUNCTION_NAME = "wyoming-lambda";

console.log("Environment check:");
console.log("AWS_REGION:", process.env.AWS_REGION);
console.log("SUNBIZ_LAMBDA_NAME:", process.env.SUNBIZ_LAMBDA_NAME);
console.log("AWS_ACCESS_KEY_ID exists:", !!process.env.AWS_ACCESS_KEY_ID);
console.log("AWS_SECRET_ACCESS_KEY exists:", !!process.env.AWS_SECRET_ACCESS_KEY);
console.log("Final REGION:", REGION);

const lambdaClient = new LambdaClient({
  region: REGION,
  // Let AWS SDK use default credential chain
});

export async function POST(req: NextRequest) {
  try {
    const { companyName, entityType, formationState } = await req.json();

    if (!companyName || typeof companyName !== "string") {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    // Determine which Lambda function to use based on formation state
    let functionName: string;
    if (formationState === "Florida") {
      functionName = SUNBIZ_FUNCTION_NAME;
    } else if (formationState === "Wyoming") {
      functionName = WYOMING_FUNCTION_NAME;
    } else {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: "Availability check is only supported for Florida and Wyoming at this time.",
      });
    }

    const payload = {
      companyName,
      entityType,
    };

    console.log("Lambda function name:", functionName);
    console.log("AWS region:", REGION);
    console.log("Payload:", payload);

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    });

    const response = await lambdaClient.send(command);
    const raw = response.Payload ? Buffer.from(response.Payload).toString("utf-8") : "{}";

    // Parse Lambda response
    let parsed: Record<string, unknown> = {};
    try {
      const first = JSON.parse(raw);
      if (first && typeof first === "object" && "body" in first && typeof first.body === "string") {
        // New simplified response format - body contains the user message
        const message = first.body;
        const available = message.includes("AVAILABLE") && !message.includes("NOT AVAILABLE");
        parsed = { available, message };
      } else {
        // Fallback to old format
        parsed = first;
      }
    } catch {
      parsed = { error: "Invalid response from Lambda" };
    }

    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const p = parsed as { error?: string };
      return NextResponse.json({ success: false, error: p.error || "Unknown error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...parsed });
  } catch (err) {
    console.error("check-name API error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


