"""
Delaware Proxy Configuration
This file contains configuration for various proxy services that can be used
to rotate IP addresses and avoid bans from Delaware's search system.
"""

import random

# Proxy service configurations
# Replace with your actual proxy service credentials

PROXY_SERVICES = {
    # Bright Data (formerly Luminati) - Enterprise proxy service
    'bright_data': {
        'enabled': True,  # Set to True when you have credentials
        'username': 'brd-customer-hl_5dca15c7-zone-residential_proxy1',  # Your actual proxy username
        'password': 'w434mhlde1m9',  # Your actual proxy password
        'endpoint': 'brd.superproxy.io:33335',  # Your actual proxy endpoint
        'session_id': 'random',  # Will be randomized
        'country': 'US',  # Can be rotated
        'protocol': 'http',
        'sticky_session': True,  # Keep same IP for session duration
        'rotation': 'session',  # Rotate IP per session
        'api_key': 'f5f4ffcfb1755077eb3a27f809ab8b4985160d0dedbc4de11405a43b8c4d0b4a'  # Your API key
    },
    
    # Bright Data Residential Proxies (Alternative endpoint)
    'bright_data_residential': {
        'enabled': False,  # Enable if you want to use residential proxies
        'username': 'your_bright_data_username',
        'password': 'your_bright_data_password',
        'endpoint': 'brd.superproxy.io:22225',
        'session_id': 'random',
        'country': 'US',
        'protocol': 'http',
        'sticky_session': True,
        'rotation': 'session'
    },
    
    # Bright Data ISP Proxies (Alternative)
    'bright_data_isp': {
        'enabled': False,  # Enable if you want to use ISP proxies
        'username': 'your_bright_data_username',
        'password': 'your_bright_data_password',
        'endpoint': 'brd.superproxy.io:22225',
        'session_id': 'random',
        'country': 'US',
        'protocol': 'http',
        'sticky_session': True,
        'rotation': 'session'
    },
    
    # ProxyMesh - Simple proxy service
    'proxymesh': {
        'enabled': False,
        'username': 'your_username',
        'password': 'your_password',
        'endpoint': 'us-wa.proxymesh.com:31280',
        'protocol': 'http'
    },
    
    # Smartproxy - Residential proxies
    'smartproxy': {
        'enabled': False,
        'username': 'your_username',
        'password': 'your_password',
        'endpoint': 'gate.smartproxy.com:7000',
        'country': 'US',
        'protocol': 'http'
    },
    
    # Oxylabs - Premium proxy service
    'oxylabs': {
        'enabled': False,
        'username': 'your_username',
        'password': 'your_password',
        'endpoint': 'pr.oxylabs.io:7777',
        'country': 'US',
        'protocol': 'http'
    },
    
    # Free proxy list (use with caution - less reliable)
    'free_proxies': {
        'enabled': False,
        'proxies': [
            # Add free proxy IPs here (format: 'ip:port')
            # Note: Free proxies are often unreliable and may be slow
        ]
    }
}

# US Geographic rotation settings
GEO_ROTATION = {
    'enabled': True,
    'countries': ['US'],  # Focus only on US locations
    'regions': {
        'US': [
            'NY', 'CA', 'TX', 'FL', 'IL', 'WA', 'GA', 'NC', 'PA', 'AZ',
            'CO', 'NV', 'OR', 'UT', 'MN', 'MI', 'OH', 'TN', 'LA', 'MA',
            'MD', 'VA', 'SC', 'AL', 'MS', 'AR', 'OK', 'KS', 'NE', 'IA',
            'MO', 'WI', 'IN', 'KY', 'WV', 'DE', 'NJ', 'CT', 'RI', 'VT',
            'NH', 'ME', 'AK', 'HI'
        ]
    },
    'major_cities': {
        'NY': ['New York', 'Buffalo', 'Rochester', 'Yonkers'],
        'CA': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose'],
        'TX': ['Houston', 'Dallas', 'Austin', 'San Antonio'],
        'FL': ['Miami', 'Tampa', 'Orlando', 'Jacksonville'],
        'IL': ['Chicago', 'Aurora', 'Rockford', 'Joliet'],
        'WA': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver'],
        'GA': ['Atlanta', 'Augusta', 'Columbus', 'Savannah'],
        'NC': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham'],
        'PA': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie'],
        'AZ': ['Phoenix', 'Tucson', 'Mesa', 'Chandler']
    }
}

# Request timing configuration
TIMING_CONFIG = {
    'base_delay': 45,  # Base delay in seconds
    'max_delay': 300,  # Maximum delay in seconds
    'jitter_range': (10, 30),  # Random jitter range
    'retry_delay': 120,  # Delay between retries
    'max_retries': 3
}

# User agent rotation settings
USER_AGENT_CONFIG = {
    'rotation_enabled': True,
    'browser_weights': {
        'chrome': 0.4,  # 40% Chrome
        'firefox': 0.3,  # 30% Firefox
        'safari': 0.2,   # 20% Safari
        'edge': 0.1      # 10% Edge
    },
    'os_weights': {
        'windows': 0.6,  # 60% Windows
        'macos': 0.25,   # 25% macOS
        'linux': 0.1,    # 10% Linux
        'mobile': 0.05   # 5% Mobile
    }
}

# Anti-detection settings
ANTI_DETECTION = {
    'randomize_headers': True,
    'simulate_human_behavior': True,
    'random_mouse_movements': False,  # Not applicable for server-side
    'random_scrolls': False,  # Not applicable for server-side
    'typing_delays': True,
    'page_load_delays': True
}

def get_proxy_config(service_name=None):
    """
    Get proxy configuration for a specific service
    """
    if service_name and service_name in PROXY_SERVICES:
        config = PROXY_SERVICES[service_name].copy()
        if config.get('enabled', False):
            return config
    return None

def get_random_proxy():
    """
    Get a random enabled proxy configuration
    """
    enabled_services = [
        name for name, config in PROXY_SERVICES.items() 
        if config.get('enabled', False)
    ]
    
    if not enabled_services:
        return None
    
    service_name = random.choice(enabled_services)
    return get_proxy_config(service_name)

def build_proxy_url(config):
    """
    Build proxy URL from configuration
    """
    if not config:
        return None
    
    protocol = config.get('protocol', 'http')
    username = config.get('username')
    password = config.get('password')
    endpoint = config.get('endpoint')
    api_key = config.get('api_key')
    
    # For Bright Data proxy authentication
    if username and password:
        return f"{protocol}://{username}:{password}@{endpoint}"
    elif username:
        return f"{protocol}://{username}@{endpoint}"
    else:
        return f"{protocol}://{endpoint}"

# Example usage:
if __name__ == "__main__":
    import random
    
    # Example of how to use the configuration
    proxy_config = get_random_proxy()
    if proxy_config:
        proxy_url = build_proxy_url(proxy_config)
        print(f"Using proxy: {proxy_url}")
    else:
        print("No proxy configured")
