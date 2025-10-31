# Twilio Voice Calling Setup

This guide will help you set up the voice calling feature for your customers.

## Prerequisites

- Twilio Account with production credentials
- Twilio API Key created

## Step 1: Create a TwiML App

1. Go to [Twilio Console > Voice > TwiML Apps](https://console.twilio.com/us1/develop/voice/manage/twiml-apps)
2. Click **Create new TwiML App**
3. Set the following:
   - **Friendly Name**: `Avenida Legal Outbound Calls`
   - **Voice Request URL**: `https://company-formation-questionnaire.vercel.app/api/phone/outbound-twiml`
   - **HTTP Method**: `POST`
4. Click **Save**
5. Copy the **SID** (starts with `AP...`)

## Step 2: Add Environment Variables to Vercel

Add these environment variables in your Vercel project settings:

```bash
# Twilio Production Credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Get Auth Token from Twilio Console main page
TWILIO_AUTH_TOKEN=your_auth_token_here

# API Key for token generation
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=your_api_key_secret_here

# TwiML App SID (from Step 1)
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Base URL (make sure no newlines!)
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app
```

## Step 3: Verify Setup

1. Make a test payment to provision a phone number
2. Go to the client dashboard
3. Click "Realizar Llamada" button
4. Enter a phone number and click "Llamar"
5. The call should connect using your business number as caller ID

## Features

- **Outbound Calling**: Customers can make calls from their browser
- **Caller ID**: Shows the business US phone number
- **Call Timer**: Displays call duration
- **Dial Pad**: Easy number entry with visual dial pad
- **Call Controls**: Hang up, clear, backspace

## Troubleshooting

### "Failed to get access token"
- Check that `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET` are set correctly
- Verify the API Key is active in Twilio Console

### "Device error"
- Check browser console for detailed error messages
- Ensure microphone permissions are granted
- Try a different browser (Chrome/Edge recommended)

### "Call failed"
- Verify `TWILIO_TWIML_APP_SID` is set correctly
- Check that the TwiML App Voice URL is correct
- Ensure the phone number format is correct (E.164: +1234567890)

## Cost Considerations

- Outbound calls are charged per minute by Twilio
- Typical cost: $0.013/min for US calls
- International calls vary by destination
- Monitor usage in Twilio Console

## Security Notes

- Access tokens expire after 1 hour
- Only authenticated users can generate tokens
- Each user can only make calls from their assigned business number
- Tokens are generated server-side to protect API credentials

