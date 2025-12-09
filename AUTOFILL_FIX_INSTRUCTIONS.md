# Autofill Fix Instructions

## Problem
The autofill watcher is not processing "OCEANIS LLC" (or other records) even when `Autofill = 'Yes'` is set in Airtable.

## Root Cause
The EC2 instance ran out of disk space (`OSError: [Errno 28] No space left on device`), preventing the autofill script from running.

## Solution

### Quick Fix (Run on EC2)

1. **SSH into EC2:**
```bash
ssh ubuntu@<your-ec2-ip>
```

2. **Run the complete fix script:**
```bash
cd /home/ubuntu/company-questionnaire
git pull origin main
bash fix_autofill_complete.sh
```

This script will:
- ✅ Check disk space and clean up old files automatically
- ✅ Verify and update code from GitHub
- ✅ Check and install Python dependencies
- ✅ Verify service configuration
- ✅ Start/restart the autofill-watcher service
- ✅ Test Airtable connection
- ✅ Show summary of fixes

### Manual Fix (If script doesn't work)

1. **Check disk space:**
```bash
df -h
```

2. **Clean up old files:**
```bash
# Remove old screenshots (older than 7 days)
find /home/ubuntu -name "*.png" -type f -mtime +7 -delete

# Remove old logs (older than 7 days)
find /home/ubuntu -name "*.log" -type f -mtime +7 -delete

# Remove old JSON files (older than 7 days)
find /home/ubuntu -name "record_*.json*" -type f -mtime +7 -delete

# Clean systemd journal (keep last 3 days)
sudo journalctl --vacuum-time=3d

# Clean APT cache
sudo apt-get clean
sudo apt-get autoremove -y

# Clean temp files
rm -rf /tmp/*
```

3. **Update code:**
```bash
cd /home/ubuntu/company-questionnaire
git pull origin main
```

4. **Restart service:**
```bash
sudo systemctl restart autofill-watcher
sudo systemctl status autofill-watcher
```

5. **Monitor logs:**
```bash
sudo journalctl -u autofill-watcher -f
```

## Verification

After running the fix, verify:

1. **Service is running:**
```bash
sudo systemctl status autofill-watcher
```

2. **Check logs for activity:**
```bash
sudo journalctl -u autofill-watcher -n 20
```

You should see messages like:
```
[HH:MM:SS] 👀 Watching... (no new records)
```

Or when a record is found:
```
[HH:MM:SS] 📋 Found 1 new record(s) to process!
[HH:MM:SS] 🏢 Processing: OCEANIS LLC
```

3. **Test specific record:**
```bash
cd /home/ubuntu/company-questionnaire
python3 check_autofill_record.py "OCEANIS LLC"
```

## Requirements for Airtable Records

For a record to be processed by the watcher, it must have:
- ✅ `Formation Status` = 'Pending' or 'In Progress'
- ✅ `Formation State` = 'Florida'
- ✅ `Entity Type` = 'LLC'
- ✅ `Autofill` = 'Yes'
- ✅ `Stripe Payment ID` = (not empty)

## Troubleshooting

### Service won't start
```bash
# Check logs for errors
sudo journalctl -u autofill-watcher -n 50

# Check environment variables
cat /home/ubuntu/.airtable_env

# Verify Python dependencies
python3 -c "import pyairtable; import selenium"
```

### Service is running but not processing records
1. Check that the record meets all requirements (see above)
2. Verify Airtable connection:
```bash
python3 check_autofill_record.py "OCEANIS LLC"
```
3. Check watcher logs for errors:
```bash
sudo journalctl -u autofill-watcher -f
```

### Disk space still full
```bash
# Find largest files
du -h /home/ubuntu | sort -rh | head -20

# Check specific directories
du -sh /home/ubuntu/*

# Remove large unnecessary files manually
```

## Prevention

To prevent disk space issues in the future:

1. **Set up automatic cleanup** (add to crontab):
```bash
crontab -e
# Add this line to clean old files weekly:
0 2 * * 0 find /home/ubuntu -name "*.png" -type f -mtime +7 -delete
0 2 * * 0 find /home/ubuntu -name "*.log" -type f -mtime +7 -delete
0 2 * * 0 sudo journalctl --vacuum-time=7d
```

2. **Monitor disk space:**
```bash
# Add to crontab to alert when disk > 80%
0 * * * * df -h / | awk 'NR==2 {if ($5+0 > 80) print "WARNING: Disk usage is " $5}'
```

3. **Increase EC2 instance storage** if needed (via AWS Console)

