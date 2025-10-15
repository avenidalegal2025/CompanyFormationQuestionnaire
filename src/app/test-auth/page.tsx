"use client";

import { useState } from 'react';

export default function TestAuthPage() {
  const [authStatus, setAuthStatus] = useState<string>('Not tested');

  const testAuth0 = async () => {
    try {
      setAuthStatus('Testing Auth0...');
      
      // Test the Auth0 configuration
      const response = await fetch('/api/test-auth');
      const data = await response.json();
      
      setAuthStatus(`Auth0 Config: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setAuthStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Auth0 Configuration Test</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Auth0 Configuration</h2>
          <button
            onClick={testAuth0}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 mb-4"
          >
            Test Auth0 Config
          </button>
          
          <div className="bg-gray-100 p-4 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">Status:</h3>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap">{authStatus}</pre>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Auth0 Login</h2>
          <a
            href="/api/auth/signin/auth0"
            className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 inline-block"
          >
            Try Auth0 Login
          </a>
        </div>
      </div>
    </div>
  );
}




