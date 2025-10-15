import { test, expect } from '@playwright/test';

test.describe('Payment and Video Loading Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the questionnaire
    await page.goto('http://localhost:3000');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should load videos in Empresa and Propietarios steps', async ({ page }) => {
    console.log('🎬 Testing video loading in questionnaire steps...');
    
    // Navigate through the questionnaire to reach Empresa step
    // First, let's check if we need to login
    const signInButton = page.locator('text=Sign in');
    if (await signInButton.isVisible()) {
      console.log('🔐 Login required, proceeding with Auth0 login...');
      await signInButton.click();
      
      // Wait for Auth0 login page
      await page.waitForURL('**/auth0.com/**');
      
      // Fill in test credentials (you may need to adjust these)
      await page.fill('input[name="username"]', 'test@example.com');
      await page.fill('input[name="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Wait for redirect back to questionnaire
      await page.waitForURL('http://localhost:3000');
    }

    // Wait for questionnaire to load
    await page.waitForSelector('[data-testid="questionnaire-content"]', { timeout: 10000 });
    
    // Navigate to Empresa step (Step 3)
    console.log('📋 Navigating to Empresa step...');
    
    // Look for step navigation or continue buttons
    const continueButton = page.locator('button:has-text("Continuar")').first();
    if (await continueButton.isVisible()) {
      await continueButton.click();
      await page.waitForTimeout(1000);
    }

    // Check for video elements in the current step
    const videoElements = page.locator('video');
    const videoCount = await videoElements.count();
    
    console.log(`🎥 Found ${videoCount} video elements`);
    
    if (videoCount > 0) {
      // Check if videos are loading properly
      for (let i = 0; i < videoCount; i++) {
        const video = videoElements.nth(i);
        const src = await video.getAttribute('src');
        console.log(`📹 Video ${i + 1} src: ${src}`);
        
        // Check if video has error
        const hasError = await video.evaluate((el) => {
          return el.error !== null;
        });
        
        if (hasError) {
          console.log(`❌ Video ${i + 1} has loading error`);
        } else {
          console.log(`✅ Video ${i + 1} loaded successfully`);
        }
      }
    } else {
      console.log('⚠️ No video elements found in current step');
    }

    // Navigate to Propietarios step
    console.log('👥 Navigating to Propietarios step...');
    
    const nextButton = page.locator('button:has-text("Siguiente")').first();
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(1000);
    }

    // Check for videos in Propietarios step
    const propietariosVideos = page.locator('video');
    const propietariosVideoCount = await propietariosVideos.count();
    
    console.log(`🎥 Found ${propietariosVideoCount} video elements in Propietarios step`);
    
    if (propietariosVideoCount > 0) {
      for (let i = 0; i < propietariosVideoCount; i++) {
        const video = propietariosVideos.nth(i);
        const src = await video.getAttribute('src');
        console.log(`📹 Propietarios Video ${i + 1} src: ${src}`);
        
        const hasError = await video.evaluate((el) => {
          return el.error !== null;
        });
        
        if (hasError) {
          console.log(`❌ Propietarios Video ${i + 1} has loading error`);
        } else {
          console.log(`✅ Propietarios Video ${i + 1} loaded successfully`);
        }
      }
    }
  });

  test('should handle Stripe payment authentication issue', async ({ page }) => {
    console.log('💳 Testing Stripe payment flow...');
    
    // Navigate to the questionnaire
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Check if we need to login first
    const signInButton = page.locator('text=Sign in');
    if (await signInButton.isVisible()) {
      console.log('🔐 Login required for payment test...');
      await signInButton.click();
      
      // Wait for Auth0 login page
      await page.waitForURL('**/auth0.com/**');
      
      // Fill in test credentials
      await page.fill('input[name="username"]', 'test@example.com');
      await page.fill('input[name="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      // Wait for redirect back
      await page.waitForURL('http://localhost:3000');
    }

    // Navigate through questionnaire to reach checkout
    console.log('📋 Navigating through questionnaire to checkout...');
    
    // Fill out the questionnaire (simplified version)
    // You may need to adjust selectors based on actual form structure
    const entityTypeSelect = page.locator('select[name*="entityType"]');
    if (await entityTypeSelect.isVisible()) {
      await entityTypeSelect.selectOption('C-Corp');
    }

    const stateSelect = page.locator('select[name*="state"]');
    if (await stateSelect.isVisible()) {
      await stateSelect.selectOption('Florida');
    }

    // Continue through steps
    const continueButtons = page.locator('button:has-text("Continuar"), button:has-text("Siguiente")');
    const buttonCount = await continueButtons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = continueButtons.nth(i);
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(1000);
      }
    }

    // Look for the checkout/payment section
    console.log('🔍 Looking for checkout section...');
    
    const checkoutSection = page.locator('text=Completa tu Pedido, text=Proceder al Pago, text=Resumen del Pedido');
    await expect(checkoutSection.first()).toBeVisible({ timeout: 10000 });
    
    // Check for payment button
    const paymentButton = page.locator('button:has-text("Proceder al Pago")');
    await expect(paymentButton).toBeVisible();
    
    // Check console for authentication errors before clicking
    console.log('🔍 Checking console for authentication issues...');
    
    // Set up console listener
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().includes('undefined') || msg.text().includes('authentication')) {
        consoleMessages.push(msg.text());
        console.log(`🚨 Console ${msg.type()}: ${msg.text()}`);
      }
    });

    // Click payment button
    console.log('💳 Clicking payment button...');
    await paymentButton.click();
    
    // Wait for any error messages or redirects
    await page.waitForTimeout(3000);
    
    // Check for error messages
    const errorMessage = page.locator('text=Debes iniciar sesión, text=Authentication required, text=error');
    if (await errorMessage.isVisible()) {
      const errorText = await errorMessage.textContent();
      console.log(`❌ Payment error found: ${errorText}`);
      
      // Check if it's the authentication error
      if (errorText?.includes('iniciar sesión') || errorText?.includes('Authentication required')) {
        console.log('🔍 This is the authentication issue we need to fix');
      }
    } else {
      console.log('✅ No immediate payment error visible');
    }

    // Check if we were redirected to Stripe
    const currentUrl = page.url();
    console.log(`🌐 Current URL after payment click: ${currentUrl}`);
    
    if (currentUrl.includes('stripe.com')) {
      console.log('✅ Successfully redirected to Stripe');
    } else {
      console.log('⚠️ Not redirected to Stripe - checking for errors');
    }

    // Log all console messages for debugging
    console.log('📝 All relevant console messages:');
    consoleMessages.forEach((msg, index) => {
      console.log(`${index + 1}. ${msg}`);
    });
  });

  test('should debug session data extraction', async ({ page }) => {
    console.log('🔍 Debugging session data extraction...');
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Check if we need to login
    const signInButton = page.locator('text=Sign in');
    if (await signInButton.isVisible()) {
      console.log('🔐 Logging in to test session data...');
      await signInButton.click();
      
      await page.waitForURL('**/auth0.com/**');
      await page.fill('input[name="username"]', 'test@example.com');
      await page.fill('input[name="password"]', 'testpassword123');
      await page.click('button[type="submit"]');
      
      await page.waitForURL('http://localhost:3000');
    }

    // Inject script to check session data
    const sessionData = await page.evaluate(() => {
      // Check if NextAuth session is available
      if (typeof window !== 'undefined' && (window as any).__NEXT_DATA__) {
        return {
          hasNextData: true,
          nextData: (window as any).__NEXT_DATA__
        };
      }
      return { hasNextData: false };
    });

    console.log('📊 Session data check:', sessionData);

    // Check for user data in the DOM
    const userElements = page.locator('[data-testid*="user"], [class*="user"], [id*="user"]');
    const userElementCount = await userElements.count();
    console.log(`👤 Found ${userElementCount} user-related elements`);

    // Check for any user data in localStorage or sessionStorage
    const storageData = await page.evaluate(() => {
      return {
        localStorage: Object.keys(localStorage).reduce((acc, key) => {
          if (key.includes('user') || key.includes('auth') || key.includes('session')) {
            acc[key] = localStorage.getItem(key);
          }
          return acc;
        }, {} as Record<string, string>),
        sessionStorage: Object.keys(sessionStorage).reduce((acc, key) => {
          if (key.includes('user') || key.includes('auth') || key.includes('session')) {
            acc[key] = sessionStorage.getItem(key);
          }
          return acc;
        }, {} as Record<string, string>)
      };
    });

    console.log('💾 Storage data:', storageData);
  });
});
