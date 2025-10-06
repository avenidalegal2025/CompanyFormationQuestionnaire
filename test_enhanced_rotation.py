#!/usr/bin/env python3
"""
Test script to demonstrate enhanced IP assignment and session rotation
"""

import json
import sys
import os
import time
import random

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from delaware_lambda_enhanced import (
    get_or_create_session, 
    generate_realistic_us_ip, 
    get_weighted_user_agent,
    get_geographic_headers_enhanced,
    SESSION_POOL,
    cleanup_old_sessions,
    MAX_SESSION_AGE
)

def test_enhanced_ip_assignment():
    """Test the enhanced random IP assignment"""
    
    print("🌐 Enhanced Random IP Assignment Test")
    print("=" * 50)
    
    # Test different US regions
    regions = ['NY', 'CA', 'TX', 'FL', 'IL', 'WA', 'GA', 'NC', 'PA', 'AZ', 'DE']
    
    print("📍 Testing IP generation for different US regions:")
    print()
    
    for region in regions:
        ips = []
        for i in range(3):  # Generate 3 IPs per region
            ip = generate_realistic_us_ip(region)
            ips.append(ip)
        
        print(f"  {region}: {', '.join(ips)}")
    
    print()
    print("🔍 IP Analysis:")
    print("  • Uses realistic US IP ranges (66.102.x.x, 74.125.x.x, etc.)")
    print("  • Region-specific IP prefixes")
    print("  • Avoids .0 and .255 addresses")
    print("  • More realistic than private IP ranges")

def test_session_rotation():
    """Test the enhanced session rotation"""
    
    print("\n🔄 Enhanced Session Rotation Test")
    print("=" * 50)
    
    # Clear existing sessions
    global SESSION_POOL
    SESSION_POOL.clear()
    
    print("Creating multiple sessions...")
    print()
    
    # Create 5 sessions
    for i in range(5):
        session = get_or_create_session(use_proxy=False)
        session_id = session.headers.get('X-Session-ID', 'Unknown')
        ip = session.headers.get('X-Forwarded-For', 'Unknown')
        user_agent = session.headers.get('User-Agent', 'Unknown')[:50]
        
        print(f"  Session {i+1}:")
        print(f"    ID: {session_id}")
        print(f"    IP: {ip}")
        print(f"    User-Agent: {user_agent}...")
        print(f"    Timeout: {session.timeout:.1f}s")
        print()
    
    print(f"📊 Session Pool Status:")
    print(f"  • Total sessions in pool: {len(SESSION_POOL)}")
    print(f"  • Max pool size: 10")
    print(f"  • Session reuse probability: 30%")
    print(f"  • Max session age: 5 minutes")

def test_session_reuse():
    """Test session reuse functionality"""
    
    print("\n♻️ Session Reuse Test")
    print("=" * 50)
    
    # Clear existing sessions
    global SESSION_POOL
    SESSION_POOL.clear()
    
    print("Creating initial session...")
    session1 = get_or_create_session(use_proxy=False)
    session_id1 = session1.headers.get('X-Session-ID', 'Unknown')
    print(f"  Created session: {session_id1}")
    
    print("\nAttempting to reuse sessions...")
    reuse_count = 0
    new_count = 0
    
    for i in range(10):
        session = get_or_create_session(use_proxy=False)
        session_id = session.headers.get('X-Session-ID', 'Unknown')
        
        if session_id == session_id1:
            reuse_count += 1
            print(f"  Attempt {i+1}: REUSED session {session_id}")
        else:
            new_count += 1
            print(f"  Attempt {i+1}: NEW session {session_id}")
    
    print(f"\n📈 Reuse Statistics:")
    print(f"  • Sessions reused: {reuse_count}/10 ({reuse_count*10}%)")
    print(f"  • New sessions created: {new_count}/10 ({new_count*10}%)")
    print(f"  • Expected reuse rate: ~30%")

def test_user_agent_distribution():
    """Test user agent distribution"""
    
    print("\n🖥️ User Agent Distribution Test")
    print("=" * 50)
    
    # Collect user agents
    user_agents = []
    for i in range(100):
        ua = get_weighted_user_agent()
        user_agents.append(ua)
    
    # Analyze distribution
    chrome_count = sum(1 for ua in user_agents if 'Chrome' in ua and 'Edge' not in ua)
    firefox_count = sum(1 for ua in user_agents if 'Firefox' in ua)
    edge_count = sum(1 for ua in user_agents if 'Edge' in ua)
    safari_count = sum(1 for ua in user_agents if 'Safari' in ua and 'Chrome' not in ua)
    mobile_count = sum(1 for ua in user_agents if 'Mobile' in ua or 'iPhone' in ua or 'iPad' in ua)
    
    print("User Agent Distribution (100 samples):")
    print(f"  • Chrome: {chrome_count} ({chrome_count}%)")
    print(f"  • Firefox: {firefox_count} ({firefox_count}%)")
    print(f"  • Edge: {edge_count} ({edge_count}%)")
    print(f"  • Safari: {safari_count} ({safari_count}%)")
    print(f"  • Mobile: {mobile_count} ({mobile_count}%)")
    
    print(f"\nExpected Distribution:")
    print(f"  • Chrome: ~40%")
    print(f"  • Firefox: ~25%")
    print(f"  • Edge: ~10%")
    print(f"  • Safari: ~5%")
    print(f"  • Mobile: ~2%")

def test_geographic_headers():
    """Test enhanced geographic headers"""
    
    print("\n🗺️ Enhanced Geographic Headers Test")
    print("=" * 50)
    
    # Test different locations
    test_locations = [
        {'country': 'US', 'region': 'NY', 'city': 'New York'},
        {'country': 'US', 'region': 'CA', 'city': 'Los Angeles'},
        {'country': 'US', 'region': 'TX', 'city': 'Houston'},
        {'country': 'US', 'region': 'LA', 'city': 'New Orleans'},
        {'country': 'US', 'region': 'DE', 'city': 'Wilmington'},
    ]
    
    for location in test_locations:
        print(f"\n📍 {location['city']}, {location['region']}:")
        headers = get_geographic_headers_enhanced(location)
        
        print(f"  Accept-Language: {headers.get('Accept-Language', 'N/A')}")
        print(f"  X-Forwarded-For: {headers.get('X-Forwarded-For', 'N/A')}")
        print(f"  X-Real-IP: {headers.get('X-Real-IP', 'N/A')}")
        print(f"  X-Session-ID: {headers.get('X-Session-ID', 'N/A')}")
        print(f"  X-Request-ID: {headers.get('X-Request-ID', 'N/A')}")

def test_session_cleanup():
    """Test session cleanup functionality"""
    
    print("\n🧹 Session Cleanup Test")
    print("=" * 50)
    
    # Clear existing sessions
    global SESSION_POOL
    SESSION_POOL.clear()
    
    print("Creating sessions with different ages...")
    
    # Create sessions with different timestamps
    for i in range(5):
        session = get_or_create_session(use_proxy=False)
        # Manually set different creation times
        if SESSION_POOL:
            SESSION_POOL[-1]['created_at'] = time.time() - (i * 60)  # 0, 1, 2, 3, 4 minutes ago
    
    print(f"  Created {len(SESSION_POOL)} sessions")
    print(f"  Session ages: 0, 1, 2, 3, 4 minutes ago")
    
    # Clean up old sessions (older than 3 minutes)
    old_max_age = 180  # 3 minutes
    original_count = len(SESSION_POOL)
    
    # Temporarily change max age for testing
    global MAX_SESSION_AGE
    old_max_age_global = MAX_SESSION_AGE
    MAX_SESSION_AGE = 180
    
    cleanup_old_sessions()
    
    # Restore original max age
    MAX_SESSION_AGE = old_max_age_global
    
    print(f"\nAfter cleanup (max age: 3 minutes):")
    print(f"  Remaining sessions: {len(SESSION_POOL)}")
    print(f"  Cleaned up: {original_count - len(SESSION_POOL)} sessions")
    
    # Show remaining session ages
    current_time = time.time()
    for i, session_data in enumerate(SESSION_POOL):
        age_minutes = (current_time - session_data['created_at']) / 60
        print(f"    Session {i+1}: {age_minutes:.1f} minutes old")

def test_comprehensive_rotation():
    """Test comprehensive rotation with all features"""
    
    print("\n🎯 Comprehensive Rotation Test")
    print("=" * 50)
    
    # Clear existing sessions
    global SESSION_POOL
    SESSION_POOL.clear()
    
    print("Testing 10 requests with full rotation...")
    print()
    
    for i in range(10):
        print(f"Request {i+1}:")
        
        # Get session (may reuse or create new)
        session = get_or_create_session(use_proxy=False)
        
        # Get session info
        session_id = session.headers.get('X-Session-ID', 'Unknown')
        ip = session.headers.get('X-Forwarded-For', 'Unknown')
        user_agent = session.headers.get('User-Agent', 'Unknown')[:30]
        location = session.headers.get('Accept-Language', 'Unknown')
        
        print(f"  Session ID: {session_id}")
        print(f"  IP: {ip}")
        print(f"  User-Agent: {user_agent}...")
        print(f"  Language: {location}")
        print(f"  Pool size: {len(SESSION_POOL)}")
        print()

if __name__ == "__main__":
    test_enhanced_ip_assignment()
    test_session_rotation()
    test_session_reuse()
    test_user_agent_distribution()
    test_geographic_headers()
    test_session_cleanup()
    test_comprehensive_rotation()
    
    print("\n✅ Enhanced IP Assignment & Session Rotation Test Complete!")
    print("\nKey Features Demonstrated:")
    print("• Realistic US IP address generation")
    print("• Session pool with reuse (30% probability)")
    print("• Weighted user agent distribution")
    print("• Geographic header variation")
    print("• Automatic session cleanup")
    print("• Comprehensive rotation testing")
