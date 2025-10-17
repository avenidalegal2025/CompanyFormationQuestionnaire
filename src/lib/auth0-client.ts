// Client-side Auth0 URL generation
"use client";

// Generate custom Auth0 URL that goes directly to signup
export function getAuth0SignupUrl(callbackUrl: string): string {
  // Use hardcoded values for now since env vars aren't loading properly
  const baseUrl = 'dev-hx5xtiwldskmbisi.us.auth0.com';
  const clientId = '8dvSA0Br1funvuupTaKSCdKgCaFSmfUT';
  const redirectUri = `${window.location.origin}/api/auth/callback/auth0`;
  
  if (!baseUrl || !clientId) {
    return '/signin';
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    screen_hint: 'signup',
    prompt: 'login',
    // Don't pass state parameter to avoid OAuthCallback error
  });
  
  return `https://${baseUrl}/authorize?${params.toString()}`;
}
