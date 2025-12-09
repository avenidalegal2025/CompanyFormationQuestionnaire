# Autofill Watcher Troubleshooting Guide

## Problem
When you change `Autofill: Yes` in Airtable, the Sunbiz autofill process is not triggered on the EC2 instance.

## Solution
The watcher has been updated to:
1. Check for records with `Autofill = 'Yes'` that are either `Pending` or `In Progress`
2. Allow reprocessing if `Autofill` is manually changed back to `Yes`
3. Remove the in-memory tracking that prevented reprocessing

## How to Check if Watcher is Running on EC2

### 1. SSH into the EC2 instance
```bash
ssh ubuntu@<your-ec2-ip>
```

### 2. Check if the service is running
```bash
sudo systemctl status autofill-watcher
```

### 3. Check the service logs
```bash
sudo journalctl -u autofill-watcher -f
```

### 4. If the service is not running, start it
```bash
sudo systemctl start autofill-watcher
sudo systemctl enable autofill-watcher  # Enable on boot
```

### 5. If the service is running but not processing, restart it
```bash
sudo systemctl restart autofill-watcher
```

## How to Manually Trigger Autofill

### Option 1: Set Autofill = 'Yes' in Airtable
1. Open the Airtable record
2. Set `Autofill` field to `Yes`
3. Ensure `Formation Status` is either `Pending` or `In Progress`
4. The watcher will pick it up within 30 seconds (poll interval)

### Option 2: Run the script manually on EC2
```bash
cd /home/ubuntu/company-questionnaire
python3 llc_filing_airtable.py <record_id>
```

Replace `<record_id>` with the Airtable record ID (e.g., `recXXXXXXXXXXXXXX`)

## Verify Watcher is Working

1. Check the logs to see if it's polling:
```bash
sudo journalctl -u autofill-watcher -n 50
```

You should see messages like:
```
[HH:MM:SS] 👀 Watching... (no new records)
```

2. When a record is found, you'll see:
```
[HH:MM:SS] 📋 Found 1 new record(s) to process!
[HH:MM:SS] 🏢 Processing: Company Name
```

## Common Issues

### Issue: Service not found
**Solution**: The service file might not be installed. Install it:
```bash
sudo cp /home/ubuntu/company-questionnaire/autofill-watcher.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable autofill-watcher
sudo systemctl start autofill-watcher
```

### Issue: Environment variables not set
**Solution**: Check if `.airtable_env` file exists:
```bash
cat /home/ubuntu/.airtable_env
```

It should contain:
```
AIRTABLE_API_KEY=your_key_here
AIRTABLE_BASE_ID=your_base_id_here
AIRTABLE_TABLE_NAME=Formations
```

### Issue: Python dependencies missing
**Solution**: Install required packages:
```bash
pip3 install pyairtable
```

### Issue: Display not set
**Solution**: The watcher needs a display for headless browser. Check:
```bash
echo $DISPLAY
```

Should show `:1`. If not, the service file should set it automatically.

## Testing

To test if the watcher can see records:
1. Create a test record in Airtable with:
   - `Formation Status` = `Pending`
   - `Formation State` = `Florida`
   - `Entity Type` = `LLC`
   - `Autofill` = `Yes`
   - `Stripe Payment ID` = (any value)

2. Watch the logs:
```bash
sudo journalctl -u autofill-watcher -f
```

3. Within 30 seconds, you should see the record being processed.

