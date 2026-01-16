import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambdaClient = new LambdaClient({
  region: 'us-west-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const LAMBDA_FUNCTION_ARN = 'arn:aws:lambda:us-west-1:043206426879:function:sunbiz-lambda-latest';
const LAMBDA_FUNCTION_URL = process.env.LAMBDA_NAME_AVAILABILITY_URL ||
  'https://wk3xyxceloos7e5xgslyvfntqa0thtxv.lambda-url.us-west-1.on.aws/';
const HAS_AWS_CREDS = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

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

    console.log(`📋 Payload:`, JSON.stringify(payload));

    const invokeNameSearch = async (requestPayload: { companyName: string; entityType: string }) => {
      if (!HAS_AWS_CREDS && LAMBDA_FUNCTION_URL) {
        console.log(`📤 Invoking Lambda URL: ${LAMBDA_FUNCTION_URL}`);
        const urlResponse = await fetch(LAMBDA_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });

        console.log(`📡 Lambda URL response status: ${urlResponse.status}`);

        if (!urlResponse.ok) {
          const errorText = await urlResponse.text();
          console.error(`❌ Lambda URL error response: ${errorText}`);
          throw new Error(`Lambda URL error: ${errorText}`);
        }

        const urlPayload = await urlResponse.json();
        console.log(`✅ Lambda URL response payload:`, JSON.stringify(urlPayload, null, 2));

        // Function URL may return { statusCode, body } or direct JSON
        if (urlPayload?.body) {
          try {
            return JSON.parse(urlPayload.body);
          } catch (parseError) {
            console.error('❌ Failed to parse Lambda URL body:', parseError);
            return urlPayload;
          }
        }

        return urlPayload;
      }

      console.log(`📤 Invoking Lambda ARN: ${LAMBDA_FUNCTION_ARN}`);

      // Invoke Lambda function
      const command = new InvokeCommand({
        FunctionName: LAMBDA_FUNCTION_ARN,
        Payload: JSON.stringify(requestPayload),
      });

      const response = await lambdaClient.send(command);

      console.log(`📡 Lambda response status: ${response.StatusCode}`);
      console.log(`📡 Lambda response logResult: ${response.LogResult || 'N/A'}`);

      if (response.FunctionError) {
        console.error(`❌ Lambda function error: ${response.FunctionError}`);
        const errorPayload = response.Payload ? JSON.parse(Buffer.from(response.Payload).toString()) : null;
        throw new Error(JSON.stringify(errorPayload || response.FunctionError));
      }

      // Parse Lambda response
      const responsePayload = response.Payload 
        ? JSON.parse(Buffer.from(response.Payload).toString())
        : null;

      console.log(`✅ Lambda response payload:`, JSON.stringify(responsePayload, null, 2));

      if (responsePayload?.body) {
        // Parse the body JSON string
        try {
          return JSON.parse(responsePayload.body);
        } catch (parseError) {
          console.error('❌ Failed to parse Lambda body:', parseError);
          return responsePayload;
        }
      }

      return responsePayload;
    };

    let result = await invokeNameSearch(payload);

    // Fallback searches for single-token names (e.g., "Avenidalegal")
    const buildFallbackQueries = (input: string): string[] => {
      const queries: string[] = [];
      if (!input || input.includes(' ')) return queries;
      const trimmed = input.trim();
      const lower = trimmed.toLowerCase();
      const suffixes = ['legal', 'group', 'holdings', 'capital', 'services', 'solutions', 'partners', 'ventures', 'company', 'co', 'inc', 'corp', 'llc', 'llp', 'pllc'];

      // Add a prefix-based query to broaden search (Sunbiz "contains" results)
      const prefixLength = Math.min(7, trimmed.length);
      if (prefixLength >= 4) {
        queries.push(trimmed.slice(0, prefixLength));
      }

      for (const suffix of suffixes) {
        const idx = lower.indexOf(suffix);
        if (idx > 0) {
          const spaced = `${trimmed.slice(0, idx)} ${trimmed.slice(idx)}`.trim();
          queries.push(spaced);
          const base = trimmed.slice(0, idx).trim();
          if (base.length >= 4) {
            queries.push(base);
          }
        }
      }
      return Array.from(new Set(queries));
    };

    const initialEntities = result?.existing_entities || [];
    const fallbackQueries = buildFallbackQueries(companyName.trim());
    if (fallbackQueries.length > 0) {
      const merged = [...initialEntities];
      for (const query of fallbackQueries) {
        if (!query || query.toUpperCase() === companyName.trim().toUpperCase()) continue;
        console.log(`🔁 Fallback search with query: ${query}`);
        const fallbackPayload = {
          companyName: query,
          entityType: entityType || 'LLC',
        };
        try {
          const fallbackResult = await invokeNameSearch(fallbackPayload);
          const fallbackEntities = fallbackResult?.existing_entities || [];
          for (const entity of fallbackEntities) {
            if (!merged.some((e: any) => e?.name?.toUpperCase() === entity?.name?.toUpperCase())) {
              merged.push(entity);
            }
          }
        } catch (fallbackError) {
          console.warn('⚠️ Fallback name search failed:', fallbackError);
        }
      }
      if (merged.length !== initialEntities.length) {
        result = { ...result, existing_entities: merged };
      }
    }

    console.log(`✅ Parsed result:`, JSON.stringify(result, null, 2));

    // Lambda returns Sunbiz search results with entities
    // We need to apply three-tier matching logic:
    // 1. Exact match
    // 2. Normalized match (remove punctuation/spaces/roman numerals)
    // 3. More aggressive normalized match
    
    const inputName = companyName.trim();
    const entities = result?.existing_entities || [];

    // Restricted term rules (Florida)
    const hardDeniedTerms = [
      'agency',
      'bureau',
      'commission',
      'department',
      'federal',
      'state',
      'county',
    ];
    const warnTerms = [
      'bank',
      'banking',
      'trust',
      'insurance',
      'credit union',
      'savings',
      'attorney',
      'doctor',
      'engineer',
      'cpa',
    ];

    const normalizedInputLower = inputName.toLowerCase();
    const findTerms = (terms: string[], name: string) =>
      terms.filter((term) => {
        if (term.includes(' ')) {
          return name.includes(term);
        }
        return new RegExp(`\\b${term}\\b`, 'i').test(name);
      });

    const matchedHardTerms = findTerms(hardDeniedTerms, normalizedInputLower);
    if (matchedHardTerms.length > 0) {
      return NextResponse.json({
        success: true,
        available: false,
        status: 'error',
        message: `❌ Nombre no disponible. Términos restringidos: ${matchedHardTerms.join(', ')}.`,
        restrictedTerms: matchedHardTerms,
      });
    }
    
    // Helper: Check if entity is blocking (Active or INACT <2 years)
    const isBlockingEntity = (entity: any): boolean => {
      const status = entity?.status?.toUpperCase() || '';
      
      // Active entities always block
      if (status.includes('ACTIVE') || status === 'ACTIVE') {
        return true;
      }
      
      // INACT entities: check if inactive <2 years from Event Date Filed
      if (status.includes('INACT') || status === 'INACTIVE') {
        const eventDateFiled = entity?.eventDateFiled || entity?.event_date_filed || entity?.lastEventDate;
        if (eventDateFiled) {
          try {
            // Parse date (format: MM/DD/YYYY)
            const [month, day, year] = eventDateFiled.split('/').map(Number);
            const eventDate = new Date(year, month - 1, day);
            const twoYearsAgo = new Date();
            twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
            
            // If inactive <2 years, it blocks
            if (eventDate > twoYearsAgo) {
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

    // Helper: Normalize for Florida distinguishability rules
    const normalizeForDistinctness = (name: string): string => {
      const lower = name.toLowerCase();
      const articles = new Set(['a', 'an', 'the']);
      const suffixes = new Set(['llc', 'l.l.c', 'limited', 'limitedliabilitycompany', 'corp', 'corporation', 'inc', 'incorporated', 'ltd', 'company', 'co']);
      const numberWordMap: Record<string, string> = {
        zero: '0',
        one: '1',
        two: '2',
        three: '3',
        four: '4',
        five: '5',
        six: '6',
        seven: '7',
        eight: '8',
        nine: '9',
        ten: '10',
      };

      const tokens = lower
        .replace(/&/g, ' and ')
        .replace(/['’]/g, '')
        .split(/[^a-z0-9]+/g)
        .filter(Boolean)
        .map((token) => {
          if (articles.has(token)) return '';
          if (suffixes.has(token)) return '';
          if (numberWordMap[token]) return numberWordMap[token];
          if (token.endsWith('s') && token.length > 3) {
            return token.slice(0, -1);
          }
          return token;
        })
        .filter(Boolean);

      return tokens.join('');
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

    // Tier 3: Distinguishability match (articles, punctuation, symbols, plurals, numbers vs words)
    if (blockingEntities.length === 0) {
      const distinctInput = normalizeForDistinctness(inputName);
      for (const entity of entities) {
        const entityName = entity?.name || '';
        const distinctEntity = normalizeForDistinctness(entityName);
        if (distinctEntity === distinctInput && distinctInput.length > 0) {
          if (isBlockingEntity(entity)) {
            blockingEntities.push({ ...entity, matchType: 'distinct' });
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
      // Entities found but none are blocking (all INACT >2 years)
      finalMessage = `✅ Nombre disponible. Entidades similares encontradas pero inactivas >2 años.`;
    } else {
      finalMessage = `✅ Nombre disponible. No se encontraron entidades similares.`;
    }

    // Warn-only restricted terms
    const matchedWarnTerms = findTerms(warnTerms, normalizedInputLower);
    const shouldWarn = matchedWarnTerms.length > 0 && blockingEntities.length === 0;
    
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
      status: shouldWarn ? 'warn' : (finalAvailable ? 'ok' : 'error'),
      message: shouldWarn
        ? '⚠️ Le recomendamos no usar este nombre pero si aún así decide avanzar con este nombre necesitamos revisar su caso de forma especial.'
        : finalMessage,
      warningTerms: shouldWarn ? matchedWarnTerms : undefined,
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

