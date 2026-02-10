// src/lib/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const REGION = process.env.AWS_REGION || "us-west-1";
export const TABLE_NAME =
  process.env.DYNAMO_TABLE ||
  "Company_Creation_Questionaire_Avenida_Legal"; // fallback for local/dev
// Use environment variables for key names to match Vercel deployment
export const TABLE_PK_NAME = process.env.DYNAMO_PK_NAME || 'pk'; // Changed from 'id' to 'pk' to match actual table schema
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

// Business phone record
export interface BusinessPhoneRecord {
  phoneNumber: string; // E.164 Twilio business number
  areaCode?: string;
  sid?: string; // Twilio IncomingPhoneNumber SID
  forwardToE164: string; // Target forwarding number
  updatedAt: string;
}

// Google Workspace record
export interface GoogleWorkspaceRecord {
  domain: string;
  customerId: string;
  adminEmail: string;
  adminPassword: string;
  status: 'pending' | 'active' | 'suspended' | 'failed';
  setupDate: string;
  expiryDate: string;
  gmailEnabled: boolean;
  dnsConfigured: boolean;
  domainVerified: boolean;
  stripePaymentId: string;
  price: number;
}

// Document record
export interface DocumentRecord {
  id: string;
  name: string;
  type: 'formation' | 'agreement' | 'tax' | 'banking' | 'other';
  s3Key: string;
  signedS3Key?: string; // S3 key for signed version (if uploaded)
  status: 'template' | 'generated' | 'pending_signature' | 'signed';
  createdAt: string;
  signedAt?: string; // When the signed version was uploaded
  size?: number;
}

export function dedupeDocumentsById(documents: DocumentRecord[]): DocumentRecord[] {
  const byId = new Map<string, DocumentRecord>();
  const score = (doc: DocumentRecord) => {
    let points = 0;
    if (doc.signedS3Key) points += 100;
    if (doc.status === 'signed') points += 50;
    if (doc.signedAt) points += 20;
    if (doc.s3Key) points += 10;
    if (doc.name) points += 5;
    return points;
  };

  for (const doc of documents) {
    const id = doc.id || '';
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, doc);
      continue;
    }
    const existingScore = score(existing);
    const nextScore = score(doc);
    if (nextScore > existingScore) {
      byId.set(id, doc);
      continue;
    }
    if (nextScore === existingScore && doc.signedAt && existing.signedAt) {
      const nextTime = Date.parse(doc.signedAt);
      const existingTime = Date.parse(existing.signedAt);
      if (!Number.isNaN(nextTime) && !Number.isNaN(existingTime) && nextTime > existingTime) {
        byId.set(id, doc);
      }
    }
  }

  return Array.from(byId.values());
}

// Vault metadata
export interface VaultMetadata {
  vaultPath: string; // e.g., "trimaran-llc-abc123de"
  companyName: string;
  createdAt: string;
}

// Idempotent payment processing record (per user + Stripe payment/session id)
export interface PaymentProcessingRecord {
  stripePaymentId: string;
  status: 'started' | 'completed';
  updatedAt: string;
}

export async function saveBusinessPhone(userId: string, data: BusinessPhoneRecord) {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    UpdateExpression: 'SET businessPhone = :bp',
    ExpressionAttributeValues: {
      ':bp': data,
    },
    ReturnValues: 'UPDATED_NEW',
  });
  return ddb.send(command);
}

export async function getBusinessPhone(userId: string): Promise<BusinessPhoneRecord | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'businessPhone',
  });
  const res = await ddb.send(command);
  return (res.Item as any)?.businessPhone ?? null;
}

// Google Workspace operations
export async function saveGoogleWorkspace(userId: string, data: GoogleWorkspaceRecord) {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    UpdateExpression: 'SET googleWorkspace = :gw',
    ExpressionAttributeValues: {
      ':gw': data,
    },
    ReturnValues: 'UPDATED_NEW',
  });
  return ddb.send(command);
}

export async function getGoogleWorkspace(userId: string): Promise<GoogleWorkspaceRecord | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'googleWorkspace',
  });
  const res = await ddb.send(command);
  return (res.Item as any)?.googleWorkspace ?? null;
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
    });

    const result = await ddb.send(command);
    const item: any = result.Item || {};
    const list = Array.isArray(item.registeredDomains)
      ? item.registeredDomains
      : Array.isArray(item.domains)
      ? item.domains
      : Array.isArray(item.domainList)
      ? item.domainList
      : [];
    return list;
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
  // With env aligned, a single Get suffices
  return getDomainsByUser(userId);
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

// Vault operations
export async function saveVaultMetadata(userId: string, vault: VaultMetadata) {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    UpdateExpression: 'SET vault = :vault',
    ExpressionAttributeValues: {
      ':vault': vault,
    },
    ReturnValues: 'UPDATED_NEW',
  });
  return ddb.send(command);
}

export async function getVaultMetadata(userId: string): Promise<VaultMetadata | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'vault',
  });
  const res = await ddb.send(command);
  return (res.Item as any)?.vault ?? null;
}

// Document operations
export async function saveUserCompanyDocuments(
  userId: string,
  companyId: string | undefined,
  documents: DocumentRecord[],
) {
  // Fallback key when no explicit companyId is provided (backwards compatibility)
  const effectiveCompanyId = companyId || 'default';

  // Read existing companyDocuments map (if any)
  const getCommand = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'companyDocuments',
  });
  const res = await ddb.send(getCommand);
  const currentMap = ((res.Item as any)?.companyDocuments || {}) as Record<string, DocumentRecord[]>;

  const nextMap: Record<string, DocumentRecord[]> = {
    ...currentMap,
    [effectiveCompanyId]: documents,
  };

  const updateCommand = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    UpdateExpression: 'SET companyDocuments = :docsMap',
    ExpressionAttributeValues: {
      ':docsMap': nextMap,
    },
    ReturnValues: 'UPDATED_NEW',
  });

  return ddb.send(updateCommand);
}

export async function getUserCompanyDocuments(
  userId: string,
  companyId?: string,
): Promise<DocumentRecord[]> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'companyDocuments, documents',
  });
  const res = await ddb.send(command);
  const item: any = res.Item || {};

  // If new structure exists, read from it
  if (item.companyDocuments && typeof item.companyDocuments === 'object') {
    // If companyId is provided, return ONLY that company's documents (no fallback to all companies)
    if (companyId) {
      const companyDocs = item.companyDocuments[companyId];
      if (companyDocs && Array.isArray(companyDocs)) {
        return dedupeDocumentsById(companyDocs);
      }
      // Strict: do not fall back to default or merge all companies when a specific company was requested
      return [];
    }
    // No companyId provided - try 'default' first (backwards compatibility)
    const defaultDocs = item.companyDocuments['default'];
    if (defaultDocs && Array.isArray(defaultDocs) && defaultDocs.length > 0) {
      return dedupeDocumentsById(defaultDocs);
    }
    // No companyId and no default: return ALL documents from all companies (legacy / client)
    const allDocs: DocumentRecord[] = [];
    for (const key of Object.keys(item.companyDocuments)) {
      const arr = item.companyDocuments[key];
      if (Array.isArray(arr)) {
        allDocs.push(...arr);
      }
    }
    if (allDocs.length > 0) {
      return dedupeDocumentsById(allDocs);
    }
  }

  // Backwards‑compatibility: fall back to legacy flat `documents` array
  return dedupeDocumentsById(item.documents ?? []);
}

export async function addUserCompanyDocument(
  userId: string,
  companyId: string | undefined,
  document: DocumentRecord,
) {
  const existingDocs = await getUserCompanyDocuments(userId, companyId);
  const updatedDocs = [...existingDocs, document];
  return saveUserCompanyDocuments(userId, companyId, updatedDocs);
}

// Helper to fetch ALL documents across all companies for a user.
// This is used for access checks and legacy views where we don't know companyId.
export async function getAllUserDocuments(userId: string): Promise<DocumentRecord[]> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'companyDocuments, documents',
  });
  const res = await ddb.send(command);
  const item: any = res.Item || {};

  const all: DocumentRecord[] = [];

  if (item.companyDocuments && typeof item.companyDocuments === 'object') {
    for (const key of Object.keys(item.companyDocuments)) {
      const arr = item.companyDocuments[key];
      if (Array.isArray(arr)) {
        all.push(...arr);
      }
    }
  }

  if (Array.isArray(item.documents)) {
    all.push(...item.documents);
  }

  return dedupeDocumentsById(all);
}

// Backwards‑compatibility shims: legacy per‑user document helpers
// These keep existing admin APIs and scripts working while routing
// everything through the new per‑company structure.
export async function saveUserDocuments(userId: string, documents: DocumentRecord[]) {
  // For legacy callers that save a flat list, we store it under "default"
  // to keep behavior roughly similar.
  return saveUserCompanyDocuments(userId, 'default', documents);
}

export async function getUserDocuments(userId: string): Promise<DocumentRecord[]> {
  // Return ALL documents across companies so access checks and legacy
  // viewers (like /api/documents/view) can see SS-4 and other files.
  return getAllUserDocuments(userId);
}

export async function addUserDocument(userId: string, document: DocumentRecord) {
  return addUserCompanyDocument(userId, 'default', document);
}

// Form data storage (for Airtable sync)
export async function saveFormData(userId: string, formData: any) {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    UpdateExpression: 'SET formData = :formData, formDataUpdatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':formData': formData,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'UPDATED_NEW',
  });
  return ddb.send(command);
}

export async function getFormData(userId: string): Promise<any | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: buildUserKey(userId),
    ProjectionExpression: 'formData',
  });
  const res = await ddb.send(command);
  return (res.Item as any)?.formData ?? null;
}

// (PaymentProcessingRecord type kept for potential future use, but the
// helper functions are intentionally omitted for now – we rely on Airtable’s
// Stripe Payment ID check for idempotency.)