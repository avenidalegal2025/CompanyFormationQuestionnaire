# Delaware Company Name Search Lambda

This implementation provides automated name search functionality for Delaware companies, based on the existing Sunbiz (Florida) implementation.

## Overview

The Delaware name search system uses web scraping to check company name availability through the Delaware Division of Corporations' public search interface at [https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx](https://icis.corp.delaware.gov/Ecorp/EntitySearch/NameSearch.aspx).

## Files

- `delaware_lambda.py` - Main Lambda function for Delaware name search
- `Dockerfile-delaware` - Docker configuration for the Lambda container
- `buildspec-delaware.yml` - AWS CodeBuild configuration for ECR deployment
- `requirements_delaware.txt` - Python dependencies
- `test_delaware.py` - Test script for local testing

## Features

### Name Normalization
- Removes generic corporate suffixes (LLC, Corp, Inc, etc.)
- Handles punctuation and case normalization
- Manages singular/plural word equivalences
- Supports Roman numeral and number word normalization

### Search Logic
- **Exact Matches**: Names that are identical after normalization
- **Soft Conflicts**: Names that differ only by numbers/roman numerals
- **Status Checking**: Considers entity status (Active, Inactive, etc.)

### Entity Type Support
- LLC (Limited Liability Company)
- CORP (Corporation)
- LP (Limited Partnership)
- LTD (Limited)

## Usage

### Local Testing
```bash
python test_delaware.py
```

### Lambda Event Format
```json
{
  "companyName": "Your Company Name",
  "entityType": "LLC"
}
```

### Response Format
```json
{
  "success": true,
  "available": true,
  "message": "Nombre disponible en Delaware",
  "method": "delaware_requests",
  "existing_entities": []
}
```

## Deployment

### Prerequisites
- AWS CLI configured
- Docker installed
- ECR repository created

### Environment Variables
- `AWS_DEFAULT_REGION` - AWS region
- `AWS_ACCOUNT_ID` - AWS account ID
- `IMAGE_REPO_NAME` - ECR repository name
- `IMAGE_TAG` - Image tag (e.g., latest)
- `LAMBDA_FUNCTION_NAME` - Lambda function name

### Deploy with CodeBuild
```bash
aws codebuild start-build --project-name your-delaware-project --buildspec-override buildspec-delaware.yml
```

### Manual Docker Build
```bash
docker build -f Dockerfile-delaware -t delaware-name-search .
docker tag delaware-name-search:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/delaware-name-search:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/delaware-name-search:latest
```

## Important Notes

### Rate Limiting
- The implementation includes random delays (2-5 seconds) between requests
- Respects Delaware's strict terms of service regarding automated access
- Uses realistic browser headers to avoid detection

### Compliance
- **IMPORTANT**: Delaware Division of Corporations strictly prohibits data mining
- The website states: "Excessive and repeated searches that may have a negative impact on our systems and customer experience are also prohibited. Use of automated tools in any form may result in the suspension of your access to utilize this service."
- This implementation is designed for legitimate business use with appropriate delays
- Consider using official APIs or authorized vendors for production applications

### Error Handling
- Graceful handling of network timeouts
- Comprehensive logging for debugging
- Fallback to "available" when search fails

## Differences from Sunbiz Implementation

1. **Target Website**: Delaware Division of Corporations instead of Sunbiz
2. **Form Structure**: Different form field names and structure
3. **Entity Types**: Different entity type mappings
4. **Response Parsing**: Adapted for Delaware's result format
5. **Rate Limiting**: More conservative delays for compliance

## Monitoring

The Lambda function includes comprehensive logging:
- Request/response details
- Search term normalization
- Match detection logic
- Error conditions

Monitor CloudWatch logs for:
- Search success/failure rates
- Response times
- Error patterns
- Rate limiting issues
