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

    // Lambda returns Sunbiz search results with entities
    // We need to apply three-tier matching logic:
    // 1. Exact match
    // 2. Normalized match (remove punctuation/spaces/roman numerals)
    // 3. More aggressive normalized match
    
    const inputName = companyName.trim();
    const entities = result?.existing_entities || [];
    
    // Helper: Check if entity is blocking (Active or INACT <1 year)
    const isBlockingEntity = (entity: any): boolean => {
      const status = entity?.status?.toUpperCase() || '';
      
      // Active entities always block
      if (status.includes('ACTIVE') || status === 'ACTIVE') {
        return true;
      }
      
      // INACT entities: check if inactive <1 year from Event Date Filed
      if (status.includes('INACT') || status === 'INACTIVE') {
        const eventDateFiled = entity?.eventDateFiled || entity?.event_date_filed || entity?.lastEventDate;
        if (eventDateFiled) {
          try {
            // Parse date (format: MM/DD/YYYY)
            const [month, day, year] = eventDateFiled.split('/').map(Number);
            const eventDate = new Date(year, month - 1, day);
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            
            // If inactive <1 year, it blocks
            if (eventDate > oneYearAgo) {
              return true;
            }
          } catch (error) {
            console.warn(`⚠️ Could not parse event date: ${eventDateFiled}`, error);
            // If we can't parse the date, assume it blocks to be safe
            return true;
          }
        } else {
          // No event date - assume it blocks to be safe
          return true;
        }
      }
      
      return false;
    };
    
    // Helper: Normalize name (remove punctuation, spaces, roman numerals)
    const normalizeName = (name: string): string => {
      let normalized = name.toUpperCase().trim();
      
      // Remove common entity suffixes
      normalized = normalized.replace(/\b(LLC|L\.L\.C\.|LIMITEDLIABILITYCOMPANY|CORP|CORPORATION|INC|INCORPORATED|LTD|LIMITED)\b/gi, '');
      
      // Remove roman numerals (standalone: I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII, etc.)
      // Pattern matches standalone roman numerals (bounded by word boundaries)
      normalized = normalized.replace(/\b[IVXLCDM]+\b/gi, '');
      
      // Remove all punctuation and spaces
      normalized = normalized.replace(/[^A-Z0-9]/g, ''); // Remove all non-alphanumeric
      
      return normalized;
    };
    
    // Tier 1: Exact match
    let blockingEntities: any[] = [];
    for (const entity of entities) {
      const entityName = entity?.name || '';
      if (entityName.toUpperCase().trim() === inputName.toUpperCase().trim()) {
        if (isBlockingEntity(entity)) {
          blockingEntities.push({ ...entity, matchType: 'exact' });
        }
      }
    }
    
    // Tier 2: Normalized match (remove punctuation/spaces/roman numerals from both input and results)
    if (blockingEntities.length === 0) {
      const normalizedInput = normalizeName(inputName);
      for (const entity of entities) {
        const entityName = entity?.name || '';
        const normalizedEntity = normalizeName(entityName);
        if (normalizedEntity === normalizedInput && normalizedInput.length > 0) {
          if (isBlockingEntity(entity)) {
            blockingEntities.push({ ...entity, matchType: 'normalized' });
          }
        }
      }
    }
    
    // Determine availability
    const finalAvailable = blockingEntities.length === 0;
    let finalMessage: string;
    
    if (blockingEntities.length > 0) {
      const entityNames = blockingEntities.map((e: any) => `${e.name} (${e.status})`).join(', ');
      const matchType = blockingEntities[0].matchType;
      const matchTypeText = matchType === 'exact' ? 'coincidencia exacta' : 
                           matchType === 'normalized' ? 'coincidencia normalizada' : 
                           'coincidencia similar';
      finalMessage = `❌ Nombre no disponible. ${matchTypeText}: ${entityNames}`;
    } else if (entities.length > 0) {
      // Entities found but none are blocking (all INACT >1 year)
      finalMessage = `✅ Nombre disponible. Entidades similares encontradas pero inactivas >1 año.`;
    } else {
      finalMessage = `✅ Nombre disponible. No se encontraron entidades similares.`;
    }
    
    console.log(`✅ Final availability result:`, {
      available: finalAvailable,
      message: finalMessage,
      entitiesFound: entities.length,
      blockingEntities: blockingEntities.length,
      matchType: blockingEntities[0]?.matchType || 'none',
    });

    return NextResponse.json({
      success: result?.success ?? true,
      available: finalAvailable,
      message: finalMessage,
      method: result?.method,
      existingEntities: entities,
      blockingEntities: blockingEntities,
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

