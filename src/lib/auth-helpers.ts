// Helper functions for authentication checks in step components

export function handleSaveWithAuth(
  session: any,
  anonymousId: string,
  form: any,
  onSave: (() => void) | undefined
) {
  if (!session) {
    // Save anonymous draft and redirect to signup
    const formData = form.getValues();
    // Save to localStorage as backup
    if (typeof window !== 'undefined') {
      localStorage.setItem('anonymousDraftId', anonymousId);
      localStorage.setItem('anonymousDraftData', JSON.stringify(formData));
    }
    // Redirect to signup with callback
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(`/?action=save&draftId=${anonymousId}`)}`;
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
    // Redirect to signup with callback
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(`/?action=share&draftId=${anonymousId}`)}`;
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
    // Redirect to signup with callback
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(`/?action=checkout&draftId=${anonymousId}`)}`;
  } else {
    void onNext?.();
  }
}
