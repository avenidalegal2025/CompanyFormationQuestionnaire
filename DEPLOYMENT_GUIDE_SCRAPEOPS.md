# Delaware Lambda Deployment Guide - ScrapeOps Version

## 🚀 **Quick Deployment**

### **Prerequisites**
- AWS CLI configured with appropriate permissions
- Docker installed and running
- Python 3.9+ installed

### **Deploy in One Command**
```bash
./deploy_scrapeops.sh
```

## 📋 **Manual Deployment Steps**

### **Step 1: Configure AWS**
```bash
# Set your AWS region (optional, defaults to us-east-1)
export AWS_DEFAULT_REGION=us-east-1

# Verify AWS credentials
aws sts get-caller-identity
```

### **Step 2: Deploy Lambda Function**
```bash
# Run the deployment script
./deploy_scrapeops.sh
```

### **Step 3: Test Deployment**
```bash
# Test the deployed function
python test_deployed_lambda.py
```

## 🔧 **Configuration Options**

### **Environment Variables**
You can modify these in `deploy_scrapeops.sh`:

```bash
AWS_REGION="us-east-1"                    # Your preferred AWS region
IMAGE_REPO_NAME="delaware-scrapeops-lambda"  # ECR repository name
LAMBDA_FUNCTION_NAME="delaware-name-search-scrapeops"  # Lambda function name
```

### **Lambda Function Settings**
- **Memory**: 2048 MB (adjustable)
- **Timeout**: 300 seconds (5 minutes)
- **Runtime**: Python 3.9 (Container)

## 🧪 **Testing**

### **Local Testing**
```bash
# Test locally before deployment
python delaware_lambda_scrapeops.py
```

### **Deployed Testing**
```bash
# Test the deployed function
python test_deployed_lambda.py
```

### **Manual Testing via AWS CLI**
```bash
aws lambda invoke \
  --function-name delaware-name-search-scrapeops \
  --payload '{"companyName": "Test Company LLC", "entityType": "LLC"}' \
  response.json

cat response.json | jq '.'
```

## 📊 **Monitoring**

### **CloudWatch Logs**
```bash
# View logs
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/delaware-name-search-scrapeops

# Stream logs
aws logs tail /aws/lambda/delaware-name-search-scrapeops --follow
```

### **Lambda Metrics**
- Go to AWS Console → Lambda → Functions → delaware-name-search-scrapeops
- View CloudWatch metrics for invocations, errors, duration

## 🔄 **Updates**

### **Update Function Code**
```bash
# Re-run deployment script
./deploy_scrapeops.sh
```

### **Update Configuration**
```bash
# Update memory
aws lambda update-function-configuration \
  --function-name delaware-name-search-scrapeops \
  --memory-size 4096

# Update timeout
aws lambda update-function-configuration \
  --function-name delaware-name-search-scrapeops \
  --timeout 600
```

## 🛠️ **Troubleshooting**

### **Common Issues**

#### **1. Permission Denied**
```bash
# Ensure AWS credentials are configured
aws configure list

# Check IAM permissions
aws iam get-user
```

#### **2. ECR Repository Not Found**
```bash
# Create ECR repository manually
aws ecr create-repository --repository-name delaware-scrapeops-lambda
```

#### **3. Lambda Function Not Found**
```bash
# Check if function exists
aws lambda list-functions --query 'Functions[?FunctionName==`delaware-name-search-scrapeops`]'
```

#### **4. Docker Build Fails**
```bash
# Check Docker is running
docker --version

# Test Docker build locally
docker build -t test-delaware -f Dockerfile-scrapeops .
```

### **Debug Commands**

#### **Check Function Status**
```bash
aws lambda get-function --function-name delaware-name-search-scrapeops
```

#### **View Function Logs**
```bash
aws logs describe-log-streams --log-group-name /aws/lambda/delaware-name-search-scrapeops
```

#### **Test Function Invocation**
```bash
aws lambda invoke \
  --function-name delaware-name-search-scrapeops \
  --payload '{"companyName": "Test", "entityType": "LLC"}' \
  --log-type Tail \
  response.json
```

## 💰 **Cost Optimization**

### **ScrapeOps Costs**
- **Pay per successful request**: ~$0.001-0.01 per search
- **Free tier**: 1,000 free API credits
- **No bandwidth charges**: Only pay for successful requests

### **AWS Costs**
- **Lambda**: Pay per invocation and duration
- **ECR**: Pay for image storage
- **CloudWatch**: Pay for logs and metrics

### **Cost Estimation**
- **100 searches/day**: ~$0.10-1.00 (ScrapeOps) + ~$0.01 (AWS)
- **1,000 searches/day**: ~$1.00-10.00 (ScrapeOps) + ~$0.10 (AWS)

## 🔒 **Security**

### **IAM Permissions**
The deployment script creates a minimal IAM role with:
- `AWSLambdaBasicExecutionRole`: For CloudWatch logs
- `AmazonEC2ContainerRegistryReadOnly`: For ECR access

### **ScrapeOps Security**
- API key is embedded in the code (consider using AWS Secrets Manager for production)
- All requests go through ScrapeOps proxy network
- No direct access to target websites

## 📈 **Scaling**

### **Concurrent Executions**
- Default: 1000 concurrent executions
- Can be increased via AWS Console or CLI

### **Performance Optimization**
- Increase memory for faster execution
- Use provisioned concurrency for consistent performance
- Implement connection pooling for ScrapeOps

## 🎯 **Production Checklist**

- [ ] Deploy to production AWS account
- [ ] Set up monitoring and alerting
- [ ] Configure API Gateway if needed
- [ ] Set up CI/CD pipeline
- [ ] Implement error handling and retries
- [ ] Set up cost monitoring
- [ ] Configure backup and disaster recovery
- [ ] Test with production data
- [ ] Set up logging and analytics

---

## 🆘 **Support**

### **ScrapeOps Support**
- Documentation: https://scrapeops.io/docs/
- Support: Available through ScrapeOps dashboard

### **AWS Support**
- AWS Documentation: https://docs.aws.amazon.com/lambda/
- AWS Support: Available through AWS Console

### **This Project**
- Check logs for detailed error messages
- Test locally before deploying
- Verify all dependencies are installed
