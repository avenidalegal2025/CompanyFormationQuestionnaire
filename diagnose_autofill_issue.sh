#!/bin/bash
# Script to diagnose why autofill is not triggering for OCEANIS LLC
# Run this on EC2: bash diagnose_autofill_issue.sh

echo "=========================================="
echo "🔍 Autofill Diagnostic Script"
echo "=========================================="
echo ""

# Check if running on EC2
if [ ! -f "/etc/system-release" ]; then
    echo "⚠️  This script should be run on EC2"
    echo ""
fi

echo "1️⃣  Checking if autofill-watcher service is running..."
echo "----------------------------------------"
if systemctl is-active --quiet autofill-watcher; then
    echo "✅ Service is RUNNING"
    systemctl status autofill-watcher --no-pager -l | head -10
else
    echo "❌ Service is NOT RUNNING"
    echo ""
    echo "💡 To start it:"
    echo "   sudo systemctl start autofill-watcher"
    echo "   sudo systemctl enable autofill-watcher"
fi
echo ""

echo "2️⃣  Checking recent watcher logs..."
echo "----------------------------------------"
echo "Last 20 lines of watcher logs:"
sudo journalctl -u autofill-watcher -n 20 --no-pager
echo ""

echo "3️⃣  Checking environment variables..."
echo "----------------------------------------"
if [ -f "/home/ubuntu/.airtable_env" ]; then
    echo "✅ Found .airtable_env file"
    source /home/ubuntu/.airtable_env
    if [ -n "$AIRTABLE_API_KEY" ]; then
        echo "✅ AIRTABLE_API_KEY is set (length: ${#AIRTABLE_API_KEY})"
    else
        echo "❌ AIRTABLE_API_KEY is NOT set"
    fi
    if [ -n "$AIRTABLE_BASE_ID" ]; then
        echo "✅ AIRTABLE_BASE_ID is set: $AIRTABLE_BASE_ID"
    else
        echo "❌ AIRTABLE_BASE_ID is NOT set"
    fi
    if [ -n "$AIRTABLE_TABLE_NAME" ]; then
        echo "✅ AIRTABLE_TABLE_NAME is set: $AIRTABLE_TABLE_NAME"
    else
        echo "⚠️  AIRTABLE_TABLE_NAME is NOT set (will use default: Formations)"
    fi
else
    echo "❌ .airtable_env file NOT FOUND"
    echo "💡 Create it with:"
    echo "   echo 'AIRTABLE_API_KEY=your_key' > /home/ubuntu/.airtable_env"
    echo "   echo 'AIRTABLE_BASE_ID=your_base_id' >> /home/ubuntu/.airtable_env"
    echo "   echo 'AIRTABLE_TABLE_NAME=Formations' >> /home/ubuntu/.airtable_env"
fi
echo ""

echo "4️⃣  Checking if Python dependencies are installed..."
echo "----------------------------------------"
if python3 -c "import pyairtable" 2>/dev/null; then
    echo "✅ pyairtable is installed"
else
    echo "❌ pyairtable is NOT installed"
    echo "💡 Install it with: pip3 install pyairtable"
fi
if python3 -c "import selenium" 2>/dev/null; then
    echo "✅ selenium is installed"
else
    echo "❌ selenium is NOT installed"
    echo "💡 Install it with: pip3 install selenium"
fi
echo ""

echo "5️⃣  Checking if autofill_watcher.py exists..."
echo "----------------------------------------"
if [ -f "/home/ubuntu/company-questionnaire/autofill_watcher.py" ]; then
    echo "✅ autofill_watcher.py exists"
    echo "   Location: /home/ubuntu/company-questionnaire/autofill_watcher.py"
else
    echo "❌ autofill_watcher.py NOT FOUND"
    echo "💡 Make sure the code is pulled from git:"
    echo "   cd /home/ubuntu/company-questionnaire && git pull origin main"
fi
echo ""

echo "6️⃣  Testing Airtable connection..."
echo "----------------------------------------"
if [ -f "/home/ubuntu/company-questionnaire/check_autofill_record.py" ]; then
    echo "Running diagnostic script for 'OCEANIS LLC'..."
    cd /home/ubuntu/company-questionnaire
    python3 check_autofill_record.py "OCEANIS LLC" 2>&1
else
    echo "⚠️  check_autofill_record.py not found"
    echo "💡 Pull latest code: git pull origin main"
fi
echo ""

echo "7️⃣  Manual test - Check watcher formula directly..."
echo "----------------------------------------"
echo "You can manually test the watcher by running:"
echo "   cd /home/ubuntu/company-questionnaire"
echo "   python3 -c \""
echo "from autofill_watcher import get_pending_records"
echo "records = get_pending_records()"
echo "print(f'Found {len(records)} records')"
echo "for r in records:"
echo "    print(f\"  - {r['fields'].get('Company Name')}\")"
echo "\""
echo ""

echo "=========================================="
echo "📋 Summary"
echo "=========================================="
echo "If the service is running and logs show 'no new records',"
echo "check the diagnostic output above to see which condition is failing."
echo ""
echo "Common issues:"
echo "  - Service not running → sudo systemctl start autofill-watcher"
echo "  - Missing env vars → Check /home/ubuntu/.airtable_env"
echo "  - Record doesn't meet conditions → Check Airtable fields"
echo "  - Python dependencies missing → pip3 install pyairtable selenium"
echo ""

