#!/bin/bash

# Deploy updated proxy server to AWS Lightsail with production configuration

echo "🚀 Deploying Namecheap Proxy Server to Production..."

# Server details
SERVER_IP="3.149.156.19"
SERVER_USER="ubuntu"
KEY_PATH="~/.ssh/your-key.pem"  # Update with your actual key path

# Update this with your actual SSH key path
echo "📝 Update the KEY_PATH variable in this script with your actual SSH key path"
echo "   Current: $KEY_PATH"

# Copy files to server
echo "📤 Copying files to server..."
scp -i $KEY_PATH lightsail-proxy-server.py $SERVER_USER@$SERVER_IP:/home/ubuntu/
scp -i $KEY_PATH requirements-proxy.txt $SERVER_USER@$SERVER_IP:/home/ubuntu/

# Connect to server and restart service
echo "🔄 Restarting proxy service..."
ssh -i $KEY_PATH $SERVER_USER@$SERVER_IP << 'EOF'
    # Stop existing service
    sudo systemctl stop namecheap-proxy || true
    
    # Install/update dependencies
    pip3 install -r requirements-proxy.txt
    
    # Set environment variables
    export NAMECHEAP_ENV=production
    export NAMECHEAP_PROD_API_USER=your_production_api_user
    export NAMECHEAP_PROD_API_KEY=your_production_api_key
    export NAMECHEAP_PROD_USERNAME=your_production_username
    export NAMECHEAP_PROD_CLIENT_IP=3.149.156.19
    export PROXY_TOKEN=your_proxy_token
    
    # Start service
    sudo systemctl start namecheap-proxy
    sudo systemctl enable namecheap-proxy
    
    # Check status
    sudo systemctl status namecheap-proxy
EOF

echo "✅ Proxy server deployment complete!"
echo "🌐 Test the API: curl http://3.149.156.19:8000/"
