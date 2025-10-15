// src/app/api/domains/setup-workspace/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { 
  createWorkspaceAccount, 
  configureDNSRecords, 
  verifyDomainOwnership,
  type GoogleWorkspaceAccount 
} from '@/lib/googleWorkspace';
import { updateGoogleWorkspaceStatus } from '@/lib/dynamo';

const NAMECHEAP_PROXY_URL = 'http://3.149.156.19:8000';
const PROXY_TOKEN = process.env.NAMECHEAP_PROXY_TOKEN || 'super-secret-32char-token';

export async function POST(request: NextRequest) {
  try {
    const { domain, userId, customerEmail, customerName, primaryEmail } = await request.json();

    if (!domain || !userId || !customerEmail) {
      return NextResponse.json(
        { error: 'Domain, userId, and customerEmail are required' },
        { status: 400 }
      );
    }

    console.log(`Setting up Google Workspace for domain: ${domain}`);

    // Step 1: Create Google Workspace account
    let workspaceAccount: GoogleWorkspaceAccount;
    try {
      const adminEmail = primaryEmail || `admin@${domain}`;
      workspaceAccount = await createWorkspaceAccount(domain, adminEmail, customerName);
      console.log(`Google Workspace account created: ${workspaceAccount.adminEmail}`);
    } catch (error) {
      console.error(`Failed to create Google Workspace account for ${domain}:`, error);
      return NextResponse.json(
        { error: 'Failed to create Google Workspace account' },
        { status: 500 }
      );
    }

    // Step 2: Configure DNS records for Google Workspace
    try {
      const dnsRecords = configureDNSRecords(domain);
      console.log(`DNS records to configure for ${domain}:`, dnsRecords);

      // Call Namecheap proxy to configure DNS
      const dnsResponse = await fetch(`${NAMECHEAP_PROXY_URL}/domains/configure-dns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-proxy-token': PROXY_TOKEN,
        },
        body: JSON.stringify({
          domain: domain,
          records: dnsRecords,
        }),
      });

      if (dnsResponse.ok) {
        console.log(`DNS records configured for ${domain}`);
        workspaceAccount.dnsConfigured = true;
        
        // Update status in DynamoDB
        await updateGoogleWorkspaceStatus(userId, domain, 'dns_configured');
      } else {
        console.error(`Failed to configure DNS for ${domain}`);
      }
    } catch (error) {
      console.error(`Error configuring DNS for ${domain}:`, error);
      // Continue even if DNS configuration fails
    }

    // Step 3: Initiate domain verification
    try {
      const verificationStarted = await verifyDomainOwnership(domain);
      if (verificationStarted) {
        console.log(`Domain verification initiated for ${domain}`);
        workspaceAccount.domainVerified = false; // Will be true after DNS propagation
      }
    } catch (error) {
      console.error(`Error initiating domain verification for ${domain}:`, error);
    }

    // Step 4: Update status in DynamoDB
    try {
      await updateGoogleWorkspaceStatus(userId, domain, 'dns_configured');
      console.log(`Updated Google Workspace status for ${domain}`);
    } catch (error) {
      console.error(`Error updating Google Workspace status:`, error);
    }

    // Step 5: Send setup completion email (optional)
    // This would integrate with your email service to notify the customer

    return NextResponse.json({
      success: true,
      domain: domain,
      workspaceAccount: {
        adminEmail: workspaceAccount.adminEmail,
        adminPassword: workspaceAccount.adminPassword,
        status: workspaceAccount.status,
        dnsConfigured: workspaceAccount.dnsConfigured,
        domainVerified: workspaceAccount.domainVerified,
        adminConsoleUrl: `https://admin.google.com/ac/overview?domain=${domain}`,
        gmailUrl: `https://mail.google.com/a/${domain}`,
      },
      dnsRecords: configureDNSRecords(domain),
      message: 'Google Workspace setup initiated successfully. DNS propagation may take 24-48 hours.',
    });

  } catch (error) {
    console.error('Google Workspace setup error:', error);
    return NextResponse.json(
      {
        error: 'Failed to setup Google Workspace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check Google Workspace status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const userId = searchParams.get('userId');

    if (!domain || !userId) {
      return NextResponse.json(
        { error: 'Domain and userId are required' },
        { status: 400 }
      );
    }

    // This would check the current status from DynamoDB
    // For now, return a placeholder response
    return NextResponse.json({
      success: true,
      domain: domain,
      status: 'dns_configured', // This would come from DynamoDB
      message: 'Google Workspace setup in progress',
    });

  } catch (error) {
    console.error('Error checking Google Workspace status:', error);
    return NextResponse.json(
      { error: 'Failed to check Google Workspace status' },
      { status: 500 }
    );
  }
}
