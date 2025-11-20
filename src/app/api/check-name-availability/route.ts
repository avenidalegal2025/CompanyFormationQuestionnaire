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

    // Trust Lambda's result first - it does the actual Sunbiz search
    let finalAvailable = result?.available ?? false;
    let finalMessage = result?.message || 'No se pudo determinar la disponibilidad';

    // Additional validation: Only if Lambda says available, do a conservative double-check
    // Normalize company name for comparison (remove entity suffixes, normalize spacing, special chars)
    const normalizeName = (name: string) => {
      return name
        .toUpperCase()
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
        .trim()
        .replace(/[^A-Z0-9\s]/g, '') // Remove special characters but keep spaces
        .replace(/\s+/g, '') // THEN remove spaces for comparison (spaces don't matter for entity names)
        .replace(/\b(LLC|L\.L\.C\.|LIMITEDLIABILITYCOMPANY|CORP|CORPORATION|INC|INCORPORATED|LTD|LIMITED)\b/gi, ''); // Remove entity suffixes
    };

    // Only do additional checking if Lambda says available (to catch cases Lambda might miss)
    // OR if Lambda found entities but marked as available (shouldn't happen, but safety check)
    if (finalAvailable && result?.existing_entities && Array.isArray(result.existing_entities) && result.existing_entities.length > 0) {
      const normalizedInputName = normalizeName(companyName);
      
      // Check existing entities for similar normalized names
      const conflictingEntities = result.existing_entities.filter((entity: any) => {
        if (!entity.name) return false;
        const normalizedEntityName = normalizeName(entity.name);
        // Check if normalized names match (handles "AVENIDALEGAL" vs "AVENIDA LEGAL, LLC")
        // Spaces are removed in normalization because they don't matter for entity name conflicts
        return normalizedEntityName === normalizedInputName;
      });

      if (conflictingEntities.length > 0) {
        const activeConflicts = conflictingEntities.filter((e: any) => 
          e.status && e.status.toUpperCase().includes('ACTIVE')
        );

        if (activeConflicts.length > 0) {
          // Found active conflicts with normalized name match - override Lambda's result
          finalAvailable = false;
          const conflictNames = activeConflicts.map((e: any) => `${e.name} (${e.status})`).join(', ');
          finalMessage = `❌ Nombre no disponible. Entidades activas encontradas: ${conflictNames}`;
          console.log(`🚨 Found active conflict after normalization (Lambda said available but conflict found):`, {
            input: companyName,
            normalizedInput: normalizedInputName,
            conflicts: activeConflicts,
          });
        }
      }
    }

    // If Lambda says not available, enhance the message with entity details
    if (!finalAvailable && result?.existing_entities && Array.isArray(result.existing_entities) && result.existing_entities.length > 0) {
      const activeEntities = result.existing_entities.filter((e: any) => 
        e.status && e.status.toUpperCase().includes('ACTIVE')
      );

      if (activeEntities.length > 0 && !finalMessage.includes('Entidades activas encontradas')) {
        const entityNames = activeEntities.map((e: any) => `${e.name} (${e.status})`).join(', ');
        finalMessage = `❌ Nombre no disponible. Entidades activas encontradas: ${entityNames}`;
      } else if (result.existing_entities.length > 0 && !finalMessage.includes('encontrado')) {
        const entityNames = result.existing_entities.map((e: any) => `${e.name} (${e.status || 'N/A'})`).join(', ');
        finalMessage = `⚠️ Nombre similar encontrado: ${entityNames}. Se recomienda elegir un nombre diferente.`;
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

