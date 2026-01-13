"""
CDK Stack for Organizational Resolution Lambda Function
"""

from aws_cdk import (
    Stack,
    aws_lambda as _lambda,
    aws_iam as iam,
    Duration,
    CfnOutput,
)
from constructs import Construct


class OrganizationalResolutionStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Create IAM role for Lambda
        lambda_role = iam.Role(
            self, "OrganizationalResolutionLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Role for Organizational Resolution Lambda function",
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

        # Get layer ARN from context (reuse python-docx layer from membership registry)
        layer_arn = self.node.try_get_context("python-docx-layer-arn")
        
        # Create Lambda Layer reference if ARN provided
        layer = None
        if layer_arn:
            layer = _lambda.LayerVersion.from_layer_version_arn(
                self, "PythonDocxLayer",
                layer_version_arn=layer_arn
            )
        
        # Create Lambda function
        org_resolution_lambda = _lambda.Function(
            self, "OrganizationalResolutionLambda",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="organizational-resolution-lambda.lambda_handler",
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
            description="Generates filled Organizational Resolution Word documents from templates"
        )
        
        # Create Function URL
        function_url = org_resolution_lambda.add_function_url(
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
            description="Organizational Resolution Lambda Function URL"
        )

        CfnOutput(
            self, "FunctionName",
            value=org_resolution_lambda.function_name,
            description="Organizational Resolution Lambda Function Name"
        )

        CfnOutput(
            self, "FunctionArn",
            value=org_resolution_lambda.function_arn,
            description="Organizational Resolution Lambda Function ARN"
        )
