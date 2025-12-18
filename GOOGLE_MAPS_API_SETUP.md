# Google Maps API Setup for SS-4 Lambda

## Answers to Your Questions

### 1. Does the Lambda already have access to the Google Maps API key?

**No, the Lambda does NOT currently have access to the Google Maps API key.**

- The API key is stored in **Vercel environment variables** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)
- Lambda functions run on **AWS** and need their own environment variables
- The Lambda currently only has `BUCKET_NAME` and `OUTPUT_BUCKET` set
- **You need to add the Google Maps API key to the Lambda's environment variables**

### 2. Does Google Maps have the county service?

**Yes, Google Maps Geocoding API does return county information**, but with some caveats:

- ✅ Returns county via `administrative_area_level_2` in address components
- ⚠️ Not always returned for all addresses (especially non-US or ambiguous locations)
- ✅ Works well for most US cities
- ⚠️ May require fallback to local mapping for edge cases

## Setup Instructions

### Option 1: Using the Updated Deploy Script (Recommended)

The `deploy_ss4_lambda.sh` script has been updated to automatically include the Google Maps API key:

```bash
# Set the API key as an environment variable before deploying
export GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"

# Or use the Vercel variable name
export NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"

# Run the deploy script
./deploy_ss4_lambda.sh
```

The script will:
- Automatically detect the API key from environment variables
- Add it to Lambda's environment variables during deployment
- Update existing Lambda functions with the new environment variable

### Option 2: Manual Setup via AWS Console

1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda/)
2. Select your Lambda function: `ss4-lambda-s3-complete`
3. Go to **Configuration** → **Environment variables**
4. Click **Edit**
5. Add a new environment variable:
   - **Key**: `GOOGLE_MAPS_API_KEY`
   - **Value**: Your Google Maps API key (from Vercel)
6. Click **Save**

### Option 3: Manual Setup via AWS CLI

```bash
# Update the Lambda function's environment variables
aws lambda update-function-configuration \
  --function-name ss4-lambda-s3-complete \
  --region us-west-1 \
  --environment "Variables={
    BUCKET_NAME=ss4-template-bucket-043206426879,
    OUTPUT_BUCKET=avenida-legal-documents,
    GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
  }"
```

## How It Works

The Lambda function now has a **two-tier approach** for county lookup:

1. **Local Mapping (Fast)**: 
   - Checks an internal dictionary with 500+ common US cities
   - No API calls, instant results
   - Covers major cities in FL, NY, CA, TX, IL, AZ, etc.

2. **Google Maps API Fallback**:
   - Only called if city is not in local mapping
   - Uses Geocoding API to get county from `administrative_area_level_2`
   - Handles any US city/state combination
   - Falls back to city name if API fails

3. **Final Fallback**:
   - Returns city name if both methods fail
   - Ensures the function always returns a value

## Testing

After setting up the API key, test with a city not in the local mapping:

```bash
# The Lambda will log:
# ===> City 'SomeCity' in state 'TX' not in local mapping, querying Google Maps API...
# ===> ✅ Found county 'SomeCounty' for 'SomeCity, TX' via Google Maps API
```

## Cost Considerations

- **Local mapping**: Free (no API calls)
- **Google Maps API**: 
  - $5 per 1,000 requests (Geocoding API)
  - Only called for cities not in local mapping
  - Most common cities are in the local mapping, so API usage will be minimal

## Security Notes

- The API key is stored in Lambda environment variables (encrypted at rest by AWS)
- Never commit the API key to version control
- Consider using AWS Secrets Manager for production (future enhancement)

## Troubleshooting

If the Google Maps API is not working:

1. **Check API key is set**:
   ```bash
   aws lambda get-function-configuration \
     --function-name ss4-lambda-s3-complete \
     --region us-west-1 \
     --query 'Environment.Variables.GOOGLE_MAPS_API_KEY'
   ```

2. **Check API key permissions**:
   - Ensure the API key has "Geocoding API" enabled in Google Cloud Console
   - Check if there are any API quotas or restrictions

3. **Check Lambda logs**:
   ```bash
   aws logs tail /aws/lambda/ss4-lambda-s3-complete --follow
   ```

4. **Verify API key works**:
   ```bash
   curl "https://maps.googleapis.com/maps/api/geocode/json?address=Miami,FL,USA&key=YOUR_API_KEY"
   ```

## Next Steps

1. ✅ Get your Google Maps API key from Vercel environment variables
2. ✅ Add it to Lambda using one of the methods above
3. ✅ Test with a few cities to verify it's working
4. ✅ Monitor Lambda logs to see API usage patterns

