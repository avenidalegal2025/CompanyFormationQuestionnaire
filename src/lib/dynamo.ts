// src/lib/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const REGION = process.env.AWS_REGION || "us-west-1";
export const TABLE_NAME =
  process.env.DYNAMO_TABLE ||
  "Company_Creation_Questionaire_Avenida_Legal"; // fallback for local/dev
// Use environment variables for key names to match Vercel deployment
export const TABLE_PK_NAME = process.env.DYNAMO_PK_NAME || 'id';
export const TABLE_SK_NAME = process.env.DYNAMO_SK_NAME || 'sk';
export const TABLE_SK_VALUE = process.env.DYNAMO_SK_VALUE || 'DOMAINS';

function buildUserKey(userId: string) {
  const key: Record<string, any> = { [TABLE_PK_NAME]: userId };
  if (TABLE_SK_NAME) {
    key[TABLE_SK_NAME] = TABLE_SK_VALUE;
  }
  return key;
}

const ddbClient = new DynamoDBClient({
  region: REGION,
  // Optional: if you ever need to override creds locally
  // credentials: {
  //   accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  // },
});

export const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

// Domain registration types
export interface DomainRegistration {
  domain: string;
  namecheapOrderId: string;
  registrationDate: string;
  expiryDate: string;
  status: 'pending' | 'active' | 'failed' | 'expired';
  stripePaymentId: string;
  price: number;
  sslEnabled: boolean;
  sslExpiryDate?: string;
  googleWorkspaceStatus: 'none' | 'dns_configured' | 'verified' | 'active';
  nameservers: string[];
  // Optional applied DNS snapshot to show setup info in UI
  dnsApplied?: Array<{ type: string; name: string; value: string; ttl?: number; priority?: number }>;
}

// Domain-specific DynamoDB operations
export async function saveDomainRegistration(userId: string, domainData: DomainRegistration) {
  try {
    // First, try to get existing domains to see if the attribute exists
    let existingDomains: DomainRegistration[] = [];
    try {
      const getCommand = new GetCommand({
        TableName: TABLE_NAME,
        Key: buildUserKey(userId),
        ProjectionExpression: 'registeredDomains'
      });
      const getResult = await ddb.send(getCommand);
      existingDomains = getResult.Item?.registeredDomains || [];
    } catch (getError) {
      console.log('No existing domains found, creating new list');
    }

    // Add the new domain to the list
    const updatedDomains = [...existingDomains, domainData];

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: buildUserKey(userId),
      UpdateExpression: 'SET registeredDomains = :domains',
      ExpressionAttributeValues: {
        ':domains': updatedDomains
      },
      ReturnValues: 'UPDATED_NEW'
    });

    const result = await ddb.send(command);
    console.log('Domain registration saved:', result);
    return result;
  } catch (error) {
    console.error('Error saving domain registration:', error);
    throw error;
  }
}

export async function getDomainsByUser(userId: string) {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: buildUserKey(userId),
      ProjectionExpression: 'registeredDomains'
    });

    const result = await ddb.send(command);
    
    // If the item doesn't exist or doesn't have registeredDomains, return empty array
    if (!result.Item || !result.Item.registeredDomains) {
      return [];
    }
    
    return result.Item.registeredDomains;
  } catch (error) {
    console.error('Error getting domains by user:', error);
    // If the item doesn't exist, return empty array instead of throwing
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      return [];
    }
    throw error;
  }
}

// Safe getter that tolerates key mismatches and tries a scan fallback
export async function getDomainsByUserSafe(userId: string) {
  try {
    // First try the expected composite key id/sk
    const getResult = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      // Use literal key names that match the deployed table
      Key: { id: userId, sk: TABLE_SK_VALUE },
      ProjectionExpression: 'registeredDomains'
    }));
    const fromGet = getResult.Item?.registeredDomains || [];
    if (fromGet.length > 0) return fromGet;

    // Fallback A: Scan by id attribute in case of schema/env drift
    const scanResult = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#id = :id',
      ExpressionAttributeNames: { '#id': 'id' },
      ExpressionAttributeValues: { ':id': userId },
      ProjectionExpression: 'registeredDomains'
    }));
    const scanned = (scanResult.Items && scanResult.Items[0]?.registeredDomains) || [];
    if (Array.isArray(scanned) && scanned.length > 0) return scanned;

    // Fallback B: Scan by pk attribute for legacy rows
    const scanResultPk = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: '#pk = :id',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':id': userId },
      ProjectionExpression: 'registeredDomains'
    }));
    const scannedPk = (scanResultPk.Items && scanResultPk.Items[0]?.registeredDomains) || [];
    return Array.isArray(scannedPk) ? scannedPk : [];
  } catch (err) {
    console.warn('getDomainsByUserSafe error; returning empty:', err);
    return [];
  }
}

// Update a specific domain with DNS applied records and status
export async function updateDomainDnsApplied(
  userId: string,
  domain: string,
  records: Array<{ type: string; name: string; value: string; ttl?: number; priority?: number }>,
) {
  // Get current list
  const current = await getDomainsByUser(userId);
  const next = current.map((d: DomainRegistration) =>
    d.domain === domain
      ? { ...d, dnsApplied: records, googleWorkspaceStatus: 'dns_configured' }
      : d
  );

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    UpdateExpression: 'SET registeredDomains = :domains',
    ExpressionAttributeValues: {
      ':domains': next,
    },
    ReturnValues: 'UPDATED_NEW',
  });
  await ddb.send(command);
  return next;
}

export async function updateDomainStatus(userId: string, domainId: string, status: DomainRegistration['status']) {
  try {
    // First get the current domains
    const domains = await getDomainsByUser(userId);
    
    // If no domains exist, nothing to update
    if (domains.length === 0) {
      console.log('No domains found for user, nothing to update');
      return { success: true };
    }
    
    // Find and update the specific domain
    const updatedDomains = domains.map((domain: DomainRegistration) => 
      domain.namecheapOrderId === domainId 
        ? { ...domain, status }
        : domain
    );

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: buildUserKey(userId),
      UpdateExpression: 'SET registeredDomains = :domains',
      ExpressionAttributeValues: {
        ':domains': updatedDomains
      },
      ReturnValues: 'UPDATED_NEW'
    });

    const result = await ddb.send(command);
    console.log('Domain status updated:', result);
    return result;
  } catch (error) {
    console.error('Error updating domain status:', error);
    throw error;
  }
}

export async function updateGoogleWorkspaceStatus(userId: string, domainId: string, status: DomainRegistration['googleWorkspaceStatus']) {
  try {
    // First get the current domains
    const domains = await getDomainsByUser(userId);
    
    // If no domains exist, nothing to update
    if (domains.length === 0) {
      console.log('No domains found for user, nothing to update');
      return { success: true };
    }
    
    // Find and update the specific domain
    const updatedDomains = domains.map((domain: DomainRegistration) => 
      domain.namecheapOrderId === domainId 
        ? { ...domain, googleWorkspaceStatus: status }
        : domain
    );

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: buildUserKey(userId),
      UpdateExpression: 'SET registeredDomains = :domains',
      ExpressionAttributeValues: {
        ':domains': updatedDomains
      },
      ReturnValues: 'UPDATED_NEW'
    });

    const result = await ddb.send(command);
    console.log('Google Workspace status updated:', result);
    return result;
  } catch (error) {
    console.error('Error updating Google Workspace status:', error);
    throw error;
  }
}