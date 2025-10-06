# Delaware Name Search - Advanced Deployment Guide

This guide covers deploying the Delaware name search system with IP rotation, session management, and anti-detection measures to avoid bans.

## 🚨 Current Status: BANNED

**Important**: We've been banned from Delaware's search system due to excessive automated requests. This guide provides strategies to avoid future bans.

## 📁 Files Overview

### Core Lambda Functions
- `delaware_lambda.py` - Basic version (currently banned)
- `delaware_lambda_robust.py` - Enhanced version with better rate limiting
- `delaware_lambda_proxy.py` - Advanced version with proxy support

### Configuration Files
- `delaware_proxy_config.py` - Proxy service configurations
- `Dockerfile-delaware` - Container configuration
- `buildspec-delaware.yml` - ECR deployment script
- `requirements_delaware.txt` - Dependencies

## 🛡️ Anti-Ban Strategies

### 1. **Rate Limiting & Timing**
```python
# Conservative timing settings
base_delay = 45  # 45 seconds base delay
max_delay = 300  # 5 minutes maximum
jitter_range = (10, 30)  # Random 10-30 second jitter
retry_delay = 120  # 2 minutes between retries
```

### 2. **User Agent Rotation**
- 10+ different browser user agents
- Different OS combinations (Windows, macOS, Linux)
- Mobile device simulation
- Random browser version selection

### 3. **US Geographic Rotation**
- Simulate requests from 50+ US states and territories
- Regional Accept-Language headers (Spanish for TX/FL/CA, French for LA, etc.)
- US IP address geolocation simulation
- Major city focus for diverse populations

### 4. **Session Management**
- New session for each request
- Random timeout settings
- Different header combinations
- Session fingerprint randomization

## 🌐 Proxy Services Setup

### Recommended Proxy Services

#### 1. **Bright Data (Enterprise)**
```python
'bright_data': {
    'enabled': True,
    'username': 'your_username',
    'password': 'your_password',
    'endpoint': 'brd.superproxy.io:22225',
    'session_id': 'random',
    'country': 'US',
    'protocol': 'http'
}
```

#### 2. **Smartproxy (Residential)**
```python
'smartproxy': {
    'enabled': True,
    'username': 'your_username',
    'password': 'your_password',
    'endpoint': 'gate.smartproxy.com:7000',
    'country': 'US',
    'protocol': 'http'
}
```

#### 3. **ProxyMesh (Simple)**
```python
'proxymesh': {
    'enabled': True,
    'username': 'your_username',
    'password': 'your_password',
    'endpoint': 'us-wa.proxymesh.com:31280',
    'protocol': 'http'
}
```

### Setting Up Proxies

1. **Sign up for a proxy service**
2. **Get your credentials**
3. **Update `delaware_proxy_config.py`**
4. **Set `enabled: True` for your service**
5. **Add your username/password**

## 🚀 Deployment Options

### Option 1: Basic Robust Version
```bash
# Use the robust version without proxies
aws codebuild start-build \
  --project-name delaware-robust \
  --buildspec-override buildspec-delaware.yml \
  --environment-variables-override \
    name=LAMBDA_FUNCTION_NAME,value=delaware-robust-search
```

### Option 2: Advanced Proxy Version
```bash
# Use the advanced version with proxy support
aws codebuild start-build \
  --project-name delaware-advanced \
  --buildspec-override buildspec-delaware-advanced.yml \
  --environment-variables-override \
    name=LAMBDA_FUNCTION_NAME,value=delaware-advanced-search
```

## ⚙️ Environment Variables

### Required Variables
```bash
AWS_DEFAULT_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
IMAGE_REPO_NAME=delaware-name-search
IMAGE_TAG=latest
LAMBDA_FUNCTION_NAME=delaware-name-search
```

### Optional Variables
```bash
# Proxy configuration
PROXY_SERVICE=smartproxy
PROXY_USERNAME=your_username
PROXY_PASSWORD=your_password

# US Geographic settings
DEFAULT_COUNTRY=US
DEFAULT_REGION=NY
DEFAULT_CITY=New York

# Timing settings
BASE_DELAY=45
MAX_DELAY=300
```

## 📊 Monitoring & Alerts

### CloudWatch Metrics to Monitor
- **Request Count**: Track total requests
- **Success Rate**: Monitor successful searches
- **Error Rate**: Watch for ban detection
- **Response Time**: Monitor performance
- **Proxy Usage**: Track proxy rotation

### Recommended Alerts
```yaml
# CloudWatch Alarm for ban detection
BanDetection:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: Delaware-Ban-Detection
    MetricName: BanDetected
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    EvaluationPeriods: 1
    Period: 300
```

## 🔄 Usage Patterns

### Conservative Usage (Recommended)
- **1 request per 2-3 minutes**
- **Maximum 20 requests per hour**
- **Use during business hours only**
- **Implement circuit breaker on errors**

### Event-Driven Usage
```python
# Example: Only search when user explicitly requests
def handle_user_request(event):
    if event.get('source') == 'user_action':
        return search_delaware(event['companyName'])
    else:
        return {'error': 'Search not allowed'}
```

## 🛠️ Testing Strategy

### 1. **Local Testing**
```bash
# Test with different configurations
python test_delaware_robust.py
python test_delaware_proxy.py
```

### 2. **Staging Environment**
- Deploy to staging first
- Test with real proxy services
- Monitor for ban detection
- Validate response accuracy

### 3. **Production Rollout**
- Gradual rollout (10% → 50% → 100%)
- Monitor metrics closely
- Have fallback strategies ready

## 🚨 Fallback Strategies

### 1. **Official APIs**
- CT Corporation API
- CSC API
- LexisNexis API
- Delaware's authorized vendors

### 2. **Manual Verification**
- Queue requests for manual review
- Email notifications for critical searches
- Admin dashboard for manual checks

### 3. **Alternative Sources**
- State business registries
- Third-party business databases
- Public records APIs

## 📋 Best Practices

### 1. **Request Management**
- Always use delays between requests
- Implement exponential backoff
- Rotate user agents and headers
- Use different IP addresses

### 2. **Error Handling**
- Detect ban messages
- Implement circuit breakers
- Log all errors for analysis
- Have graceful degradation

### 3. **Compliance**
- Respect robots.txt
- Follow terms of service
- Implement rate limiting
- Monitor for policy changes

## 🔧 Troubleshooting

### Common Issues

#### 1. **Still Getting Banned**
- Increase delays (60+ seconds)
- Use more proxy services
- Reduce request frequency
- Check for detection patterns

#### 2. **Proxy Not Working**
- Verify credentials
- Check proxy service status
- Test proxy connectivity
- Try different proxy services

#### 3. **False Positives**
- Review name normalization
- Check search terms
- Verify result parsing
- Test with known entities

### Debug Commands
```bash
# Test proxy connectivity
curl --proxy http://username:password@proxy.example.com:8080 https://icis.corp.delaware.gov

# Check response headers
curl -I https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx

# Test with different user agents
curl -H "User-Agent: Mozilla/5.0..." https://icis.corp.delaware.gov
```

## 📈 Performance Optimization

### 1. **Caching**
- Cache successful searches
- Implement TTL for results
- Use Redis for session storage
- Cache form tokens

### 2. **Parallel Processing**
- Process multiple searches
- Use async/await patterns
- Implement request queuing
- Batch similar requests

### 3. **Resource Management**
- Optimize memory usage
- Implement connection pooling
- Use efficient data structures
- Monitor Lambda cold starts

## 🎯 Success Metrics

### Key Performance Indicators
- **Availability**: 99%+ uptime
- **Accuracy**: 95%+ correct results
- **Speed**: <30 seconds per search
- **Reliability**: <1% ban rate

### Monitoring Dashboard
- Real-time request status
- Success/failure rates
- Response time trends
- Proxy rotation status
- Error rate by type

## 📞 Support & Maintenance

### Regular Maintenance
- **Weekly**: Review logs and metrics
- **Monthly**: Update user agents and headers
- **Quarterly**: Review proxy service performance
- **Annually**: Update compliance policies

### Emergency Procedures
1. **Immediate**: Stop all automated requests
2. **Investigate**: Check logs for ban indicators
3. **Mitigate**: Switch to fallback methods
4. **Recover**: Implement new anti-detection measures
5. **Prevent**: Update monitoring and alerts

---

## ⚠️ Legal Disclaimer

This system is designed for legitimate business use only. Users are responsible for:
- Complying with Delaware's terms of service
- Respecting rate limits and usage policies
- Using appropriate delays and anti-detection measures
- Following applicable laws and regulations

The authors are not responsible for any misuse or violations of terms of service.
