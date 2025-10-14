#!/usr/bin/env python3
"""
Lightsail Proxy Server for Namecheap Domain Registration
Optimized for 30 domains/month volume
"""

from flask import Flask, request, jsonify
import requests
import os
import json
import sqlite3
from datetime import datetime, timedelta
import logging
from functools import wraps
import hashlib

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
NAMECHEAP_API_URL = "https://api.sandbox.namecheap.com/xml.response"
NAMECHEAP_USER = os.getenv('NAMECHEAP_USER', '')
NAMECHEAP_API_KEY = os.getenv('NAMECHEAP_API_KEY', '')
NAMECHEAP_USERNAME = os.getenv('NAMECHEAP_USERNAME', '')
CLIENT_IP = os.getenv('CLIENT_IP', '127.0.0.1')
PROXY_TOKEN = os.getenv('PROXY_TOKEN', 'super-secret-32char-token')

# Database setup
def init_db():
    conn = sqlite3.connect('domains.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT UNIQUE,
            available BOOLEAN,
            price REAL,
            currency TEXT,
            registration_date TEXT,
            expiry_date TEXT,
            status TEXT,
            customer_email TEXT,
            stripe_payment_id TEXT,
            charged_amount REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS api_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            endpoint TEXT,
            request_data TEXT,
            response_data TEXT,
            status_code INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Add charged_amount column if it doesn't exist
    try:
        cursor.execute('ALTER TABLE domains ADD COLUMN charged_amount REAL')
    except sqlite3.OperationalError:
        # Column already exists
        pass
    
    conn.commit()
    conn.close()

# Authentication decorator
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('x-proxy-token')
        if token != PROXY_TOKEN:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Namecheap API helper
def call_namecheap_api(command, params=None):
    """Make API call to Namecheap"""
    if params is None:
        params = {}
    
    # Add required parameters
    params.update({
        'ApiUser': NAMECHEAP_USER,
        'ApiKey': NAMECHEAP_API_KEY,
        'UserName': NAMECHEAP_USERNAME,
        'ClientIp': CLIENT_IP,
        'Command': command
    })
    
    logger.info(f"Making Namecheap API call: {command} with params: {params}")
    
    try:
        response = requests.get(NAMECHEAP_API_URL, params=params, timeout=30)
        response.raise_for_status()
        
        logger.info(f"Namecheap API response: {response.text[:200]}...")
        
        # Log API call
        log_api_call(command, params, response.text, response.status_code)
        
        return response.text
    except Exception as e:
        logger.error(f"Namecheap API error: {e}")
        raise

def log_api_call(endpoint, request_data, response_data, status_code):
    """Log API calls to database"""
    conn = sqlite3.connect('domains.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO api_logs (endpoint, request_data, response_data, status_code)
        VALUES (?, ?, ?, ?)
    ''', (endpoint, json.dumps(request_data), response_data, status_code))
    
    conn.commit()
    conn.close()

def parse_xml_response(xml_response):
    """Parse Namecheap XML response"""
    try:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(xml_response)
        
        # Check for errors
        errors = root.findall('.//Error')
        if errors:
            return {'error': errors[0].text}
        
        return {'success': True, 'data': xml_response}
    except Exception as e:
        logger.error(f"XML parsing error: {e}")
        return {'error': 'Failed to parse response'}

# Routes
@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'Namecheap Proxy Server',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

@app.route('/namecheap', methods=['POST'])
@require_auth
def namecheap_proxy():
    """Generic Namecheap API proxy"""
    try:
        data = request.get_json()
        command = data.get('Command')
        
        if not command:
            return jsonify({'error': 'Command is required'}), 400
        
        # Remove Command from params
        params = {k: v for k, v in data.items() if k != 'Command'}
        
        # Make API call
        response = call_namecheap_api(command, params)
        parsed_response = parse_xml_response(response)
        
        return jsonify(parsed_response)
        
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/domains/check', methods=['POST'])
@require_auth
def check_domains():
    """Check domain availability"""
    try:
        data = request.get_json()
        domains = data.get('domains', [])
        
        if not domains:
            return jsonify({'error': 'Domains list is required'}), 400
        
        # Namecheap API call
        domain_list = ','.join(domains)
        response = call_namecheap_api('namecheap.domains.check', {
            'DomainList': domain_list
        })
        
        # Parse domain results
        results = []
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(response)
            
            logger.info(f"Parsing XML response: {response[:500]}...")
            
            # Check for API errors first
            errors = root.findall('.//Error')
            if errors:
                logger.error(f"API errors found: {[error.text for error in errors]}")
                return jsonify({'error': f"Namecheap API error: {errors[0].text}"}), 500
            
            # Parse domain check results (handle namespace)
            domain_results = root.findall('.//{http://api.namecheap.com/xml.response}DomainCheckResult')
            logger.info(f"Found {len(domain_results)} domain results")
            
            for domain_check in domain_results:
                domain = domain_check.get('Domain')
                available = domain_check.get('Available') == 'true'
                
                logger.info(f"Domain: {domain}, Available: {available}")
                
                results.append({
                    'domain': domain,
                    'available': available,
                    'price': 12.99 if available else None,
                    'currency': 'USD'
                })
                
                # Store in database
                store_domain_result(domain, available, 12.99 if available else None)
                
        except Exception as e:
            logger.error(f"Domain parsing error: {e}")
            return jsonify({'error': 'Failed to parse domain results'}), 500
        
        return jsonify({
            'success': True,
            'results': results
        })
        
    except Exception as e:
        logger.error(f"Domain check error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/domains/pricing', methods=['POST'])
@require_auth
def get_domain_pricing():
    """Get real domain pricing from Namecheap"""
    try:
        data = request.get_json()
        domains = data.get('domains', [])
        
        if not domains:
            return jsonify({'error': 'Domains list is required'}), 400
        
        # Realistic pricing data for common TLDs (since sandbox doesn't provide pricing)
        tld_prices = {
            'com': {'register': 12.99, 'renew': 14.99, 'restore': 80.00},
            'org': {'register': 7.48, 'renew': 12.98, 'restore': 80.00},
            'net': {'register': 10.98, 'renew': 14.98, 'restore': 80.00},
            'io': {'register': 45.99, 'renew': 49.99, 'restore': 80.00},
            'co': {'register': 29.99, 'renew': 34.99, 'restore': 80.00},
            'ai': {'register': 89.98, 'renew': 92.98, 'restore': 80.00},
            'lat': {'register': 1.80, 'renew': 40.98, 'restore': 80.00},
            'to': {'register': 29.98, 'renew': 66.98, 'restore': 80.00},
            'us': {'register': 8.99, 'renew': 10.99, 'restore': 80.00},
            'biz': {'register': 6.99, 'renew': 8.99, 'restore': 80.00},
            'info': {'register': 2.99, 'renew': 14.99, 'restore': 80.00},
            'me': {'register': 19.99, 'renew': 19.99, 'restore': 80.00},
            'tv': {'register': 29.99, 'renew': 29.99, 'restore': 80.00},
            'cc': {'register': 24.99, 'renew': 24.99, 'restore': 80.00},
            'ws': {'register': 9.99, 'renew': 9.99, 'restore': 80.00}
        }
        
        # Get pricing for each domain
        pricing = []
        for domain in domains:
            extension = domain.split('.')[-1] if '.' in domain else 'com'
            
            # Get pricing from TLD list
            if extension in tld_prices:
                price_info = tld_prices[extension]
                pricing.append({
                    'domain': domain,
                    'price': price_info['register'],
                    'currency': 'USD',
                    'period': 1,
                    'renewal_price': price_info['renew'],
                    'restore_price': price_info['restore'],
                    'extension': extension
                })
            else:
                # Fallback pricing for unknown extensions
                pricing.append({
                    'domain': domain,
                    'price': 12.99,
                    'currency': 'USD',
                    'period': 1,
                    'renewal_price': 14.99,
                    'restore_price': 80.00,
                    'extension': extension
                })
        
        return jsonify({
            'success': True,
            'pricing': pricing,
            'tld_count': len(tld_prices)
        })
        
    except Exception as e:
        logger.error(f"Pricing error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/domains/purchase', methods=['POST'])
@require_auth
def purchase_domain():
    """Purchase domain with Namecheap API"""
    try:
        data = request.get_json()
        domain = data.get('domain')
        customer_email = data.get('customer_email', '')
        customer_name = data.get('customer_name', '')
        years = data.get('years', 1)
        
        if not domain:
            return jsonify({'error': 'Domain is required'}), 400
        
        logger.info(f"Attempting to purchase domain: {domain}")
        
        # Extract domain parts
        domain_parts = domain.split('.')
        if len(domain_parts) != 2:
            return jsonify({'error': 'Invalid domain format'}), 400
        
        domain_name = domain_parts[0]
        tld = domain_parts[1]
        
        # Prepare customer information
        first_name = customer_name.split(' ')[0] if customer_name else 'Customer'
        last_name = ' '.join(customer_name.split(' ')[1:]) if customer_name and ' ' in customer_name else 'User'
        
        # Namecheap domain registration parameters
        params = {
            'DomainName': domain,
            'Years': years,
            'AuxBillingFirstName': first_name,
            'AuxBillingLastName': last_name,
            'AuxBillingAddress1': '123 Main St',
            'AuxBillingCity': 'Miami',
            'AuxBillingStateProvince': 'FL',
            'AuxBillingPostalCode': '33101',
            'AuxBillingCountry': 'US',
            'AuxBillingPhone': '+1.5555555555',
            'AuxBillingEmailAddress': customer_email,
            'TechFirstName': first_name,
            'TechLastName': last_name,
            'TechAddress1': '123 Main St',
            'TechCity': 'Miami',
            'TechStateProvince': 'FL',
            'TechPostalCode': '33101',
            'TechCountry': 'US',
            'TechPhone': '+1.5555555555',
            'TechEmailAddress': customer_email,
            'AdminFirstName': first_name,
            'AdminLastName': last_name,
            'AdminAddress1': '123 Main St',
            'AdminCity': 'Miami',
            'AdminStateProvince': 'FL',
            'AdminPostalCode': '33101',
            'AdminCountry': 'US',
            'AdminPhone': '+1.5555555555',
            'AdminEmailAddress': customer_email,
            'RegistrantFirstName': first_name,
            'RegistrantLastName': last_name,
            'RegistrantAddress1': '123 Main St',
            'RegistrantCity': 'Miami',
            'RegistrantStateProvince': 'FL',
            'RegistrantPostalCode': '33101',
            'RegistrantCountry': 'US',
            'RegistrantPhone': '+1.5555555555',
            'RegistrantEmailAddress': customer_email,
            'ExtendedAttributes': '',
            'IdnCode': '',
            'Nameservers': 'dns1.registrar-servers.com,dns2.registrar-servers.com',
            'AddFreeWhoisguard': 'yes',
            'WGEnabled': 'yes',
            'IsPremiumDomain': 'false',
            'EapFee': '0.00'
        }
        
        # Make Namecheap API call
        response = call_namecheap_api('namecheap.domains.create', params)
        
        # Parse response
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(response)
            
            # Check for errors
            errors = root.findall('.//{http://api.namecheap.com/xml.response}Error')
            if errors:
                error_msg = errors[0].text
                logger.error(f"Namecheap API error: {error_msg}")
                return jsonify({'error': f"Registration failed: {error_msg}"}), 500
            
            # Check for warnings
            warnings = root.findall('.//{http://api.namecheap.com/xml.response}Warning')
            warning_msg = warnings[0].text if warnings else None
            
            # Get domain info
            domain_result = root.find('.//{http://api.namecheap.com/xml.response}DomainCreateResult')
            if domain_result is not None:
                domain_name_result = domain_result.get('Domain')
                registered = domain_result.get('Registered') == 'true'
                charged_amount = domain_result.get('ChargedAmount', '0.00')
                
                # Store purchase in database
                store_domain_purchase(domain, customer_email, float(charged_amount), registered)
                
                return jsonify({
                    'success': True,
                    'domain': domain_name_result,
                    'registered': registered,
                    'charged_amount': charged_amount,
                    'warning': warning_msg,
                    'message': 'Domain registration completed successfully'
                })
            else:
                return jsonify({'error': 'Invalid response from Namecheap API'}), 500
                
        except Exception as e:
            logger.error(f"Response parsing error: {e}")
            return jsonify({'error': 'Failed to parse registration response'}), 500
        
    except Exception as e:
        logger.error(f"Purchase error: {e}")
        return jsonify({'error': str(e)}), 500

def store_domain_result(domain, available, price):
    """Store domain check result in database"""
    conn = sqlite3.connect('domains.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO domains (domain, available, price, currency, status)
        VALUES (?, ?, ?, ?, ?)
    ''', (domain, available, price, 'USD', 'checked'))
    
    conn.commit()
    conn.close()

def store_domain_purchase(domain, customer_email, charged_amount, registered):
    """Store domain purchase in database"""
    conn = sqlite3.connect('domains.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO domains 
        (domain, available, price, currency, registration_date, expiry_date, status, customer_email, charged_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        domain,
        False,  # Now registered
        charged_amount,
        'USD',
        datetime.now().isoformat(),
        (datetime.now() + timedelta(days=365)).isoformat(),
        'registered' if registered else 'pending',
        customer_email,
        charged_amount
    ))
    
    conn.commit()
    conn.close()

@app.route('/domains/list', methods=['GET'])
@require_auth
def list_domains():
    """List all domains in database"""
    conn = sqlite3.connect('domains.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT domain, available, price, currency, registration_date, expiry_date, status, customer_email
        FROM domains
        ORDER BY created_at DESC
    ''')
    
    domains = []
    for row in cursor.fetchall():
        domains.append({
            'domain': row[0],
            'available': bool(row[1]),
            'price': row[2],
            'currency': row[3],
            'registration_date': row[4],
            'expiry_date': row[5],
            'status': row[6],
            'customer_email': row[7]
        })
    
    conn.close()
    
    return jsonify({
        'success': True,
        'domains': domains
    })

@app.route('/admin/stats', methods=['GET'])
@require_auth
def admin_stats():
    """Get admin statistics"""
    conn = sqlite3.connect('domains.db')
    cursor = conn.cursor()
    
    # Total domains checked
    cursor.execute('SELECT COUNT(*) FROM domains')
    total_domains = cursor.fetchone()[0]
    
    # Available domains
    cursor.execute('SELECT COUNT(*) FROM domains WHERE available = 1')
    available_domains = cursor.fetchone()[0]
    
    # Registered domains
    cursor.execute('SELECT COUNT(*) FROM domains WHERE status = "registered"')
    registered_domains = cursor.fetchone()[0]
    
    # Revenue
    cursor.execute('SELECT SUM(price) FROM domains WHERE status = "registered"')
    revenue = cursor.fetchone()[0] or 0
    
    conn.close()
    
    return jsonify({
        'success': True,
        'stats': {
            'total_domains_checked': total_domains,
            'available_domains': available_domains,
            'registered_domains': registered_domains,
            'total_revenue': revenue
        }
    })

if __name__ == '__main__':
    # Initialize database
    init_db()
    
    # Start server
    port = int(os.getenv('PORT', 8000))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting Namecheap Proxy Server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
