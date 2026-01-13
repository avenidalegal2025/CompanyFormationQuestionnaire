#!/usr/bin/env python3
"""
CDK App for Membership Registry Lambda Function
"""

import aws_cdk as cdk
from membership_registry_stack import MembershipRegistryStack

app = cdk.App()
MembershipRegistryStack(app, "MembershipRegistryStack",
    env=cdk.Environment(
        account="043206426879",
        region="us-west-1"
    )
)

app.synth()
