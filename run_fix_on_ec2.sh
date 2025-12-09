#!/bin/bash
# Script to remotely execute the autofill fix on EC2
# Usage: ./run_fix_on_ec2.sh [EC2_IP] [SSH_KEY_PATH]

set -e

# Configuration - Update these if needed
EC2_IP="${1:-}"
SSH_KEY="${2:-}"
SSH_USER="ubuntu"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "🚀 Remote Autofill Fix for EC2"
echo "=========================================="
echo ""

# Check if IP and key are provided
if [ -z "$EC2_IP" ]; then
    echo -e "${YELLOW}⚠️  EC2 IP not provided${NC}"
    echo ""
    echo "Usage: $0 <EC2_IP> [SSH_KEY_PATH]"
    echo ""
    echo "Example:"
    echo "  $0 54.123.45.67"
    echo "  $0 54.123.45.67 ~/.ssh/my-key.pem"
    echo ""
    read -p "Enter EC2 IP address: " EC2_IP
    if [ -z "$EC2_IP" ]; then
        echo -e "${RED}❌ EC2 IP is required${NC}"
        exit 1
    fi
fi

# Determine SSH command
if [ -n "$SSH_KEY" ] && [ -f "$SSH_KEY" ]; then
    SSH_CMD="ssh -i $SSH_KEY $SSH_USER@$EC2_IP"
    SCP_CMD="scp -i $SSH_KEY"
elif [ -f ~/.ssh/id_rsa ]; then
    SSH_CMD="ssh $SSH_USER@$EC2_IP"
    SCP_CMD="scp"
else
    echo -e "${YELLOW}⚠️  No SSH key found. Trying password authentication...${NC}"
    SSH_CMD="ssh $SSH_USER@$EC2_IP"
    SCP_CMD="scp"
fi

echo "📡 Connecting to EC2: $EC2_IP"
echo ""

# Test connection
echo "1️⃣  Testing SSH connection..."
if $SSH_CMD "echo 'Connection successful'" 2>/dev/null; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ Failed to connect to EC2${NC}"
    echo ""
    echo "Please check:"
    echo "  - EC2 IP address is correct"
    echo "  - SSH key has correct permissions (chmod 400)"
    echo "  - Security group allows SSH (port 22)"
    echo "  - EC2 instance is running"
    exit 1
fi
echo ""

# Upload and execute fix script
echo "2️⃣  Uploading fix script..."
$SCP_CMD fix_autofill_complete.sh $SSH_USER@$EC2_IP:/tmp/ 2>/dev/null || {
    echo -e "${YELLOW}⚠️  Could not upload script, will execute commands directly${NC}"
    UPLOAD_FAILED=1
}
echo ""

# Execute the fix
echo "3️⃣  Executing fix on EC2..."
echo "----------------------------------------"
echo ""

if [ "$UPLOAD_FAILED" != "1" ]; then
    # If upload succeeded, execute the script
    $SSH_CMD "bash /tmp/fix_autofill_complete.sh"
else
    # Execute commands directly
    $SSH_CMD << 'REMOTE_SCRIPT'
        set -e
        echo "🔍 Starting autofill fix..."
        
        # Navigate to project directory
        cd /home/ubuntu/company-questionnaire 2>/dev/null || {
            echo "📥 Cloning repository..."
            cd /home/ubuntu
            git clone https://github.com/avenidalegal2025/CompanyFormationQuestionnaire.git company-questionnaire
        }
        
        cd /home/ubuntu/company-questionnaire
        
        # Pull latest code
        echo "📥 Updating code..."
        git pull origin main
        
        # Run the fix script
        echo "🔧 Running fix script..."
        bash fix_autofill_complete.sh
REMOTE_SCRIPT
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Fix execution completed!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Monitor logs: ssh $SSH_USER@$EC2_IP 'sudo journalctl -u autofill-watcher -f'"
echo "2. Check service status: ssh $SSH_USER@$EC2_IP 'sudo systemctl status autofill-watcher'"
echo "3. Verify disk space: ssh $SSH_USER@$EC2_IP 'df -h'"
echo ""

