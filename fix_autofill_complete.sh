#!/bin/bash
# Complete fix for autofill issues - Investigate, Fix, Verify
# Run this on EC2: bash fix_autofill_complete.sh

set -e  # Exit on error

echo "=========================================="
echo "🔍 INVESTIGATING AUTOFILL ISSUES"
echo "=========================================="
echo ""

# Step 1: Check disk space
echo "1️⃣  Checking disk space..."
echo "----------------------------------------"
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
echo "Disk usage: ${DISK_USAGE}%"
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "❌ CRITICAL: Disk is ${DISK_USAGE}% full - need to clean up"
    NEEDS_CLEANUP=1
else
    echo "✅ Disk space OK"
    NEEDS_CLEANUP=0
fi
echo ""

# Step 2: Check if service is running
echo "2️⃣  Checking autofill-watcher service..."
echo "----------------------------------------"
if systemctl is-active --quiet autofill-watcher; then
    echo "✅ Service is RUNNING"
    SERVICE_RUNNING=1
else
    echo "❌ Service is NOT RUNNING"
    SERVICE_RUNNING=0
fi
echo ""

# Step 3: Check environment variables
echo "3️⃣  Checking environment variables..."
echo "----------------------------------------"
if [ -f "/home/ubuntu/.airtable_env" ]; then
    source /home/ubuntu/.airtable_env
    if [ -n "$AIRTABLE_API_KEY" ] && [ -n "$AIRTABLE_BASE_ID" ]; then
        echo "✅ Environment variables are set"
        ENV_OK=1
    else
        echo "❌ Environment variables are missing"
        ENV_OK=0
    fi
else
    echo "❌ .airtable_env file not found"
    ENV_OK=0
fi
echo ""

# Step 4: Check if code is up to date
echo "4️⃣  Checking if code is up to date..."
echo "----------------------------------------"
cd /home/ubuntu/company-questionnaire 2>/dev/null || {
    echo "❌ Directory /home/ubuntu/company-questionnaire not found"
    echo "   Cloning repository..."
    cd /home/ubuntu
    git clone https://github.com/avenidalegal2025/CompanyFormationQuestionnaire.git company-questionnaire || {
        echo "❌ Failed to clone repository"
        exit 1
    }
}

cd /home/ubuntu/company-questionnaire
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ Code is up to date"
    CODE_UPDATED=1
else
    echo "⚠️  Code needs update (local: ${LOCAL:0:7}, remote: ${REMOTE:0:7})"
    CODE_UPDATED=0
fi
echo ""

echo "=========================================="
echo "🔧 FIXING ISSUES"
echo "=========================================="
echo ""

# Fix 1: Clean up disk space
if [ "$NEEDS_CLEANUP" -eq 1 ]; then
    echo "🧹 Cleaning up disk space..."
    echo "----------------------------------------"
    
    # Clean old screenshots (older than 7 days)
    SCREENSHOTS_DELETED=$(find /home/ubuntu -name "*.png" -type f -mtime +7 -delete -print 2>/dev/null | wc -l)
    echo "   Deleted ${SCREENSHOTS_DELETED} old screenshot files"
    
    # Clean old log files (older than 7 days)
    LOGS_DELETED=$(find /home/ubuntu -name "*.log" -type f -mtime +7 -delete -print 2>/dev/null | wc -l)
    echo "   Deleted ${LOGS_DELETED} old log files"
    
    # Clean old JSON files (older than 7 days)
    JSON_DELETED=$(find /home/ubuntu -name "record_*.json*" -type f -mtime +7 -delete -print 2>/dev/null | wc -l)
    echo "   Deleted ${JSON_DELETED} old JSON record files"
    
    # Clean systemd journal (keep last 3 days)
    if command -v journalctl &> /dev/null; then
        sudo journalctl --vacuum-time=3d > /dev/null 2>&1
        echo "   Cleaned systemd journal (kept last 3 days)"
    fi
    
    # Clean APT cache
    sudo apt-get clean > /dev/null 2>&1
    sudo apt-get autoremove -y > /dev/null 2>&1
    echo "   Cleaned APT cache"
    
    # Clean Firefox cache and temp files
    rm -rf /home/ubuntu/.mozilla/firefox/*/Cache* 2>/dev/null
    rm -rf /tmp/* 2>/dev/null
    echo "   Cleaned Firefox cache and temp files"
    
    # Check disk space again
    NEW_DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
    echo "   New disk usage: ${NEW_DISK_USAGE}%"
    echo ""
fi

# Fix 2: Update code
if [ "$CODE_UPDATED" -eq 0 ]; then
    echo "📥 Updating code..."
    echo "----------------------------------------"
    cd /home/ubuntu/company-questionnaire
    git pull origin main
    echo "✅ Code updated"
    echo ""
fi

# Fix 3: Install/update Python dependencies
echo "📦 Checking Python dependencies..."
echo "----------------------------------------"
if ! python3 -c "import pyairtable" 2>/dev/null; then
    echo "   Installing pyairtable..."
    pip3 install --user pyairtable > /dev/null 2>&1
fi
if ! python3 -c "import selenium" 2>/dev/null; then
    echo "   Installing selenium..."
    pip3 install --user selenium > /dev/null 2>&1
fi
echo "✅ Python dependencies OK"
echo ""

# Fix 4: Ensure service file exists
echo "📋 Checking service configuration..."
echo "----------------------------------------"
if [ ! -f "/etc/systemd/system/autofill-watcher.service" ]; then
    echo "   Creating service file..."
    sudo tee /etc/systemd/system/autofill-watcher.service > /dev/null <<EOF
[Unit]
Description=Sunbiz Autofill Watcher
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/company-questionnaire
Environment="DISPLAY=:1"
EnvironmentFile=/home/ubuntu/.airtable_env
ExecStart=/usr/bin/python3 /home/ubuntu/company-questionnaire/autofill_watcher.py
Restart=no

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    echo "✅ Service file created"
else
    echo "✅ Service file exists"
fi
echo ""

# Fix 5: Start/restart service
if [ "$SERVICE_RUNNING" -eq 0 ] || [ "$CODE_UPDATED" -eq 0 ]; then
    echo "🔄 Starting/restarting service..."
    echo "----------------------------------------"
    sudo systemctl daemon-reload
    sudo systemctl enable autofill-watcher
    sudo systemctl restart autofill-watcher
    sleep 2
    if systemctl is-active --quiet autofill-watcher; then
        echo "✅ Service started successfully"
    else
        echo "❌ Service failed to start - check logs:"
        echo "   sudo journalctl -u autofill-watcher -n 20"
    fi
    echo ""
fi

echo "=========================================="
echo "✅ VERIFYING FIXES"
echo "=========================================="
echo ""

# Verify 1: Disk space
echo "1️⃣  Verifying disk space..."
echo "----------------------------------------"
FINAL_DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$FINAL_DISK_USAGE" -lt 90 ]; then
    echo "✅ Disk space OK (${FINAL_DISK_USAGE}% used)"
else
    echo "⚠️  Disk still high (${FINAL_DISK_USAGE}% used) - may need more cleanup"
fi
echo ""

# Verify 2: Service status
echo "2️⃣  Verifying service status..."
echo "----------------------------------------"
if systemctl is-active --quiet autofill-watcher; then
    echo "✅ Service is RUNNING"
    systemctl status autofill-watcher --no-pager -l | head -5
else
    echo "❌ Service is NOT RUNNING"
    echo "   Check logs: sudo journalctl -u autofill-watcher -n 20"
fi
echo ""

# Verify 3: Test Airtable connection
echo "3️⃣  Testing Airtable connection..."
echo "----------------------------------------"
cd /home/ubuntu/company-questionnaire
if [ -f "check_autofill_record.py" ] && [ "$ENV_OK" -eq 1 ]; then
    echo "   Testing connection with 'OCEANIS LLC'..."
    python3 check_autofill_record.py "OCEANIS LLC" 2>&1 | head -20
else
    echo "⚠️  Cannot test Airtable connection (script or env vars missing)"
fi
echo ""

# Verify 4: Check recent logs
echo "4️⃣  Checking recent watcher logs..."
echo "----------------------------------------"
echo "Last 10 lines:"
sudo journalctl -u autofill-watcher -n 10 --no-pager 2>/dev/null || echo "   No logs available"
echo ""

echo "=========================================="
echo "📋 SUMMARY"
echo "=========================================="
echo ""
echo "Disk Space: ${FINAL_DISK_USAGE}% used"
if systemctl is-active --quiet autofill-watcher; then
    echo "Service: ✅ RUNNING"
else
    echo "Service: ❌ NOT RUNNING"
fi
if [ "$ENV_OK" -eq 1 ]; then
    echo "Environment: ✅ CONFIGURED"
else
    echo "Environment: ❌ MISSING"
fi
echo ""
echo "Next steps:"
echo "1. Monitor logs: sudo journalctl -u autofill-watcher -f"
echo "2. Check Airtable: Ensure 'OCEANIS LLC' has Autofill = 'Yes'"
echo "3. Wait 30 seconds for watcher to poll Airtable"
echo ""

