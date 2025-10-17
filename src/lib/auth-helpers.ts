// Helper functions for authentication checks in step components

// Generate custom Auth0 URL that goes directly to signup
function getAuth0SignupUrl(callbackUrl: string): string {
  // Use hardcoded values to ensure correct client ID
  const baseUrl = 'https://dev-hx5xtiwldskmbisi.us.auth0.com';
  const clientId = '8dvSA0Br1funvuupTaKSCdKgCaFSmfUT';
  const redirectUri = `${window.location.origin}/api/auth/callback/auth0`;
  
  console.log('Auth0 Config Debug (auth-helpers):', {
    baseUrl,
    clientId,
    redirectUri,
    callbackUrl
  });
  
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

export function handleSaveWithAuth(
  session: any,
  anonymousId: string,
  form: any,
  onSave: (() => void) | undefined
) {
  console.log('handleSaveWithAuth called, session:', !!session);
  if (!session) {
    // Save anonymous draft and redirect to signup
    const formData = form.getValues();
    // Save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymousDraftId', anonymousId);
      localStorage.setItem('anonymousDraftData', JSON.stringify(formData));
    }
    // Redirect directly to Auth0 signup
    const callbackUrl = `/?action=save&draftId=${anonymousId}`;
    window.location.href = getAuth0SignupUrl(callbackUrl);
  } else {
    void onSave?.();
  }
}

export function handleShareWithAuth(
  session: any,
  anonymousId: string,
  form: any,
  onGenerateLink: (() => void) | undefined
) {
  console.log('handleShareWithAuth called with session:', !!session, 'anonymousId:', anonymousId);
  if (!session) {
    console.log('No session, redirecting to Auth0 signup');
    // Save anonymous draft and redirect to signup
    const formData = form.getValues();
    // Save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymousDraftId', anonymousId);
      localStorage.setItem('anonymousDraftData', JSON.stringify(formData));
    }
    // Redirect directly to Auth0 signup
    const callbackUrl = `/?action=share&draftId=${anonymousId}`;
    const authUrl = getAuth0SignupUrl(callbackUrl);
    console.log('Generated Auth0 URL:', authUrl);
    window.location.href = authUrl;
  } else {
    console.log('User is authenticated, calling onGenerateLink');
    void onGenerateLink?.();
  }
}

export function handleCheckoutWithAuth(
  session: any,
  anonymousId: string,
  form: any,
  onNext: (() => void) | undefined
) {
  if (!session) {
    // Save anonymous draft and redirect to signup
    const formData = form.getValues();
    // Save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymousDraftId', anonymousId);
      localStorage.setItem('anonymousDraftData', JSON.stringify(formData));
    }
    // Redirect directly to Auth0 signup
    const callbackUrl = `/?action=checkout&draftId=${anonymousId}`;
    window.location.href = getAuth0SignupUrl(callbackUrl);
  } else {
    void onNext?.();
  }
}
