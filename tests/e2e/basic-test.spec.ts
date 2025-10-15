import { test, expect } from '@playwright/test';

test('should load the questionnaire page', async ({ page }) => {
  console.log('🌐 Testing basic page load...');
  
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Check if page loads
  const title = await page.title();
  console.log(`📄 Page title: ${title}`);
  
  // Check for sign in button or questionnaire content
  const signInButton = page.locator('text=Sign in');
  const questionnaireContent = page.locator('[data-testid="questionnaire-content"]');
  
  if (await signInButton.isVisible()) {
    console.log('🔐 Sign in button visible - authentication required');
  } else if (await questionnaireContent.isVisible()) {
    console.log('📋 Questionnaire content visible - already authenticated');
  } else {
    console.log('⚠️ Neither sign in nor questionnaire content visible');
  }
  
  // Take a screenshot for debugging
  await page.screenshot({ path: 'test-screenshot.png' });
  console.log('📸 Screenshot saved as test-screenshot.png');
});
