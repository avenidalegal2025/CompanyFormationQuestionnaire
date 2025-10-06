#!/usr/bin/env python3
"""
Bright Data Integration for Delaware Name Search
This script demonstrates how to integrate Bright Data proxies with the Delaware search system.
"""

import requests
import random
import time
import json
from delaware_proxy_config import PROXY_SERVICES, get_random_proxy, build_proxy_url

def test_bright_data_connection():
    """Test connection to Bright Data proxy service"""
    
    print("🔗 Testing Bright Data Connection")
    print("=" * 50)
    
    # Get Bright Data configuration
    bright_data_config = PROXY_SERVICES.get('bright_data', {})
    
    if not bright_data_config.get('enabled', False):
        print("❌ Bright Data is not enabled in configuration")
        print("   Please update delaware_proxy_config.py with your credentials")
        return False
    
    if bright_data_config.get('username') == 'your_bright_data_username':
        print("❌ Please update your Bright Data credentials in delaware_proxy_config.py")
        print("   Replace 'your_bright_data_username' and 'your_bright_data_password'")
        return False
    
    # Build proxy URL
    proxy_url = build_proxy_url(bright_data_config)
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Proxy URL: {proxy_url}")
    
    # Test connection
    try:
        session = requests.Session()
        session.proxies = {
            'http': proxy_url,
            'https': proxy_url
        }
        
        # Test with a simple request
        test_url = 'https://httpbin.org/ip'
        print(f"🧪 Testing with: {test_url}")
        
        response = session.get(test_url, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        print(f"✅ Success! Your IP: {result.get('origin', 'Unknown')}")
        return True
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def test_delaware_with_bright_data():
    """Test Delaware search using Bright Data proxy"""
    
    print("\n🏛️ Testing Delaware Search with Bright Data")
    print("=" * 50)
    
    # Get proxy configuration
    proxy_config = get_random_proxy()
    if not proxy_config:
        print("❌ No proxy configuration available")
        return False
    
    proxy_url = build_proxy_url(proxy_config)
    if not proxy_url:
        print("❌ Failed to build proxy URL")
        return False
    
    print(f"🌐 Using proxy: {proxy_url}")
    
    try:
        # Create session with Bright Data proxy
        session = requests.Session()
        session.proxies = {
            'http': proxy_url,
            'https': proxy_url
        }
        
        # Set realistic headers
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
        
        # Test Delaware search page access
        delaware_url = 'https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx'
        print(f"🔍 Testing access to: {delaware_url}")
        
        response = session.get(delaware_url, timeout=30)
        response.raise_for_status()
        
        print(f"✅ Successfully accessed Delaware search page")
        print(f"   Status Code: {response.status_code}")
        print(f"   Response Length: {len(response.text)} characters")
        
        # Check if we can find the search form
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        form = soup.find('form')
        
        if form:
            print("✅ Found search form - ready for searches")
            return True
        else:
            print("⚠️  Search form not found - may need to adjust approach")
            return False
            
    except Exception as e:
        print(f"❌ Delaware search test failed: {e}")
        return False

def setup_bright_data_credentials():
    """Interactive setup for Bright Data credentials"""
    
    print("⚙️ Bright Data Credentials Setup")
    print("=" * 50)
    
    print("To set up Bright Data:")
    print("1. Go to https://brightdata.com/")
    print("2. Click 'Start Free Trial'")
    print("3. Sign up (no credit card required)")
    print("4. Go to your dashboard")
    print("5. Navigate to 'Proxy & Scraping Infrastructure'")
    print("6. Click on 'Residential Proxies' or 'ISP Proxies'")
    print("7. Copy your credentials")
    print()
    
    username = input("Enter your Bright Data username: ").strip()
    password = input("Enter your Bright Data password: ").strip()
    endpoint = input("Enter your proxy endpoint (or press Enter for default): ").strip()
    
    if not endpoint:
        endpoint = "brd.superproxy.io:22225"
    
    if username and password:
        print(f"\n✅ Credentials received:")
        print(f"   Username: {username}")
        print(f"   Password: {'*' * len(password)}")
        print(f"   Endpoint: {endpoint}")
        
        # Update configuration
        update_config = input("\nUpdate delaware_proxy_config.py with these credentials? (y/n): ").strip().lower()
        
        if update_config == 'y':
            # Read current config
            with open('delaware_proxy_config.py', 'r') as f:
                content = f.read()
            
            # Replace placeholders
            content = content.replace('your_bright_data_username', username)
            content = content.replace('your_bright_data_password', password)
            content = content.replace('brd.superproxy.io:22225', endpoint)
            
            # Write updated config
            with open('delaware_proxy_config.py', 'w') as f:
                f.write(content)
            
            print("✅ Configuration updated successfully!")
            return True
        else:
            print("⚠️  Configuration not updated. Please update manually.")
            return False
    else:
        print("❌ Invalid credentials provided")
        return False

def demonstrate_bright_data_usage():
    """Demonstrate how to use Bright Data with Delaware search"""
    
    print("\n📚 Bright Data Usage Demonstration")
    print("=" * 50)
    
    print("Here's how to use Bright Data with your Delaware search:")
    print()
    
    print("1. **Basic Usage:**")
    print("   ```python")
    print("   from delaware_lambda_enhanced import lambda_handler")
    print("   ")
    print("   event = {")
    print("       'companyName': 'Test Company LLC',")
    print("       'entityType': 'LLC',")
    print("       'useProxy': True  # Enable Bright Data proxy")
    print("   }")
    print("   ")
    print("   result = lambda_handler(event, None)")
    print("   ```")
    print()
    
    print("2. **With Specific Location:**")
    print("   ```python")
    print("   event = {")
    print("       'companyName': 'Test Company LLC',")
    print("       'entityType': 'LLC',")
    print("       'useProxy': True,")
    print("       'location': {'country': 'US', 'region': 'NY', 'city': 'New York'}")
    print("   }")
    print("   ```")
    print()
    
    print("3. **Environment Variables:**")
    print("   ```bash")
    print("   export BRIGHT_DATA_USERNAME='your_username'")
    print("   export BRIGHT_DATA_PASSWORD='your_password'")
    print("   export BRIGHT_DATA_ENDPOINT='brd.superproxy.io:22225'")
    print("   ```")
    print()
    
    print("4. **Lambda Environment Variables:**")
    print("   - Add these to your Lambda function configuration")
    print("   - Or use AWS Systems Manager Parameter Store")
    print("   - Or use AWS Secrets Manager for security")

def main():
    """Main function to run all tests"""
    
    print("🚀 Bright Data Integration for Delaware Name Search")
    print("=" * 60)
    
    # Check if credentials are set up
    bright_data_config = PROXY_SERVICES.get('bright_data', {})
    
    if bright_data_config.get('username') == 'your_bright_data_username':
        print("⚠️  Bright Data credentials not configured")
        setup_choice = input("Would you like to set up credentials now? (y/n): ").strip().lower()
        
        if setup_choice == 'y':
            if setup_bright_data_credentials():
                print("\n🔄 Re-running tests with new credentials...")
                time.sleep(2)
            else:
                print("❌ Setup failed. Please configure manually.")
                return
        else:
            print("📝 Please update delaware_proxy_config.py with your Bright Data credentials")
            return
    
    # Test connection
    if test_bright_data_connection():
        print("\n🎉 Bright Data connection successful!")
        
        # Test Delaware search
        if test_delaware_with_bright_data():
            print("\n🎉 Delaware search with Bright Data successful!")
        else:
            print("\n⚠️  Delaware search test failed")
    else:
        print("\n❌ Bright Data connection failed")
    
    # Show usage examples
    demonstrate_bright_data_usage()
    
    print("\n✅ Bright Data integration complete!")
    print("\nNext steps:")
    print("1. Update your Lambda function to use Bright Data")
    print("2. Deploy with the enhanced proxy configuration")
    print("3. Monitor for ban detection and adjust as needed")

if __name__ == "__main__":
    main()
