"""
CDK Stack for Ensure Airtable Fields Lambda.
Creates missing document URL fields on Airtable Formations table via Metadata API.
"""

from aws_cdk import (
    Stack,
    aws_lambda as _lambda,
    aws_iam as iam,
    Duration,
    CfnOutput,
)
from constructs import Construct


class AirtableFieldsStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Airtable credentials from context (or SSM in production)
        base_id = self.node.try_get_context("airtable_base_id")
        api_key = self.node.try_get_context("airtable_api_key")
        if not base_id or not api_key:
            raise ValueError(
                "Deploy with: cdk deploy -c airtable_base_id=appXXX -c airtable_api_key=patXXX"
            )

        lambda_role = iam.Role(
            self,
            "EnsureAirtableFieldsLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            description="Role for Ensure Airtable Fields Lambda",
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                )
            ],
        )

        ensure_fields_lambda = _lambda.Function(
            self,
            "EnsureAirtableFieldsLambda",
            runtime=_lambda.Runtime.PYTHON_3_11,
            handler="ensure-airtable-fields-lambda.lambda_handler",
            code=_lambda.Code.from_asset("../lambda-functions"),
            role=lambda_role,
            timeout=Duration.seconds(60),
            memory_size=128,
            environment={
                "AIRTABLE_BASE_ID": base_id,
                "AIRTABLE_API_KEY": api_key,
            },
            description="Ensures Airtable Formations table has required document URL fields",
        )

        CfnOutput(
            self,
            "FunctionName",
            value=ensure_fields_lambda.function_name,
            description="Invoke this after deploy to create missing Airtable fields",
        )

        CfnOutput(
            self,
            "InvokeCommand",
            value=f"aws lambda invoke --function-name {ensure_fields_lambda.function_name} --region us-west-1 out.json && cat out.json",
            description="Run this to ensure fields exist",
        )
