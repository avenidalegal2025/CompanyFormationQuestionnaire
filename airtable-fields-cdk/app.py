#!/usr/bin/env python3
"""
CDK App for Ensure Airtable Fields Lambda.
Run once on deploy (or manually) to create missing document URL fields on Formations table.
"""

import aws_cdk as cdk
from airtable_fields_stack import AirtableFieldsStack

app = cdk.App()
AirtableFieldsStack(
    app,
    "AirtableFieldsStack",
    env=cdk.Environment(
        account="043206426879",
        region="us-west-1",
    ),
)

app.synth()
