#!/usr/bin/env python3
"""
List and explore Membership Registry templates in S3 bucket
"""
import os
import sys
import boto3
import re
from collections import defaultdict
from datetime import datetime

# Try to load from .env.local file
def load_env_file(filepath):
    """Load environment variables from .env.local file"""
    env_vars = {}
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # Remove quotes if present
                    value = value.strip('"\'')
                    env_vars[key.strip()] = value
    return env_vars

# Load from .env.local if it exists
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
env_file = os.path.join(project_root, '.env.local')

env_vars = load_env_file(env_file)
for key, value in env_vars.items():
    os.environ.setdefault(key, value)

# Get AWS credentials from environment
AWS_REGION = os.environ.get('AWS_REGION', 'us-west-1')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
BUCKET_NAME = os.environ.get('S3_DOCUMENTS_BUCKET', 'avenida-legal-documents')

def format_size(size_bytes):
    """Format file size in human-readable format"""
    if not size_bytes:
        return 'Unknown'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def main():
    print('🔍 Exploring Membership Registry templates in S3...\n')
    print(f'Bucket: {BUCKET_NAME}')
    print(f'Region: {AWS_REGION}\n')

    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        print('⚠️  AWS credentials not found in environment variables.')
        print('   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY')
        print('   Or use AWS CLI: aws configure')
        return

    try:
        # Initialize S3 client
        s3_client = boto3.client(
            's3',
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY
        )

        # List all files in templates folder
        print('📁 Listing files in templates/ folder...\n')
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=BUCKET_NAME, Prefix='templates/')

        all_objects = []
        for page in pages:
            if 'Contents' in page:
                all_objects.extend(page['Contents'])

        print(f'📁 Found {len(all_objects)} files in templates/ folder:\n')

        # Filter and group membership registry templates
        membership_templates = []
        other_templates = []

        for obj in all_objects:
            key = obj.get('Key', '')
            if 'membership-registry' in key.lower() and key.endswith('.docx'):
                membership_templates.append(obj)
            elif key.endswith('.docx') or key.endswith('.pdf'):
                other_templates.append(obj)

        # Sort by key
        membership_templates.sort(key=lambda x: x.get('Key', ''))
        other_templates.sort(key=lambda x: x.get('Key', ''))

        if membership_templates:
            print('📋 Membership Registry Templates:')
            print('=' * 80)
            
            template_map = {}
            
            for idx, obj in enumerate(membership_templates, 1):
                key = obj.get('Key', '')
                filename = key.split('/')[-1] if '/' in key else key
                size = format_size(obj.get('Size', 0))
                last_modified = obj.get('LastModified', datetime.now())
                if isinstance(last_modified, datetime):
                    last_modified_str = last_modified.strftime('%Y-%m-%d')
                else:
                    last_modified_str = str(last_modified)

                # Extract member and manager counts from filename
                match = re.match(r'membership-registry-template-(\d+)-(\d+)\.docx', filename)
                if match:
                    members, managers = match.groups()
                    members_int = int(members)
                    managers_int = int(managers)
                    template_key = f"{members_int}-{managers_int}"
                    template_map[template_key] = {
                        'members': members_int,
                        'managers': managers_int,
                        'key': key,
                        'size': size,
                        'modified': last_modified_str
                    }
                    
                    print(f'{idx}. {filename}')
                    print(f'   📊 Members: {members}, Managers: {managers}')
                    print(f'   📦 Size: {size}')
                    print(f'   📅 Modified: {last_modified_str}')
                    print(f'   🔗 S3 Key: {key}')
                else:
                    print(f'{idx}. {filename} (legacy format)')
                    print(f'   📦 Size: {size}')
                    print(f'   📅 Modified: {last_modified_str}')
                    print(f'   🔗 S3 Key: {key}')
                print()

            # Analyze structure
            if template_map:
                print('\n📊 Template Structure Analysis:')
                print('=' * 80)
                
                print('\n📋 Available Template Combinations:')
                sorted_templates = sorted(template_map.items(), key=lambda x: (x[1]['members'], x[1]['managers']))
                
                for key, data in sorted_templates:
                    print(f'   {data["members"]} member(s), {data["managers"]} manager(s) → {key}.docx')

                # Find gaps
                print('\n🔍 Missing Template Combinations (up to 6 members, 6 managers):')
                missing = []
                for m in range(1, 7):  # 1 to 6 members
                    for mgr in range(0, 7):  # 0 to 6 managers
                        template_key = f"{m}-{mgr}"
                        if template_key not in template_map:
                            missing.append((m, mgr, template_key))
                
                if missing:
                    print(f'   Found {len(missing)} missing combinations:')
                    for m, mgr, key in missing[:30]:  # Show first 30
                        print(f'   {m} member(s), {mgr} manager(s) → membership-registry-template-{key}.docx')
                    if len(missing) > 30:
                        print(f'   ... and {len(missing) - 30} more')
                else:
                    print('   ✅ All combinations available!')

                # Show coverage statistics
                print('\n📈 Coverage Statistics:')
                total_possible = 6 * 7  # 6 members × 7 manager options (0-6)
                available = len(template_map)
                coverage = (available / total_possible) * 100
                print(f'   Available: {available}/{total_possible} ({coverage:.1f}%)')
                print(f'   Missing: {len(missing)}/{total_possible} ({100-coverage:.1f}%)')

        else:
            print('⚠️  No Membership Registry templates found!')
            print('   Expected format: templates/membership-registry-template-{members}-{managers}.docx')
            print('\n   Looking for files matching pattern:')
            print('   - templates/membership-registry-template-*.docx')

        if other_templates:
            print('\n\n📁 Other Templates in templates/ folder:')
            print('=' * 80)
            for idx, obj in enumerate(other_templates, 1):
                key = obj.get('Key', '')
                filename = key.split('/')[-1] if '/' in key else key
                size = format_size(obj.get('Size', 0))
                print(f'{idx}. {filename} ({size})')

        # Check for subfolders
        print('\n\n📂 Checking for subfolders in templates/...')
        folders = set()
        for obj in all_objects:
            key = obj.get('Key', '')
            if '/' in key:
                parts = key.split('/')
                if len(parts) > 2:  # More than just 'templates/filename'
                    folder_path = '/'.join(parts[:2])  # 'templates/subfolder'
                    folders.add(folder_path)
        
        if folders:
            print(f'   Found {len(folders)} subfolder(s):')
            for folder in sorted(folders):
                print(f'   - {folder}/')
        else:
            print('   No subfolders found (all templates are directly in templates/)')

    except Exception as e:
        print(f'❌ Error listing templates: {e}')
        import traceback
        traceback.print_exc()
        return 1

    print('\n✅ Template exploration complete!')
    return 0

if __name__ == '__main__':
    exit(main())
