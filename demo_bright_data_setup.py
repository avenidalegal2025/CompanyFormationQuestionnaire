#!/usr/bin/env python3
"""
Bright Data Setup Demonstration
This script shows how to set up and use Bright Data with the Delaware search system.
"""

import requests
import json
from delaware_proxy_config import PROXY_SERVICES, build_proxy_url

def demonstrate_bright_data_setup():
    """Demonstrate Bright Data setup process"""
    
    print("🚀 Bright Data Setup Demonstration")
    print("=" * 60)
    
    print("📋 Step-by-Step Setup Process:")
    print()
    
    print("1. 🌐 Create Bright Data Account")
    print("   • Go to https://brightdata.com/")
    print("   • Click 'Start Free Trial'")
    print("   • Sign up (no credit card required)")
    print("   • Verify your email")
    print()
    
    print("2. 🔧 Choose Proxy Service")
    print("   • Residential Proxies: 50% OFF - $2.50/GB (Recommended)")
    print("   • ISP Proxies: $1.3/IP (Alternative)")
    print("   • Both use endpoint: brd.superproxy.io:22225")
    print()
    
    print("3. 📝 Get Your Credentials")
    print("   • Log in to Bright Data dashboard")
    print("   • Navigate to 'Proxy & Scraping Infrastructure'")
    print("   • Click on 'Residential Proxies'")
    print("   • Copy: Username, Password, Endpoint")
    print()
    
    print("4. ⚙️ Configure Your System")
    print("   • Update delaware_proxy_config.py")
    print("   • Replace placeholder credentials")
    print("   • Set enabled: True")
    print()
    
    print("5. 🧪 Test Your Setup")
    print("   • Run: python bright_data_integration.py")
    print("   • Test Delaware search with proxy")
    print("   • Monitor for success/errors")
    print()

def show_current_configuration():
    """Show current Bright Data configuration"""
    
    print("📊 Current Bright Data Configuration")
    print("=" * 50)
    
    bright_data_config = PROXY_SERVICES.get('bright_data', {})
    
    print(f"Enabled: {bright_data_config.get('enabled', False)}")
    print(f"Username: {bright_data_config.get('username', 'Not set')}")
    print(f"Password: {'*' * len(bright_data_config.get('password', '')) if bright_data_config.get('password') else 'Not set'}")
    print(f"Endpoint: {bright_data_config.get('endpoint', 'Not set')}")
    print(f"Country: {bright_data_config.get('country', 'Not set')}")
    print(f"Protocol: {bright_data_config.get('protocol', 'Not set')}")
    print(f"Sticky Session: {bright_data_config.get('sticky_session', False)}")
    print(f"Rotation: {bright_data_config.get('rotation', 'Not set')}")
    print()

def show_configuration_template():
    """Show configuration template"""
    
    print("📝 Configuration Template")
    print("=" * 40)
    
    template = """
# In delaware_proxy_config.py
PROXY_SERVICES = {
    'bright_data': {
        'enabled': True,  # Set to True when ready
        'username': 'your_actual_username',  # Replace this
        'password': 'your_actual_password',  # Replace this
        'endpoint': 'brd.superproxy.io:22225',  # Default endpoint
        'session_id': 'random',
        'country': 'US',
        'protocol': 'http',
        'sticky_session': True,
        'rotation': 'session'
    }
}
"""
    
    print(template)

def demonstrate_usage_examples():
    """Show usage examples"""
    
    print("💡 Usage Examples")
    print("=" * 30)
    
    print("1. Basic Usage:")
    print("   ```python")
    print("   from delaware_lambda_enhanced import lambda_handler")
    print("   ")
    print("   event = {")
    print("       'companyName': 'Test Company LLC',")
    print("       'entityType': 'LLC',")
    print("       'useProxy': True  # Enable Bright Data")
    print("   }")
    print("   ")
    print("   result = lambda_handler(event, None)")
    print("   ```")
    print()
    
    print("2. With Location:")
    print("   ```python")
    print("   event = {")
    print("       'companyName': 'Test Company LLC',")
    print("       'entityType': 'LLC',")
    print("       'useProxy': True,")
    print("       'location': {'country': 'US', 'region': 'NY'}")
    print("   }")
    print("   ```")
    print()
    
    print("3. Environment Variables:")
    print("   ```bash")
    print("   export BRIGHT_DATA_USERNAME='your_username'")
    print("   export BRIGHT_DATA_PASSWORD='your_password'")
    print("   export BRIGHT_DATA_ENDPOINT='brd.superproxy.io:22225'")
    print("   ```")

def show_pricing_breakdown():
    """Show pricing breakdown"""
    
    print("💰 Bright Data Pricing Breakdown")
    print("=" * 40)
    
    print("Residential Proxies (Recommended):")
    print("• Price: 50% OFF - $2.50/GB")
    print("• Features: 150M+ IPs from real devices")
    print("• Best for: Avoiding detection")
    print()
    
    print("Cost Estimation for Delaware Search:")
    print("• Per search: ~0.1-0.5 MB")
    print("• 100 searches: ~50 MB = $0.125")
    print("• 1,000 searches: ~500 MB = $1.25")
    print("• 10,000 searches: ~5 GB = $12.50")
    print()
    
    print("ISP Proxies (Alternative):")
    print("• Price: $1.3/IP")
    print("• Features: 1.3M+ fast static residential")
    print("• Best for: Speed and reliability")

def show_testing_commands():
    """Show testing commands"""
    
    print("🧪 Testing Commands")
    print("=" * 25)
    
    print("1. Test Bright Data connection:")
    print("   python bright_data_integration.py")
    print()
    
    print("2. Test Delaware search with proxy:")
    print("   python test_delaware_proxy.py")
    print()
    
    print("3. Test enhanced rotation:")
    print("   python test_enhanced_rotation.py")
    print()
    
    print("4. Manual proxy test:")
    print("   curl --proxy http://username:password@brd.superproxy.io:22225 https://httpbin.org/ip")
    print()

def show_next_steps():
    """Show next steps"""
    
    print("🎯 Next Steps")
    print("=" * 20)
    
    print("1. ✅ Create Bright Data account")
    print("2. ✅ Choose proxy service (Residential recommended)")
    print("3. ✅ Get credentials from dashboard")
    print("4. ⚙️ Update delaware_proxy_config.py")
    print("5. 🧪 Test connection with bright_data_integration.py")
    print("6. 🏛️ Test Delaware search with proxy")
    print("7. 🚀 Deploy to Lambda with proxy enabled")
    print("8. 📊 Monitor performance and costs")
    print()
    
    print("📚 Documentation:")
    print("• Bright Data Setup Guide: BRIGHT_DATA_SETUP_GUIDE.md")
    print("• Enhanced Rotation Guide: ENHANCED_ROTATION_GUIDE.md")
    print("• Delaware Deployment Guide: DELAWARE_DEPLOYMENT_GUIDE.md")

def main():
    """Main demonstration function"""
    
    demonstrate_bright_data_setup()
    show_current_configuration()
    show_configuration_template()
    demonstrate_usage_examples()
    show_pricing_breakdown()
    show_testing_commands()
    show_next_steps()
    
    print("🎉 Bright Data Setup Demonstration Complete!")
    print()
    print("Ready to set up Bright Data for your Delaware name search system!")

if __name__ == "__main__":
    main()
