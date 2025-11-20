import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({
  region: 'us-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const LAMBDA_FUNCTION_ARN = 'arn:aws:lambda:us-west-1:043206426879:function:sunbiz-lambda-latest';

export async function POST(request: NextRequest) {
  try {
    const { companyName, entityType } = await request.json();

    if (!companyName || typeof companyName !== 'string') {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking name availability for: ${companyName} (${entityType || 'N/A'})`);

    // Prepare payload for Lambda
    const payload = {
      companyName: companyName.trim(),
      entityType: entityType || 'LLC', // Default to LLC if not provided
    };

    console.log(`📤 Invoking Lambda: ${LAMBDA_FUNCTION_ARN}`);
    console.log(`📋 Payload:`, JSON.stringify(payload));

    // Invoke Lambda function
    const command = new InvokeCommand({
      FunctionName: LAMBDA_FUNCTION_ARN,
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);

    console.log(`📡 Lambda response status: ${response.StatusCode}`);
    console.log(`📡 Lambda response logResult: ${response.LogResult || 'N/A'}`);

    if (response.FunctionError) {
      console.error(`❌ Lambda function error: ${response.FunctionError}`);
      const errorPayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : null;
      return NextResponse.json(
        { 
          error: 'Lambda function error',
          details: errorPayload || response.FunctionError,
        },
        { status: 500 }
      );
    }

    // Parse Lambda response
    const responsePayload = response.Payload 
      ? JSON.parse(Buffer.from(response.Payload).toString())
      : null;

    console.log(`✅ Lambda response payload:`, JSON.stringify(responsePayload, null, 2));

    // Lambda returns { statusCode: 200, body: "..." } where body is a JSON string
    let result;
    if (responsePayload?.body) {
      // Parse the body JSON string
      try {
        result = JSON.parse(responsePayload.body);
      } catch (parseError) {
        console.error('❌ Failed to parse Lambda body:', parseError);
        // Fallback: try to use responsePayload directly
        result = responsePayload;
      }
    } else {
      // Fallback: use responsePayload directly if no body field
      result = responsePayload;
    }

    console.log(`✅ Parsed result:`, JSON.stringify(result, null, 2));

    // Additional validation: Check if any existing entities have similar names
    // Normalize company name for comparison (remove spaces, special chars, convert to uppercase)
    const normalizeName = (name: string) => {
      return name
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/[^A-Z0-9]/g, '')
        .replace(/\b(LLC|L\.L\.C\.|LIMITEDLIABILITYCOMPANY|CORP|CORPORATION|INC|INCORPORATED|LTD|LIMITED)\b/gi, '');
    };

    const normalizedInputName = normalizeName(companyName);
    let finalAvailable = result?.available ?? false;
    let finalMessage = result?.message || 'No se pudo determinar la disponibilidad';

    // Check existing entities for similar names
    if (result?.existing_entities && Array.isArray(result.existing_entities)) {
      const conflictingEntities = result.existing_entities.filter((entity: any) => {
        if (!entity.name) return false;
        const normalizedEntityName = normalizeName(entity.name);
        // Check if normalized names are similar (exact match or very close)
        return normalizedEntityName === normalizedInputName || 
               normalizedEntityName.includes(normalizedInputName) ||
               normalizedInputName.includes(normalizedEntityName);
      });

      if (conflictingEntities.length > 0) {
        const activeConflicts = conflictingEntities.filter((e: any) => 
          e.status && e.status.toUpperCase().includes('ACTIVE')
        );

        if (activeConflicts.length > 0) {
          finalAvailable = false;
          const conflictNames = activeConflicts.map((e: any) => e.name).join(', ');
          finalMessage = `Nombre no disponible. Entidades similares activas encontradas: ${conflictNames}`;
        } else if (conflictingEntities.length > 0) {
          // Similar names exist but not active - still warn
          finalAvailable = false;
          const conflictNames = conflictingEntities.map((e: any) => e.name).join(', ');
          finalMessage = `Nombre similar encontrado: ${conflictNames}. Se recomienda elegir un nombre diferente.`;
        }
      }
    }

    console.log(`✅ Final availability check:`, {
      originalAvailable: result?.available,
      finalAvailable,
      finalMessage,
    });

    // Lambda returns: { success: boolean, available: boolean, message: string, method?: string, existing_entities?: array }
    return NextResponse.json({
      success: result?.success ?? true,
      available: finalAvailable,
      message: finalMessage,
      method: result?.method,
      existingEntities: result?.existing_entities,
    });

  } catch (error: any) {
    console.error('❌ Error checking name availability:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check name availability',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

