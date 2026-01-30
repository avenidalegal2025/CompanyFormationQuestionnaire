#!/usr/bin/env python3
"""
Explore the actual S3 bucket structure for Membership Registry templates
Based on the real structure shown in AWS Console
"""
import os
import sys
import boto3
import re
from collections import defaultdict

# Load from .env.local
def load_env_file(filepath):
    env_vars = {}
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    value = value.strip('"\'')
                    env_vars[key.strip()] = value
    return env_vars

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
env_file = os.path.join(project_root, '.env.local')

env_vars = load_env_file(env_file)
for key, value in env_vars.items():
    os.environ.setdefault(key, value)

AWS_REGION = os.environ.get('AWS_REGION', 'us-west-1')
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')

# Based on the images, the actual bucket and path are:
TEMPLATE_BUCKET = 'company-formation-template-llc-and-inc'
TEMPLATE_PREFIX = 'llc-formation-templates/membership-registry-all-templates/'

def format_size(size_bytes):
    if not size_bytes:
        return 'Unknown'
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def main():
    print('🔍 Exploring ACTUAL S3 bucket structure for Membership Registry templates...\n')
    print(f'Bucket: {TEMPLATE_BUCKET}')
    print(f'Prefix: {TEMPLATE_PREFIX}')
    print(f'Region: {AWS_REGION}\n')

    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        print('⚠️  AWS credentials not found.')
        print('   Using structure from AWS Console screenshots...\n')
        print_known_structure()
        return 0

    try:
        s3_client = boto3.client(
            's3',
            region_name=AWS_REGION,
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY
        )

        print('📁 Listing folders and files...\n')
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=TEMPLATE_BUCKET, Prefix=TEMPLATE_PREFIX, Delimiter='/')

        folders = {}
        files = []

        for page in pages:
            # Get folders (common prefixes)
            if 'CommonPrefixes' in page:
                for prefix in page['CommonPrefixes']:
                    folder_path = prefix['Prefix']
                    folder_name = folder_path.replace(TEMPLATE_PREFIX, '').rstrip('/')
                    folders[folder_name] = folder_path

            # Get files
            if 'Contents' in page:
                for obj in page['Contents']:
                    key = obj.get('Key', '')
                    if key.endswith('.docx'):
                        files.append(obj)

        print(f'📂 Found {len(folders)} folders:\n')
        for folder_name in sorted(folders.keys()):
            print(f'   📁 {folder_name}/')

        print(f'\n📄 Found {len(files)} .docx files total\n')

        # Group files by folder
        files_by_folder = defaultdict(list)
        for obj in files:
            key = obj.get('Key', '')
            # Extract folder name
            parts = key.replace(TEMPLATE_PREFIX, '').split('/')
            if len(parts) > 1:
                folder = parts[0]
                filename = parts[-1]
                files_by_folder[folder].append({
                    'filename': filename,
                    'key': key,
                    'size': obj.get('Size', 0),
                    'modified': obj.get('LastModified', '')
                })

        # Analyze each folder
        print('📊 Detailed Structure:\n')
        print('=' * 80)
        
        for folder_name in sorted(files_by_folder.keys()):
            folder_files = files_by_folder[folder_name]
            print(f'\n📁 {folder_name}/ ({len(folder_files)} files)')
            print('-' * 80)
            
            # Extract member count from folder name
            member_match = re.search(r'(\d+)-member', folder_name)
            member_count = member_match.group(1) if member_match else '?'
            
            for file_info in sorted(folder_files, key=lambda x: x['filename']):
                filename = file_info['filename']
                size = format_size(file_info['size'])
                
                # Extract manager count from filename
                manager_match = re.search(r'_(\d+)\s+Manager\.docx', filename)
                manager_count = manager_match.group(1) if manager_match else '?'
                
                print(f'   📄 {filename}')
                print(f'      Members: {member_count}, Managers: {manager_count}, Size: {size}')
                print(f'      S3 Key: {file_info["key"]}')

        # Create mapping structure
        print('\n\n🗺️  Template Mapping Structure:\n')
        print('=' * 80)
        print('\nTo get template for {members} members and {managers} managers:')
        print(f'  Bucket: {TEMPLATE_BUCKET}')
        print(f'  Path: {TEMPLATE_PREFIX}membership-registry-{{members}}-member/')
        print(f'  File: Template Membership Registry_{{members}} Members_{{managers}} Manager.docx')
        print(f'\n  Full S3 Key: {TEMPLATE_PREFIX}membership-registry-{{members}}-member/Template Membership Registry_{{members}} Members_{{managers}} Manager.docx')

        # Show all available combinations
        print('\n\n📋 Available Template Combinations:\n')
        print('=' * 80)
        combinations = []
        for folder_name in sorted(files_by_folder.keys()):
            member_match = re.search(r'(\d+)-member', folder_name)
            if member_match:
                member_count = int(member_match.group(1))
                for file_info in files_by_folder[folder_name]:
                    manager_match = re.search(r'_(\d+)\s+Manager\.docx', file_info['filename'])
                    if manager_match:
                        manager_count = int(manager_match.group(1))
                        combinations.append((member_count, manager_count))
        
        combinations.sort()
        for members, managers in combinations:
            print(f'   {members} member(s), {managers} manager(s)')

    except Exception as e:
        print(f'❌ Error: {e}')
        print('\n📋 Using known structure from AWS Console screenshots...\n')
        print_known_structure()
        return 1

    print('\n✅ Exploration complete!')
    return 0

def print_known_structure():
    """Print the known structure from AWS Console screenshots"""
    print('=' * 80)
    print('📋 Known Structure (from AWS Console):\n')
    print(f'Bucket: {TEMPLATE_BUCKET}')
    print(f'Base Path: {TEMPLATE_PREFIX}\n')
    
    print('Folders (by member count):')
    for i in range(1, 7):
        print(f'   📁 membership-registry-{i}-member/')
    
    print('\nFile naming pattern (inside each folder):')
    print('   Template Membership Registry_{N} Members_{M} Manager.docx')
    print('   Where N = number of members, M = number of managers\n')
    
    print('Example for 1 member, 1 manager:')
    print(f'   {TEMPLATE_PREFIX}membership-registry-1-member/Template Membership Registry_1 Members_1 Manager.docx')
    
    print('\nExample for 2 members, 3 managers:')
    print(f'   {TEMPLATE_PREFIX}membership-registry-2-members/Template Membership Registry_2 Members_3 Manager.docx')

if __name__ == '__main__':
    exit(main())
