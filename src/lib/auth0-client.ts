// Client-side Auth0 URL generation
"use client";

// Generate custom Auth0 URL that goes directly to signup
export function getAuth0SignupUrl(callbackUrl: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL || process.env.NEXT_PUBLIC_AUTH0_ISSUER;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_URL || window.location.origin}/api/auth/callback/auth0`;
  
  console.log('Auth0 Config Debug:', {
    baseUrl,
    clientId,
    redirectUri,
    callbackUrl
  });
  
  if (!baseUrl || !clientId) {
    console.error('Missing Auth0 configuration:', { baseUrl, clientId });
    return '/signin';
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    screen_hint: 'signup',
    prompt: 'login',
    state: callbackUrl, // Pass callback URL as state
  });
  
  return `${baseUrl}/authorize?${params.toString()}`;
}
