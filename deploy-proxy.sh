#!/bin/bash

# Deploy Namecheap Proxy Server to Lightsail
# Usage: ./deploy-proxy.sh

echo "🚀 Deploying Namecheap Proxy Server to Lightsail..."

# Configuration
LIGHTSAIL_IP="3.149.156.19"
SSH_KEY="$HOME/Downloads/LightsailDefaultKey-us-east-2.pem"  # Update this path
SERVER_USER="ubuntu"

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key not found at $SSH_KEY"
    echo "Please download your Lightsail SSH key and update the path in this script"
    exit 1
fi

echo "📦 Uploading files to Lightsail instance..."

# Upload files
scp -i "$SSH_KEY" lightsail-proxy-server.py "$SERVER_USER@$LIGHTSAIL_IP:/home/ubuntu/"
scp -i "$SSH_KEY" requirements-proxy.txt "$SERVER_USER@$LIGHTSAIL_IP:/home/ubuntu/"

echo "🔧 Setting up server..."

# SSH into server and setup
ssh -i "$SSH_KEY" "$SERVER_USER@$LIGHTSAIL_IP" << 'EOF'
    # Update system
    sudo apt update && sudo apt upgrade -y
    
    # Install Python and pip
    sudo apt install -y python3 python3-pip python3-venv
    
    # Create virtual environment
    python3 -m venv proxy-env
    source proxy-env/bin/activate
    
    # Install requirements
    pip install -r requirements-proxy.txt
    
    # Create systemd service
    sudo tee /etc/systemd/system/namecheap-proxy.service > /dev/null << 'SERVICE_EOF'
[Unit]
Description=Namecheap Proxy Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu
Environment=PATH=/home/ubuntu/proxy-env/bin
Environment=NAMECHEAP_USER=your_namecheap_user
Environment=NAMECHEAP_API_KEY=your_api_key
Environment=NAMECHEAP_USERNAME=your_username
Environment=CLIENT_IP=3.149.156.19
Environment=PROXY_TOKEN=super-secret-32char-token
Environment=PORT=8000
Environment=DEBUG=False
ExecStart=/home/ubuntu/proxy-env/bin/python lightsail-proxy-server.py
Restart=always

[Install]
WantedBy=multi-user.target
SERVICE_EOF

    # Enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable namecheap-proxy
    sudo systemctl start namecheap-proxy
    
    # Check status
    sudo systemctl status namecheap-proxy
    
    echo "✅ Proxy server deployed successfully!"
    echo "🔗 Server running on http://3.149.156.19:8000"
    echo "🔑 Token: super-secret-32char-token"
EOF

echo "🎉 Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Update Namecheap credentials in /etc/systemd/system/namecheap-proxy.service"
echo "2. Restart service: sudo systemctl restart namecheap-proxy"
echo "3. Test: curl http://3.149.156.19:8000/"
echo ""
echo "To view logs: sudo journalctl -u namecheap-proxy -f"
