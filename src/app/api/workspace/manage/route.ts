import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGoogleWorkspace, saveGoogleWorkspace } from '@/lib/dynamo';
import { google } from 'googleapis';

// OAuth2 client for Google Workspace
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_WORKSPACE_CLIENT_ID,
  process.env.GOOGLE_WORKSPACE_CLIENT_SECRET
);

if (process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_WORKSPACE_REFRESH_TOKEN,
  });
}

const reseller = google.reseller({
  version: 'v1',
  auth: oauth2Client,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { action } = await request.json();

    if (!action || !['cancel', 'suspend', 'reactivate'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: cancel, suspend, or reactivate' },
        { status: 400 }
      );
    }

    // Get the user's Google Workspace account
    const workspace = await getGoogleWorkspace(session.user.email);
    
    if (!workspace) {
      return NextResponse.json(
        { error: 'No Google Workspace account found' },
        { status: 404 }
      );
    }

    // Check if this is a test/mock account
    if (workspace.customerId === 'mock-customer-id') {
      console.log('⚠️ TEST MODE: Simulating workspace management action:', action);
      
      // Update mock status
      const newStatus = action === 'cancel' ? 'failed' : 
                       action === 'suspend' ? 'suspended' : 'active';
      
      workspace.status = newStatus;
      await saveGoogleWorkspace(session.user.email, workspace);
      
      return NextResponse.json({
        success: true,
        message: `Mock workspace ${action}ed successfully`,
        workspace: workspace,
      });
    }

    // Real Google Workspace management
    console.log(`🔧 ${action.toUpperCase()} Google Workspace for customer:`, workspace.customerId);

    try {
      if (action === 'cancel') {
        // Cancel the subscription
        await reseller.subscriptions.delete({
          customerId: workspace.customerId,
          subscriptionId: workspace.customerId, // In real implementation, store subscriptionId separately
          deletionType: 'cancel',
        });

        workspace.status = 'failed'; // Mark as cancelled
        await saveGoogleWorkspace(session.user.email, workspace);

        return NextResponse.json({
          success: true,
          message: 'Google Workspace subscription cancelled successfully',
          workspace: workspace,
        });
      } else if (action === 'suspend') {
        // Suspend the subscription
        await reseller.subscriptions.delete({
          customerId: workspace.customerId,
          subscriptionId: workspace.customerId,
          deletionType: 'suspend',
        });

        workspace.status = 'suspended';
        await saveGoogleWorkspace(session.user.email, workspace);

        return NextResponse.json({
          success: true,
          message: 'Google Workspace subscription suspended successfully',
          workspace: workspace,
        });
      } else if (action === 'reactivate') {
        // Reactivate a suspended subscription
        await reseller.subscriptions.activate({
          customerId: workspace.customerId,
          subscriptionId: workspace.customerId,
        });

        workspace.status = 'active';
        await saveGoogleWorkspace(session.user.email, workspace);

        return NextResponse.json({
          success: true,
          message: 'Google Workspace subscription reactivated successfully',
          workspace: workspace,
        });
      }
    } catch (googleError: any) {
      console.error('Google API error:', googleError);
      return NextResponse.json(
        { 
          error: 'Failed to manage Google Workspace subscription',
          details: googleError.message 
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error managing Google Workspace:', error);
    return NextResponse.json(
      { 
        error: 'Failed to manage Google Workspace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

