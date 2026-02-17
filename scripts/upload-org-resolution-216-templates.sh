#!/bin/bash
# Upload C-Corp Organizational Resolution 216 templates (6×6×6) from Downloads to S3.
# Templates must be in ~/Downloads/Org_Resolution_Templates_216_2/*.docx
# S3 destination: s3://${BUCKET}/${PREFIX}/Org_Resolution_*.docx
#
# Usage: AWS_PROFILE=llc-admin ./scripts/upload-org-resolution-216-templates.sh
# Optional: SOURCE_DIR=~/path/to/folder BUCKET=my-bucket PREFIX=templates/org-216 ./scripts/upload-org-resolution-216-templates.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$HOME/Downloads/Org_Resolution_Templates_216_2}"
BUCKET="${TEMPLATE_BUCKET:-company-formation-template-llc-and-inc}"
PREFIX="${ORGANIZATIONAL_RESOLUTION_INC_216_PREFIX:-templates/organizational-resolution-inc-216}"
AWS_REGION="${AWS_REGION:-us-west-1}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "ERROR: Source directory not found: $SOURCE_DIR"
  echo "Put your Org_Resolution_*.docx files in that folder (e.g. from Org_Resolution_Templates_216_2)."
  exit 1
fi

count=$(find "$SOURCE_DIR" -maxdepth 1 -name "Org_Resolution_*.docx" -type f | wc -l | tr -d ' ')
if [ "$count" -eq 0 ]; then
  echo "ERROR: No Org_Resolution_*.docx files in $SOURCE_DIR"
  exit 1
fi

echo "Uploading $count DOCX templates from $SOURCE_DIR to s3://$BUCKET/$PREFIX/"
aws s3 cp "$SOURCE_DIR" "s3://$BUCKET/$PREFIX/" --recursive --exclude "*" --include "Org_Resolution_*.docx" --region "$AWS_REGION" --content-type "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
echo "Done. Verify: aws s3 ls s3://$BUCKET/$PREFIX/ --region $AWS_REGION"
