# Delaware Name Search Integration

This integration adds Delaware company name availability checking to your Vercel application using AWS Lambda with Playwright and 2captcha.

## Features

- ✅ **Playwright Automation**: Uses headless browser for realistic interaction
- ✅ **Mobile Proxy**: ScrapeOps residential/mobile proxy for IP rotation
- ✅ **CAPTCHA Solving**: 2captcha integration for automated CAPTCHA solving
- ✅ **Name Normalization**: Advanced company name comparison logic
- ✅ **AWS Lambda**: Serverless deployment with container images
- ✅ **Vercel Integration**: Seamless integration with your existing API

## Architecture

```
Vercel App → API Route → AWS Lambda → Playwright → Delaware Website
                                    ↓
                              ScrapeOps Proxy + 2captcha
```

## Files Added

### Core Lambda Function
- `delaware_lambda_playwright.py` - Main Lambda function with Playwright automation
- `requirements_playwright.txt` - Python dependencies
- `Dockerfile-playwright` - Container image for Lambda

### Deployment
- `buildspec-delaware-playwright.yml` - AWS CodeBuild specification
- `deploy_delaware_playwright.sh` - Manual deployment script
- `.github/workflows/deploy-delaware-lambda.yml` - GitHub Actions workflow

### API Integration
- Updated `src/app/api/check-name/route.ts` - Added Delaware support

## Configuration

### Environment Variables

The Lambda function uses these hardcoded values (should be moved to environment variables in production):

```python
SCRAPEOPS_API_KEY = "b3a2e586-8c39-4115-8ffb-590ad8750116"
CAPTCHA_API_KEY = "f70e8ca44204cc56c23f32925064ee93"
```

### AWS Resources

- **Lambda Function**: `delaware-playwright-lambda`
- **ECR Repository**: `delaware-playwright-lambda`
- **IAM Role**: `lambda-delaware-playwright-role`
- **Region**: `us-west-1`

## Deployment

### Option 1: GitHub Actions (Recommended)

1. Push changes to main branch
2. GitHub Actions will automatically deploy the Lambda function
3. Ensure AWS credentials are configured in repository secrets

### Option 2: Manual Deployment

```bash
./deploy_delaware_playwright.sh
```

### Option 3: AWS CodeBuild

Use the `buildspec-delaware-playwright.yml` with AWS CodeBuild.

## API Usage

The Vercel API now supports Delaware:

```typescript
POST /api/check-name
{
  "companyName": "Google LLC",
  "entityType": "LLC",
  "formationState": "Delaware"
}
```

Response:
```json
{
  "success": true,
  "available": false,
  "message": "Nombre no disponible en Delaware, intenta otro.",
  "method": "delaware_playwright",
  "existing_entities": [
    {
      "name": "GOOGLE LLC",
      "status": "ACTIVE"
    }
  ]
}
```

## Testing

### Local Testing

```bash
python delaware_lambda_playwright.py
```

### Lambda Testing

```bash
aws lambda invoke \
  --function-name delaware-playwright-lambda \
  --payload '{"companyName": "Test Company LLC", "entityType": "LLC"}' \
  response.json
```

## Performance

- **Timeout**: 5 minutes (300 seconds)
- **Memory**: 2048 MB
- **Cold Start**: ~30-60 seconds (Playwright initialization)
- **Warm Start**: ~10-30 seconds

## Cost Considerations

- **Lambda**: ~$0.0000166667 per GB-second
- **2captcha**: ~$0.001 per CAPTCHA solve
- **ScrapeOps**: Based on your proxy plan
- **ECR**: ~$0.10 per GB per month

## Monitoring

Monitor the Lambda function through:
- AWS CloudWatch Logs
- AWS Lambda Metrics
- Vercel Function Logs

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Increase Lambda timeout or memory
2. **CAPTCHA Failures**: Check 2captcha balance and API key
3. **Proxy Issues**: Verify ScrapeOps credentials and IP rotation
4. **Blocking**: Delaware may block certain IPs; proxy rotation helps

### Debug Mode

Enable debug logging by setting environment variables in Lambda:
- `DEBUG=true`
- `LOG_LEVEL=debug`

## Security

- API keys are currently hardcoded (move to environment variables)
- Proxy credentials are embedded in the code
- Consider using AWS Secrets Manager for production

## Future Improvements

1. **Environment Variables**: Move API keys to AWS Secrets Manager
2. **Caching**: Add Redis caching for repeated searches
3. **Rate Limiting**: Implement request rate limiting
4. **Monitoring**: Add CloudWatch alarms and dashboards
5. **Multi-State**: Extend to other states beyond Delaware

## Support

For issues or questions:
1. Check AWS CloudWatch logs
2. Review Vercel function logs
3. Test Lambda function directly
4. Verify proxy and CAPTCHA service status
