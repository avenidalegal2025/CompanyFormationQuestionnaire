// src/lib/googleWorkspace.ts
import { google } from 'googleapis';

// Google Workspace configuration
const GOOGLE_WORKSPACE_CLIENT_ID = process.env.GOOGLE_WORKSPACE_CLIENT_ID;
const GOOGLE_WORKSPACE_CLIENT_SECRET = process.env.GOOGLE_WORKSPACE_CLIENT_SECRET;
const GOOGLE_WORKSPACE_REFRESH_TOKEN = process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN;
const GOOGLE_WORKSPACE_CUSTOMER_ID = process.env.GOOGLE_WORKSPACE_CUSTOMER_ID;

// OAuth2 client for Google Workspace
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_WORKSPACE_CLIENT_ID,
  GOOGLE_WORKSPACE_CLIENT_SECRET
);

if (GOOGLE_WORKSPACE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_WORKSPACE_REFRESH_TOKEN,
  });
}

// Google Workspace Admin SDK client
const admin = google.admin({
  version: 'directory_v1',
  auth: oauth2Client,
});

// Google Workspace Reseller API client
const reseller = google.reseller({
  version: 'v1',
  auth: oauth2Client,
});

export interface GoogleWorkspaceAccount {
  domain: string;
  customerId: string;
  adminEmail: string;
  adminPassword: string;
  status: 'pending' | 'active' | 'suspended' | 'failed';
  setupDate: string;
  gmailEnabled: boolean;
  dnsConfigured: boolean;
  domainVerified: boolean;
}

export interface DNSRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
  ttl: number;
}

/**
 * Create a new Google Workspace account for a domain
 */
export async function createWorkspaceAccount(
  domain: string,
  customerEmail: string,
  customerName: string,
  primaryEmail?: string
): Promise<GoogleWorkspaceAccount> {
  try {
    console.log(`Creating Google Workspace account for domain: ${domain}`);

    // Step 1: Create customer in Google Workspace Reseller API
    const customerResponse = await reseller.customers.insert({
      requestBody: {
        customerDomain: domain,
        alternateEmail: customerEmail,
        customerType: 'domain',
        customerDomainVerified: false,
      },
    });

    const customerId = customerResponse.data.customerId as string;
    console.log(`Created customer with ID: ${customerId}`);

    // Step 2: Create subscription for Google Workspace Business Starter (Flexible Plan)
    const subscriptionResponse = await reseller.subscriptions.insert({
      customerId: customerId!,
      requestBody: {
        skuId: 'Google-Apps-Unlimited', // Business Starter plan
        plan: {
          planName: 'FLEXIBLE', // Pay monthly, cancel anytime (~$7.20/month)
          isCommitmentPlan: false,
        },
        purchaseOrderId: `PO-${Date.now()}`,
        seats: {
          numberOfSeats: 1, // 1 user
          maximumNumberOfSeats: 1,
        },
      },
    });

    console.log(`Created subscription: ${subscriptionResponse.data.subscriptionId}`);

    // Step 3: Generate admin credentials
    const adminEmail = primaryEmail || `admin@${domain}`;
    const adminPassword = generateSecurePassword();
    
    console.log(`Creating admin user with email: ${adminEmail}`);

    // Step 4: Create admin user
    const userResponse = await admin.users.insert({
      requestBody: {
        primaryEmail: adminEmail,
        name: {
          givenName: customerName.split(' ')[0] || 'Admin',
          familyName: customerName.split(' ').slice(1).join(' ') || 'User',
        },
        password: adminPassword,
        changePasswordAtNextLogin: false,
        orgUnitPath: '/',
      },
    });

    console.log(`Created admin user: ${adminEmail}`);

    // Step 5: Enable Gmail service
    await admin.users.update({
      userKey: adminEmail,
      requestBody: {
        primaryEmail: adminEmail,
        isMailboxSetup: true,
      },
    });

    console.log(`Enabled Gmail for user: ${adminEmail}`);

    const workspaceAccount: GoogleWorkspaceAccount = {
      domain,
      customerId: customerId || '',
      adminEmail,
      adminPassword,
      status: 'pending',
      setupDate: new Date().toISOString(),
      gmailEnabled: true,
      dnsConfigured: false,
      domainVerified: false,
    };

    console.log(`Google Workspace account created successfully for ${domain}`);
    return workspaceAccount;

  } catch (error) {
    console.error(`Error creating Google Workspace account for ${domain}:`, error);
    throw new Error(`Failed to create Google Workspace account: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Configure DNS records required for Google Workspace
 */
export function configureDNSRecords(domain: string): DNSRecord[] {
  return [
    // MX records for Gmail
    {
      type: 'MX',
      name: domain,
      value: 'aspmx.l.google.com',
      priority: 1,
      ttl: 3600,
    },
    {
      type: 'MX',
      name: domain,
      value: 'alt1.aspmx.l.google.com',
      priority: 5,
      ttl: 3600,
    },
    {
      type: 'MX',
      name: domain,
      value: 'alt2.aspmx.l.google.com',
      priority: 5,
      ttl: 3600,
    },
    {
      type: 'MX',
      name: domain,
      value: 'alt3.aspmx.l.google.com',
      priority: 10,
      ttl: 3600,
    },
    {
      type: 'MX',
      name: domain,
      value: 'alt4.aspmx.l.google.com',
      priority: 10,
      ttl: 3600,
    },
    // SPF record
    {
      type: 'TXT',
      name: domain,
      value: 'v=spf1 include:_spf.google.com ~all',
      ttl: 3600,
    },
    // Domain verification record (this would be provided by Google)
    {
      type: 'TXT',
      name: domain,
      value: `google-site-verification=${generateVerificationCode()}`,
      ttl: 3600,
    },
  ];
}

/**
 * Verify domain ownership in Google Workspace
 */
export async function verifyDomainOwnership(domain: string): Promise<boolean> {
  try {
    console.log(`Verifying domain ownership for: ${domain}`);

    const verificationResponse = await admin.domains.insert({
      requestBody: {
        domainName: domain,
        verified: false,
      },
    });

    console.log(`Domain verification initiated for ${domain}`);
    
    // Note: Domain verification is asynchronous and requires DNS propagation
    // This function initiates the process, but verification may take 24-48 hours
    return true;

  } catch (error) {
    console.error(`Error verifying domain ownership for ${domain}:`, error);
    return false;
  }
}

/**
 * Check if domain is verified in Google Workspace
 */
export async function isDomainVerified(domain: string): Promise<boolean> {
  try {
    const domainResponse = await admin.domains.get({
      domainName: domain,
    });

    return domainResponse.data.verified || false;

  } catch (error) {
    console.error(`Error checking domain verification for ${domain}:`, error);
    return false;
  }
}

/**
 * Generate a secure password for admin accounts
 */
function generateSecurePassword(): string {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return password;
}

/**
 * Generate a domain verification code
 */
function generateVerificationCode(): string {
  const length = 43; // Google verification codes are typically 43 characters
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  let code = '';
  
  for (let i = 0; i < length; i++) {
    code += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  return code;
}

/**
 * Get Google Workspace admin console URL
 */
export function getAdminConsoleUrl(domain: string): string {
  return `https://admin.google.com/ac/overview?domain=${domain}`;
}

/**
 * Get Gmail URL for the domain
 */
export function getGmailUrl(domain: string): string {
  return `https://mail.google.com/a/${domain}`;
}
