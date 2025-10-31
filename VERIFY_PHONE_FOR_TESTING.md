# How to Verify a Phone Number for Testing in Twilio

If you're using a **trial account**, Twilio only allows calls to **verified phone numbers**. Here's how to verify a number:

## Method 1: Verify via Twilio Console (Easiest)

1. Go to https://console.twilio.com/us1/develop/phone-numbers/manage/verified
2. Click **Add a new number** (red + button)
3. Select your country code (e.g., +52 for Mexico)
4. Enter the phone number you want to verify
5. Choose verification method:
   - **SMS** (recommended) - You'll receive a text with a code
   - **Call** - You'll receive an automated call with a code
6. Enter the verification code you received
7. Click **Submit**

✅ The number is now verified and you can call it from your Twilio account!

## Method 2: Verify via API (Advanced)

```bash
curl -X POST https://verify.twilio.com/v2/Services/YOUR_VERIFY_SERVICE_SID/Verifications \
  --data-urlencode "To=+525589185576" \
  --data-urlencode "Channel=sms" \
  -u YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN
```

## Quick Test Numbers

Once verified, you can test with:
- Your own mobile number (verify it first)
- Any number you have access to and can verify

## Important Notes

### Trial Account Limitations:
- ❌ Can only call **verified numbers**
- ❌ Shows "trial account" message on calls
- ❌ Limited to verified caller IDs

### Production Account Benefits:
- ✅ Call **any number** (no verification needed)
- ✅ No trial messages
- ✅ Full features
- 💰 ~$0.013/min for US calls

## Upgrade to Production

To remove all limitations:

1. Go to https://console.twilio.com/
2. Click **Upgrade** in the top banner
3. Add a payment method
4. Add at least $20 to your balance
5. You're done! No more verification needed.

## Testing Your Setup

After verifying a number (or upgrading):

1. Go to your client dashboard
2. Click **"Realizar Llamada Saliente"**
3. Enter the verified phone number (e.g., +525589185576)
4. Click **"Llamar"**
5. Answer the call on your phone
6. You should hear your voice through the browser!

## Common Issues

**"Unverified number" error**
- Verify the number first using Method 1 above
- Or upgrade to production account

**"Trial account" message**
- This is normal for trial accounts
- Upgrade to remove this message

**No audio/connection issues**
- Allow microphone permissions in browser
- Use Chrome or Edge (best compatibility)
- Check internet connection

