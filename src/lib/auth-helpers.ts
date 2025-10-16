// Helper functions for authentication checks in step components

// Generate custom Auth0 URL that goes directly to signup
function getAuth0SignupUrl(callbackUrl: string): string {
  const baseUrl = process.env.AUTH0_ISSUER_BASE_URL || process.env.AUTH0_ISSUER;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback/auth0`;
  
  if (!baseUrl || !clientId) {
    console.error('Missing Auth0 configuration');
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
  if (!session) {
    // Save anonymous draft and redirect to signup
    const formData = form.getValues();
    // Save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymousDraftId', anonymousId);
      localStorage.setItem('anonymousDraftData', JSON.stringify(formData));
    }
    // Redirect directly to Auth0 signup
    const callbackUrl = `/?action=share&draftId=${anonymousId}`;
    window.location.href = getAuth0SignupUrl(callbackUrl);
  } else {
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
