# Execute Autofill Fix Now

## Quick Fix (Choose One Method)

### Method 1: Remote Execution (From Your Local Machine)

If you have SSH access to EC2, run this from your local machine:

```bash
# Make sure you're in the project directory
cd /Users/rodolfo/company-questionnaire

# Run the remote fix script
./run_fix_on_ec2.sh <EC2_IP_ADDRESS> [SSH_KEY_PATH]
```

Example:
```bash
./run_fix_on_ec2.sh 54.123.45.67
# Or with SSH key:
./run_fix_on_ec2.sh 54.123.45.67 ~/.ssh/ec2-key.pem
```

### Method 2: Direct SSH (Manual)

1. **SSH into EC2:**
```bash
ssh ubuntu@<EC2_IP>
# Or with key:
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2_IP>
```

2. **Run the fix script:**
```bash
cd /home/ubuntu/company-questionnaire
git pull origin main
bash fix_autofill_complete.sh
```

### Method 3: One-Line Command

If you have SSH access, you can run everything in one command:

```bash
ssh ubuntu@<EC2_IP> "cd /home/ubuntu/company-questionnaire && git pull origin main && bash fix_autofill_complete.sh"
```

## What the Script Does

The `fix_autofill_complete.sh` script will:

1. ✅ **Investigate:**
   - Check disk space (and clean if needed)
   - Check if service is running
   - Check environment variables
   - Check if code is up to date

2. ✅ **Fix:**
   - Clean old files (screenshots, logs, JSON)
   - Clean systemd journal
   - Update code from GitHub
   - Install Python dependencies
   - Configure and restart service

3. ✅ **Verify:**
   - Confirm disk space is sufficient
   - Confirm service is running
   - Test Airtable connection
   - Show recent logs

## After Running the Fix

1. **Monitor the watcher:**
```bash
ssh ubuntu@<EC2_IP> "sudo journalctl -u autofill-watcher -f"
```

2. **Check if it's processing records:**
   - You should see messages every 30 seconds
   - When a record is found, you'll see: `📋 Found 1 new record(s) to process!`

3. **Verify "OCEANIS LLC" is being processed:**
   - The watcher should pick it up within 30 seconds if all conditions are met

## Troubleshooting

If the script fails:

1. **Check SSH access:**
```bash
ssh ubuntu@<EC2_IP> "echo 'Connection test'"
```

2. **Check if the directory exists:**
```bash
ssh ubuntu@<EC2_IP> "ls -la /home/ubuntu/company-questionnaire"
```

3. **Run diagnostic first:**
```bash
ssh ubuntu@<EC2_IP> "cd /home/ubuntu/company-questionnaire && bash diagnose_autofill_issue.sh"
```

## Need EC2 IP Address?

If you don't know the EC2 IP:

1. Go to AWS Console → EC2 → Instances
2. Find your instance
3. Copy the "Public IPv4 address" or "Public IPv4 DNS"

