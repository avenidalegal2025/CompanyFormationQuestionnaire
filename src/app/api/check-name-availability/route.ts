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

    // Trust Lambda's result completely - it handles:
    // 1. Sunbiz search for the input name
    // 2. Checking INACT entities' detail pages to see if inactive >1 year from Event Date Filed
    // 3. Similarity rules: singular/plural/possessive are the same; punctuation/spaces don't matter
    // 4. ACTIVE entities = not available
    // 5. INACT entities inactive >1 year = available (if no conflicts)
    
    const finalAvailable = result?.available ?? false;
    let finalMessage = result?.message || 'No se pudo determinar la disponibilidad';

    // Enhance message with entity details if available
    if (result?.existing_entities && Array.isArray(result.existing_entities) && result.existing_entities.length > 0) {
      const activeEntities = result.existing_entities.filter((e: any) => 
        e.status && (e.status.toUpperCase().includes('ACTIVE') || e.status === 'Active')
      );

      const inactiveEntities = result.existing_entities.filter((e: any) => 
        e.status && (e.status.toUpperCase().includes('INACT') || e.status === 'Inactive')
      );

      if (activeEntities.length > 0) {
        // Active entities found - name is not available
        const entityNames = activeEntities.map((e: any) => `${e.name} (${e.status})`).join(', ');
        finalMessage = `❌ Nombre no disponible. Entidades activas encontradas: ${entityNames}`;
      } else if (inactiveEntities.length > 0 && finalAvailable) {
        // Inactive entities found but Lambda determined they're available (inactive >1 year)
        const entityNames = inactiveEntities.map((e: any) => `${e.name} (${e.status})`).join(', ');
        finalMessage = `✅ Nombre disponible. Entidades inactivas encontradas (inactivas >1 año): ${entityNames}`;
      } else if (result.existing_entities.length > 0 && !finalAvailable) {
        // Similar names found but not available for other reasons
        const entityNames = result.existing_entities.map((e: any) => `${e.name} (${e.status || 'N/A'})`).join(', ');
        finalMessage = `❌ Nombre no disponible. Entidades encontradas: ${entityNames}`;
      }
    }

    console.log(`✅ Final availability result:`, {
      available: finalAvailable,
      message: finalMessage,
      entitiesFound: result?.existing_entities?.length || 0,
    });

    // Lambda returns: { success: boolean, available: boolean, message: string, method?: string, existing_entities?: array }
    // The Lambda should handle all the logic:
    // - ACTIVE = not available
    // - INACT with Event Date Filed >1 year ago = available
    // - Similarity checks (singular/plural/possessive, punctuation/spaces)
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

