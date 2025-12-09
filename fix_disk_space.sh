#!/bin/bash
# Script to check and fix disk space issues on EC2
# Run this on EC2: bash fix_disk_space.sh

echo "=========================================="
echo "💾 Disk Space Diagnostic and Cleanup"
echo "=========================================="
echo ""

echo "1️⃣  Checking disk space..."
echo "----------------------------------------"
df -h
echo ""

echo "2️⃣  Finding large files and directories..."
echo "----------------------------------------"
echo "Top 10 largest directories in /home/ubuntu:"
du -h /home/ubuntu 2>/dev/null | sort -rh | head -10
echo ""

echo "3️⃣  Checking for old logs and temporary files..."
echo "----------------------------------------"
echo "Screenshot files:"
find /home/ubuntu -name "*.png" -type f 2>/dev/null | wc -l | xargs echo "  Found:"
find /home/ubuntu -name "*.png" -type f -mtime +7 2>/dev/null | wc -l | xargs echo "  Older than 7 days:"

echo ""
echo "Log files:"
find /home/ubuntu -name "*.log" -type f 2>/dev/null | wc -l | xargs echo "  Found:"
find /home/ubuntu -name "*.log" -type f -mtime +7 2>/dev/null | wc -l | xargs echo "  Older than 7 days:"

echo ""
echo "JSON files (old record files):"
find /home/ubuntu -name "record_*.json*" -type f 2>/dev/null | wc -l | xargs echo "  Found:"
find /home/ubuntu -name "record_*.json*" -type f -mtime +7 2>/dev/null | wc -l | xargs echo "  Older than 7 days:"

echo ""
echo "4️⃣  Checking systemd journal size..."
echo "----------------------------------------"
journalctl --disk-usage
echo ""

echo "5️⃣  Checking Docker (if installed)..."
echo "----------------------------------------"
if command -v docker &> /dev/null; then
    docker system df 2>/dev/null || echo "  Docker not running or no permission"
else
    echo "  Docker not installed"
fi
echo ""

echo "=========================================="
echo "🧹 Cleanup Options"
echo "----------------------------------------"
echo ""
echo "To clean up old files, run these commands:"
echo ""
echo "1. Remove old screenshots (older than 7 days):"
echo "   find /home/ubuntu -name '*.png' -type f -mtime +7 -delete"
echo ""
echo "2. Remove old log files (older than 7 days):"
echo "   find /home/ubuntu -name '*.log' -type f -mtime +7 -delete"
echo ""
echo "3. Remove old JSON record files (older than 7 days):"
echo "   find /home/ubuntu -name 'record_*.json*' -type f -mtime +7 -delete"
echo ""
echo "4. Clean systemd journal (keep last 3 days):"
echo "   sudo journalctl --vacuum-time=3d"
echo ""
echo "5. Clean APT cache:"
echo "   sudo apt-get clean"
echo "   sudo apt-get autoremove -y"
echo ""
echo "6. Remove old Firefox profiles/cache:"
echo "   rm -rf /home/ubuntu/.mozilla/firefox/*/Cache*"
echo "   rm -rf /tmp/*"
echo ""
echo "=========================================="
echo "⚠️  IMPORTANT: Before cleaning, check what will be deleted!"
echo "   Use 'find' commands without '-delete' first to see what files will be removed."
echo ""
