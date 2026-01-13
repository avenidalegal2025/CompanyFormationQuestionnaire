"""
CDK Stack for Membership Registry Lambda Function
"""

from aws_cdk import (
    Stack,
    aws_lambda as _lambda,
    aws_iam as iam,
    Duration,
    CfnOutput,
)
from constructs import Construct


class MembershipRegistryStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Create IAM role for Lambda
        lambda_role = iam.Role(
            self, "MembershipRegistryLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Role for Membership Registry Lambda function",
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                )
            ]
        )

        # Add S3 permissions
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObject",
                    "s3:PutObject"
                ],
                resources=[
                    f"arn:aws:s3:::company-formation-template-llc-and-inc/*",
                    f"arn:aws:s3:::avenida-legal-documents/*"
                ]
            )
        )

        # Create Lambda Layer for python-docx
        # We'll create this layer separately, then reference it
        # For now, use inline code and we'll add the layer manually or via script
        
        # Get layer ARN from context or use default
        layer_arn = self.node.try_get_context("python-docx-layer-arn")
        
        # Create Lambda Layer reference if ARN provided
        layer = None
        if layer_arn:
            layer = _lambda.LayerVersion.from_layer_version_arn(
                self, "PythonDocxLayer",
                layer_version_arn=layer_arn
            )
        
        # Create Lambda function
        membership_registry_lambda = _lambda.Function(
            self, "MembershipRegistryLambda",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="membership-registry-lambda.lambda_handler",
            code=_lambda.Code.from_asset("../lambda-functions"),
            role=lambda_role,
            timeout=Duration.minutes(5),
            memory_size=512,
            layers=[layer] if layer else [],
            environment={
                "TEMPLATE_BUCKET": "company-formation-template-llc-and-inc",
                "OUTPUT_BUCKET": "avenida-legal-documents",
                "BUCKET_NAME": "company-formation-template-llc-and-inc"
            },
            description="Generates filled Membership Registry Word documents from templates"
        )
        
        # Create Function URL
        function_url = membership_registry_lambda.add_function_url(
            auth_type=_lambda.FunctionUrlAuthType.NONE,
            cors=_lambda.FunctionUrlCorsOptions(
                allowed_origins=["*"],
                allowed_methods=[_lambda.HttpMethod.POST],
                allowed_headers=["content-type"],
                max_age=Duration.seconds(300)
            )
        )

        # Outputs
        CfnOutput(
            self, "FunctionUrl",
            value=function_url.url,
            description="Membership Registry Lambda Function URL"
        )

        CfnOutput(
            self, "FunctionName",
            value=membership_registry_lambda.function_name,
            description="Membership Registry Lambda Function Name"
        )

        CfnOutput(
            self, "FunctionArn",
            value=membership_registry_lambda.function_arn,
            description="Membership Registry Lambda Function ARN"
        )
