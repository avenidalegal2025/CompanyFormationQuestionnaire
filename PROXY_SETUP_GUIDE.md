# Namecheap Proxy Server Setup Guide

## 🚀 Quick Setup for 30 Domains/Month

### Prerequisites
1. **Lightsail instance running** (3.149.156.19)
2. **Namecheap API credentials**
3. **SSH access to Lightsail**

### Step 1: Get Namecheap API Credentials

1. Go to [Namecheap API Management](https://www.namecheap.com/support/api/)
2. Enable API access
3. Get your credentials:
   - **ApiUser**: Your Namecheap username
   - **ApiKey**: Your API key
   - **Username**: Your Namecheap username
   - **ClientIP**: Your server's IP (3.149.156.19)

### Step 2: Deploy Proxy Server

```bash
# Make sure you have SSH key for Lightsail
# Download from AWS Lightsail console if needed

# Run deployment script
./deploy-proxy.sh
```

### Step 3: Configure Namecheap Credentials

SSH into your server and update the service file:

```bash
ssh -i ~/.ssh/lightsail-key.pem ubuntu@3.149.156.19

# Edit the service file
sudo nano /etc/systemd/system/namecheap-proxy.service

# Update these lines:
Environment=NAMECHEAP_USER=your_actual_username
Environment=NAMECHEAP_API_KEY=your_actual_api_key
Environment=NAMECHEAP_USERNAME=your_actual_username

# Restart service
sudo systemctl restart namecheap-proxy
```

### Step 4: Test the Server

```bash
# Health check
curl http://3.149.156.19:8000/

# Test domain check
curl -X POST http://3.149.156.19:8000/domains/check \
  -H "Content-Type: application/json" \
  -H "x-proxy-token: super-secret-32char-token" \
  -d '{"domains": ["example.com", "test123.com"]}'
```

### Step 5: Update Your Next.js App

Your Next.js app is already configured to use `http://3.149.156.19:8000` - no changes needed!

## 🔧 Features Included

### API Endpoints
- `GET /` - Health check
- `POST /namecheap` - Generic Namecheap API proxy
- `POST /domains/check` - Check domain availability
- `POST /domains/pricing` - Get domain pricing
- `POST /domains/purchase` - Purchase domain
- `GET /domains/list` - List all domains
- `GET /admin/stats` - Admin statistics

### Database
- SQLite database for domain tracking
- Automatic logging of API calls
- Domain inventory management

### Security
- Token-based authentication
- Rate limiting ready
- Input validation

## 📊 Monitoring

### View Logs
```bash
# Real-time logs
sudo journalctl -u namecheap-proxy -f

# Recent logs
sudo journalctl -u namecheap-proxy --since "1 hour ago"
```

### Check Status
```bash
# Service status
sudo systemctl status namecheap-proxy

# Restart if needed
sudo systemctl restart namecheap-proxy
```

## 💰 Cost Optimization

For 30 domains/month, this setup costs:
- **Lightsail**: $5/month (512 MB instance)
- **Namecheap API**: Free (1000 requests/day)
- **Total**: ~$5/month

## 🔄 Next Steps

1. **Test the complete flow** from your Next.js app
2. **Integrate Stripe payments** for domain purchases
3. **Set up monitoring** and alerts
4. **Configure auto-renewal** for domains

## 🆘 Troubleshooting

### Server Not Responding
```bash
# Check if service is running
sudo systemctl status namecheap-proxy

# Check logs
sudo journalctl -u namecheap-proxy -f

# Restart service
sudo systemctl restart namecheap-proxy
```

### API Errors
- Verify Namecheap credentials
- Check IP whitelist in Namecheap
- Review API logs in database

### Database Issues
```bash
# Check database
sqlite3 domains.db
.tables
.schema domains
```
