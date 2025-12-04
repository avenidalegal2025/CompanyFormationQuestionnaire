#!/usr/bin/env python3
"""
Sunbiz LLC Automation - Compatible with undetected-chromedriver 3.5.0
"""

import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import random

class SunbizAutomation:
    def __init__(self):
        self.driver = None
        print("🍎 Sunbiz Automation (UC 3.5.0 Compatible)")
        print("=" * 50)
    
    def setup_driver(self):
        """Setup for undetected-chromedriver 3.5.0"""
        print("🔧 Setting up Chrome driver...")
        
        try:
            # For version 3.5.0, we need to be careful with options
            options = uc.ChromeOptions()
            
            # Don't use headless attribute - it doesn't exist in 3.5.0
            # Instead, use add_argument if you need headless
            # options.add_argument('--headless')  # Only if you want headless
            
            # Add stealth arguments
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_argument('--start-maximized')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-web-security')
            options.add_argument('--disable-features=IsolateOrigins,site-per-process')
            
            # Create driver
            self.driver = uc.Chrome(
                options=options,
                driver_executable_path=None,  # Let it auto-download
                version_main=None  # Auto-detect version
            )
            
            print("✅ Chrome driver created successfully!")
            
            # Inject anti-detection JavaScript
            self.driver.execute_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
                window.chrome = {runtime: {}, loadTimes: function() {}, csi: function() {}};
            """)
            
            return True
            
        except Exception as e:
            print(f"❌ Error: {e}")
            return False
    
    def handle_cloudflare(self):
        """Handle Cloudflare challenge"""
        print("\n🛡️ Checking for Cloudflare...")
        
        # Initial wait
        time.sleep(5)
        
        try:
            # Check page content
            page_text = self.driver.page_source.lower()
            
            if "checking your browser" in page_text or "verify you are human" in page_text:
                print("⏳ Cloudflare detected, waiting...")
                
                # Wait up to 30 seconds for Cloudflare to pass
                for i in range(30):
                    time.sleep(1)
                    page_text = self.driver.page_source.lower()
                    
                    if "checking your browser" not in page_text and "verify you are human" not in page_text:
                        print("✅ Passed Cloudflare!")
                        return True
                    
                    if i % 5 == 0:
                        print(f"   Still waiting... {i}/30 seconds")
                
                # Try refresh
                print("🔄 Trying page refresh...")
                self.driver.refresh()
                time.sleep(10)
                
                page_text = self.driver.page_source.lower()
                if "checking your browser" not in page_text:
                    print("✅ Passed after refresh!")
                    return True
                
                print("❌ Cloudflare challenge not resolved")
                return False
                
            else:
                print("✅ No Cloudflare detected!")
                return True
                
        except Exception as e:
            print(f"⚠️ Error checking Cloudflare: {e}")
            return True
    
    def find_and_click_checkbox(self):
        """Find and click the disclaimer checkbox"""
        print("\n☑️ Looking for disclaimer checkbox...")
        
        try:
            # Wait for checkboxes to be present
            wait = WebDriverWait(self.driver, 10)
            checkboxes = wait.until(EC.presence_of_all_elements_located((By.CSS_SELECTOR, "input[type='checkbox']")))
            
            if checkboxes:
                print(f"   Found {len(checkboxes)} checkbox(es)")
                # Click the first one
                checkboxes[0].click()
                print("   ✅ Clicked checkbox!")
                time.sleep(2)
                return True
            else:
                print("   ⚠️ No checkboxes found")
                return False
                
        except Exception as e:
            print(f"   ❌ Checkbox error: {e}")
            return False
    
    def find_and_click_start_button(self):
        """Find and click the Start New Filing button"""
        print("\n🚀 Looking for 'Start New Filing' button...")
        
        try:
            # Try different approaches to find the button
            button_found = False
            
            # Approach 1: Look for buttons and check text
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            for button in buttons:
                if "start new filing" in button.text.lower():
                    button.click()
                    print("   ✅ Clicked button (method 1)!")
                    button_found = True
                    break
            
            if not button_found:
                # Approach 2: Look for input buttons
                inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='button'], input[type='submit']")
                for inp in inputs:
                    value = inp.get_attribute('value') or ""
                    if "start new filing" in value.lower():
                        inp.click()
                        print("   ✅ Clicked button (method 2)!")
                        button_found = True
                        break
            
            if not button_found:
                # Approach 3: Use JavaScript
                self.driver.execute_script("""
                    var elements = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
                    for(var i = 0; i < elements.length; i++) {
                        var text = elements[i].innerText || elements[i].value || "";
                        if(text.toLowerCase().includes('start new filing')) {
                            elements[i].click();
                            return true;
                        }
                    }
                    return false;
                """)
                print("   ✅ Clicked button (method 3)!")
                button_found = True
            
            return button_found
            
        except Exception as e:
            print(f"   ❌ Button error: {e}")
            return False
    
    def run(self):
        """Main automation flow"""
        try:
            # Setup driver
            if not self.setup_driver():
                return
            
            # Navigate to Sunbiz
            print("\n📍 Navigating to Sunbiz...")
            self.driver.get("https://efile.sunbiz.org/llc_file.html")
            
            # Take initial screenshot
            self.driver.save_screenshot("1_initial_load.png")
            print("📸 Screenshot: 1_initial_load.png")
            
            # Handle Cloudflare
            if self.handle_cloudflare():
                # Take screenshot after Cloudflare
                self.driver.save_screenshot("2_after_cloudflare.png")
                print("📸 Screenshot: 2_after_cloudflare.png")
                
                # Try to proceed with form
                checkbox_clicked = self.find_and_click_checkbox()
                
                if checkbox_clicked:
                    button_clicked = self.find_and_click_start_button()
                    
                    if button_clicked:
                        # Wait for next page
                        time.sleep(5)
                        self.driver.save_screenshot("3_after_button.png")
                        print("📸 Screenshot: 3_after_button.png")
                        print("\n✅ Successfully clicked button! Ready for form filling.")
                    else:
                        print("\n⚠️ Could not find/click start button")
                else:
                    print("\n⚠️ Could not find/click checkbox")
                    
            else:
                print("\n⚠️ Cloudflare not resolved. Manual intervention needed.")
                print("Complete the Cloudflare check manually, then press Enter...")
                input()
                
                # Try to continue after manual intervention
                self.find_and_click_checkbox()
                self.find_and_click_start_button()
            
            # Keep browser open
            print("\n✅ Automation complete! Browser stays open for 60 seconds...")
            print("Check the screenshots to see the progress.")
            time.sleep(60)
            
        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
            if self.driver:
                self.driver.save_screenshot("error.png")
                print("📸 Error screenshot saved")
        finally:
            if self.driver:
                self.driver.quit()
                print("\n👋 Browser closed")

# Test function
def test_basic():
    """Basic test to ensure driver works"""
    print("Running basic test...")
    try:
        driver = uc.Chrome(version_main=None)
        driver.get("https://www.google.com")
        print("✅ Basic test passed! Driver works.")
        time.sleep(3)
        driver.quit()
        return True
    except Exception as e:
        print(f"❌ Basic test failed: {e}")
        return False

if __name__ == "__main__":
    # Run basic test first
    print("Testing Chrome driver setup...")
    if test_basic():
        print("\n" + "="*50 + "\n")
        # Run main automation
        automation = SunbizAutomation()
        automation.run()
    else:
        print("\nPlease fix the driver issue before running automation.")