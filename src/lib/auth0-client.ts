// Client-side Auth0 URL generation
"use client";

// Generate custom Auth0 URL that goes directly to signup
export function getAuth0SignupUrl(callbackUrl: string): string {
  console.log('getAuth0SignupUrl called with:', callbackUrl);
  
  // Use hardcoded values for now since env vars aren't loading properly
  const baseUrl = 'dev-hx5xtiwldskmbisi.us.auth0.com';
  const clientId = '8dvSA0Br1funvuupTaKSCdKgCAFSmfUT';
  const redirectUri = `${window.location.origin}/api/auth/callback/auth0`;
  
  console.log('Auth0 Config Debug:', {
    baseUrl,
    clientId,
    redirectUri,
    callbackUrl,
    allEnvVars: {
      NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL: process.env.NEXT_PUBLIC_AUTH0_ISSUER_BASE_URL,
      NEXT_PUBLIC_AUTH0_ISSUER: process.env.NEXT_PUBLIC_AUTH0_ISSUER,
      NEXT_PUBLIC_AUTH0_CLIENT_ID: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID,
      NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL
    }
  });
  
  if (!baseUrl || !clientId) {
    console.error('Missing Auth0 configuration:', { baseUrl, clientId });
    console.log('Falling back to /signin');
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
