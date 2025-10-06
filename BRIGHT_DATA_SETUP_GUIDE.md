# Bright Data Setup Guide for Delaware Name Search

## 🚀 **Complete Setup Process**

### **Step 1: Create Bright Data Account**

1. **Go to [https://brightdata.com/](https://brightdata.com/)**
2. **Click "Start Free Trial"** (no credit card required)
3. **Sign up** with your email address
4. **Verify your email** when you receive the confirmation

### **Step 2: Choose Proxy Service**

For Delaware name searches, I recommend:

#### **Option A: Residential Proxies (Recommended)**
- **Price**: 50% OFF - starts from $2.50/GB
- **Features**: 150M+ global IPs from real devices
- **Best for**: Avoiding detection, realistic traffic patterns
- **Endpoint**: `brd.superproxy.io:22225`

#### **Option B: ISP Proxies (Alternative)**
- **Price**: Starts from $1.3/IP
- **Features**: 1.3M+ fast static residential proxies
- **Best for**: Speed and reliability
- **Endpoint**: `brd.superproxy.io:22225`

### **Step 3: Get Your Credentials**

1. **Log in** to your Bright Data dashboard
2. **Navigate to** "Proxy & Scraping Infrastructure"
3. **Click on** "Residential Proxies" or "ISP Proxies"
4. **Copy your credentials**:
   - Username
   - Password
   - Endpoint (usually `brd.superproxy.io:22225`)

### **Step 4: Configure Your System**

#### **Method 1: Interactive Setup**
```bash
python bright_data_integration.py
```
This will guide you through the setup process interactively.

#### **Method 2: Manual Configuration**
Edit `delaware_proxy_config.py`:

```python
PROXY_SERVICES = {
    'bright_data': {
        'enabled': True,
        'username': 'your_actual_username',
        'password': 'your_actual_password',
        'endpoint': 'brd.superproxy.io:22225',
        'session_id': 'random',
        'country': 'US',
        'protocol': 'http',
        'sticky_session': True,
        'rotation': 'session'
    }
}
```

### **Step 5: Test Your Setup**

```bash
# Test Bright Data connection
python bright_data_integration.py

# Test Delaware search with proxy
python test_delaware_proxy.py
```

## 🔧 **Integration with Your Lambda**

### **Update Your Lambda Function**

```python
# In your Lambda function
event = {
    'companyName': 'Test Company LLC',
    'entityType': 'LLC',
    'useProxy': True,  # Enable Bright Data proxy
    'location': {'country': 'US', 'region': 'NY', 'city': 'New York'}
}

result = lambda_handler(event, None)
```

### **Environment Variables (Optional)**

Set these in your Lambda configuration:

```bash
BRIGHT_DATA_USERNAME=your_username
BRIGHT_DATA_PASSWORD=your_password
BRIGHT_DATA_ENDPOINT=brd.superproxy.io:22225
```

## 📊 **Bright Data Features for Delaware Search**

### **1. IP Rotation**
- **150M+ IPs** from real devices
- **US-focused** IP addresses
- **Session-based** rotation
- **Sticky sessions** for consistency

### **2. Anti-Detection**
- **Real device IPs** (not datacenter)
- **Geographic targeting** (US locations)
- **Session management** (30% reuse rate)
- **Realistic headers** and timing

### **3. Reliability**
- **99.99% uptime**
- **99.95% success rate**
- **24/7 support**
- **Enterprise-grade** security

## 💰 **Pricing Information**

### **Residential Proxies (Recommended)**
- **Free Trial**: Available (no credit card)
- **Pricing**: 50% OFF - starts from $2.50/GB
- **Billing**: Pay per GB used
- **Best for**: Avoiding bans, realistic traffic

### **ISP Proxies (Alternative)**
- **Pricing**: Starts from $1.3/IP
- **Billing**: Pay per IP per month
- **Best for**: Speed and reliability

### **Cost Estimation for Delaware Search**
- **Per search**: ~0.1-0.5 MB
- **100 searches**: ~50 MB = $0.125
- **1,000 searches**: ~500 MB = $1.25
- **10,000 searches**: ~5 GB = $12.50

## 🛡️ **Security & Compliance**

### **Bright Data Security Features**
- **GDPR compliant**
- **CCPA compliant**
- **SOC 2 certified**
- **ISO 27001 certified**
- **Zero personal data collection**

### **Ethical Web Scraping**
- **Public data only**
- **Respectful rate limiting**
- **Terms of service compliance**
- **Transparent practices**

## 🔍 **Testing & Validation**

### **Test Scripts Available**

1. **`bright_data_integration.py`** - Complete setup and testing
2. **`test_delaware_proxy.py`** - Delaware search with proxy
3. **`test_enhanced_rotation.py`** - IP and session rotation

### **Test Commands**

```bash
# Test Bright Data connection
python bright_data_integration.py

# Test Delaware search with proxy
python test_delaware_proxy.py

# Test enhanced rotation features
python test_enhanced_rotation.py
```

## 📈 **Monitoring & Optimization**

### **Key Metrics to Monitor**
- **Success rate**: Should be >95%
- **Response time**: Should be <30 seconds
- **Ban detection**: Monitor for block messages
- **Cost per search**: Track usage and costs

### **Optimization Tips**
1. **Use session reuse** (30% probability)
2. **Implement proper delays** (60+ seconds)
3. **Monitor for bans** and adjust timing
4. **Use geographic targeting** (US locations)

## 🚨 **Troubleshooting**

### **Common Issues**

#### **1. Connection Failed**
- Check credentials
- Verify endpoint
- Test with httpbin.org/ip

#### **2. Delaware Search Failed**
- Check if proxy is working
- Verify Delaware site access
- Monitor for ban detection

#### **3. High Costs**
- Optimize request frequency
- Use session reuse
- Monitor data usage

### **Debug Commands**

```bash
# Test proxy connection
curl --proxy http://username:password@brd.superproxy.io:22225 https://httpbin.org/ip

# Test Delaware access
curl --proxy http://username:password@brd.superproxy.io:22225 https://icis.corp.delaware.gov
```

## 🎯 **Best Practices**

### **1. Rate Limiting**
- **Minimum 60 seconds** between requests
- **Maximum 20 requests** per hour
- **Use exponential backoff** on errors

### **2. Session Management**
- **Reuse sessions** when possible (30% probability)
- **Rotate IPs** per session
- **Clean up old sessions** automatically

### **3. Error Handling**
- **Detect ban messages** in responses
- **Implement circuit breakers**
- **Have fallback strategies**

### **4. Cost Management**
- **Monitor usage** regularly
- **Set up alerts** for high usage
- **Optimize request patterns**

## 📞 **Support & Resources**

### **Bright Data Support**
- **24/7 support** available
- **Under 10 minutes** average response time
- **Multiple contact methods**

### **Documentation**
- **Bright Data Docs**: [https://brightdata.com/docs](https://brightdata.com/docs)
- **API Reference**: Available in dashboard
- **Integration Guides**: Multiple languages

### **Community**
- **Bright Data Community**: Forums and discussions
- **GitHub Examples**: Code samples and templates
- **Webinars**: Regular training sessions

---

## ✅ **Quick Start Checklist**

- [ ] Create Bright Data account
- [ ] Choose proxy service (Residential recommended)
- [ ] Get credentials (username, password, endpoint)
- [ ] Update `delaware_proxy_config.py`
- [ ] Test connection with `bright_data_integration.py`
- [ ] Test Delaware search with proxy
- [ ] Deploy to Lambda with proxy enabled
- [ ] Monitor performance and costs

**You're ready to use Bright Data with your Delaware name search system!** 🎉
