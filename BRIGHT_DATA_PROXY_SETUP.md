# Bright Data Proxy Setup Guide

## 🔑 **Understanding Your API Key**

The API key you provided (`f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a`) is for the **Bright Data API**, not for proxy authentication.

## 🚀 **Getting Proxy Credentials**

### **Step 1: Access Your Bright Data Dashboard**

1. Go to [https://brightdata.com/](https://brightdata.com/)
2. Log in with your account
3. Navigate to **"Proxy & Scraping Infrastructure"**

### **Step 2: Set Up Residential Proxies**

1. Click on **"Residential Proxies"**
2. Click **"Add Zone"** or **"Create Zone"**
3. Choose **"Residential Proxies"**
4. Configure your zone:
   - **Zone Name**: `delaware-search` (or any name you prefer)
   - **Country**: `United States`
   - **Sticky Session**: `Enabled` (recommended)
   - **Session Duration**: `10 minutes` (recommended)

### **Step 3: Get Your Proxy Credentials**

After creating the zone, you'll get:
- **Username**: Usually in format `brd-customer-hl_XXXXXXXXXX`
- **Password**: Usually in format `XXXXXXXXXX`
- **Endpoint**: `brd.superproxy.io:22225`

### **Step 4: Test Your Proxy Credentials**

```bash
# Test with curl
curl --proxy http://username:password@brd.superproxy.io:22225 https://httpbin.org/ip

# Test with Python
python test_bright_data_api.py
```

## 🔧 **Alternative: Use Your API Key with Bright Data API**

If you prefer to use your API key instead of proxy credentials, you can use the Bright Data API directly:

### **API Endpoint**
```
https://api.brightdata.com/request
```

### **Authentication**
```bash
Authorization: Bearer f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a
```

### **Example Request**
```bash
curl --request POST \
  --url https://api.brightdata.com/request \
  --header 'Authorization: Bearer f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a' \
  --header 'Content-Type: application/json' \
  --data '{
    "zone": "your_zone_name",
    "url": "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
    "format": "json",
    "method": "GET",
    "country": "us"
  }'
```

## 📝 **Update Your Configuration**

Once you have your proxy credentials, update `delaware_proxy_config.py`:

```python
PROXY_SERVICES = {
    'bright_data': {
        'enabled': True,
        'username': 'your_actual_proxy_username',  # Replace this
        'password': 'your_actual_proxy_password',  # Replace this
        'endpoint': 'brd.superproxy.io:22225',
        'session_id': 'random',
        'country': 'US',
        'protocol': 'http',
        'sticky_session': True,
        'rotation': 'session',
        'api_key': 'f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a'
    }
}
```

## 🧪 **Test Your Setup**

```bash
# Test proxy connection
python test_bright_data_api.py

# Test Delaware search
python test_delaware_proxy.py
```

## 💡 **Quick Start Options**

### **Option 1: Get Proxy Credentials (Recommended)**
1. Go to Bright Data dashboard
2. Create a Residential Proxy zone
3. Get username/password
4. Update configuration
5. Test connection

### **Option 2: Use API Directly**
1. Use your existing API key
2. Make requests to `https://api.brightdata.com/request`
3. Handle responses in your code

### **Option 3: Use Alternative Proxy Service**
1. Try ProxyMesh, Smartproxy, or Oxylabs
2. Update configuration with their credentials
3. Test connection

## 🆘 **Need Help?**

If you're having trouble:
1. Check Bright Data documentation
2. Contact Bright Data support
3. Try alternative proxy services
4. Use the API approach instead

---

**Your API key is valid for the Bright Data API, but you need separate proxy credentials for the proxy service!**
