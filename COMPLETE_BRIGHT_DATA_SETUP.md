# Complete Bright Data Setup Guide

## 🎯 **Current Status**

✅ **API Key Valid**: `f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a`  
❌ **Zone Missing**: You need to create a zone for proxy/API access  
❌ **Proxy Credentials**: You need separate proxy credentials  

## 🚀 **Step-by-Step Setup**

### **Step 1: Create a Zone (Required)**

1. **Go to Bright Data Dashboard**
   - Visit [https://brightdata.com/](https://brightdata.com/)
   - Log in with your account

2. **Navigate to Proxy & Scraping Infrastructure**
   - Click on "Proxy & Scraping Infrastructure"
   - Click on "Residential Proxies"

3. **Create a New Zone**
   - Click "Add Zone" or "Create Zone"
   - Choose "Residential Proxies"
   - Configure:
     - **Zone Name**: `delaware-search`
     - **Country**: `United States`
     - **Sticky Session**: `Enabled`
     - **Session Duration**: `10 minutes`

4. **Get Your Zone ID**
   - After creating, you'll get a zone ID (e.g., `zone123456`)
   - Save this zone ID

### **Step 2: Get Proxy Credentials**

1. **In Your Zone Settings**
   - Click on your newly created zone
   - Go to "Authentication" or "Credentials"
   - You'll see:
     - **Username**: `brd-customer-hl_XXXXXXXXXX`
     - **Password**: `XXXXXXXXXX`
     - **Endpoint**: `brd.superproxy.io:22225`

2. **Save These Credentials**
   - Copy the username and password
   - These are different from your API key

### **Step 3: Update Your Configuration**

Update `delaware_proxy_config.py`:

```python
PROXY_SERVICES = {
    'bright_data': {
        'enabled': True,
        'username': 'brd-customer-hl_XXXXXXXXXX',  # Your actual proxy username
        'password': 'XXXXXXXXXX',  # Your actual proxy password
        'endpoint': 'brd.superproxy.io:22225',
        'session_id': 'random',
        'country': 'US',
        'protocol': 'http',
        'sticky_session': True,
        'rotation': 'session',
        'api_key': 'f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a',
        'zone_id': 'your_zone_id_here'  # Add your zone ID
    }
}
```

### **Step 4: Test Your Setup**

```bash
# Test proxy connection
python test_bright_data_api.py

# Test Delaware search
python test_delaware_proxy.py
```

## 🔧 **Alternative: Use API Only (No Proxy)**

If you prefer to use only the API without proxy credentials:

### **Update API Client**

```python
# In bright_data_api_client.py
data = {
    "zone": "your_zone_id_here",  # Use your actual zone ID
    "url": "https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx",
    "format": "html",
    "method": "GET",
    "country": "us"
}
```

### **Test API Only**

```bash
python bright_data_api_client.py
```

## 📊 **What You Need to Do Right Now**

### **Option 1: Get Proxy Credentials (Recommended)**
1. ✅ Go to Bright Data dashboard
2. ✅ Create a Residential Proxy zone
3. ✅ Get username/password from zone
4. ⚙️ Update `delaware_proxy_config.py`
5. 🧪 Test with `python test_bright_data_api.py`

### **Option 2: Use API Only**
1. ✅ Go to Bright Data dashboard
2. ✅ Create a zone and get zone ID
3. ⚙️ Update `bright_data_api_client.py` with zone ID
4. 🧪 Test with `python bright_data_api_client.py`

## 💰 **Cost Information**

- **Free Trial**: Available (no credit card)
- **Residential Proxies**: 50% OFF - $2.50/GB
- **API Requests**: Included with proxy service
- **Estimated Cost**: ~$0.125 per 100 searches

## 🆘 **Quick Troubleshooting**

### **If you get "zone not found":**
- Create a zone in your Bright Data dashboard
- Use the correct zone ID in your requests

### **If you get "proxy authentication failed":**
- Get proxy credentials from your zone settings
- Update username/password in configuration

### **If you get "API key invalid":**
- Check if your API key is correct
- Verify your account is active

## 🎯 **Next Steps**

1. **Create a zone** in Bright Data dashboard
2. **Get proxy credentials** from zone settings
3. **Update configuration** with real credentials
4. **Test connection** with provided scripts
5. **Deploy to Lambda** with working setup

---

**Your API key is valid, but you need to create a zone and get proxy credentials to use the service!**
