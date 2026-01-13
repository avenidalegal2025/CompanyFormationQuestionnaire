#!/usr/bin/env python3
"""
CDK App for Organizational Resolution Lambda Function
"""

import aws_cdk as cdk
from organizational_resolution_stack import OrganizationalResolutionStack

app = cdk.App()
OrganizationalResolutionStack(app, "OrganizationalResolutionStack",
    env=cdk.Environment(
        account="043206426879",
        region="us-west-1"
    )
)

app.synth()
