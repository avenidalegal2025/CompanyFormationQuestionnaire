"use client";

import { useState, useEffect } from 'react';

export default function TestAuth0Config() {
  const [results, setResults] = useState<string>('Testing Auth0 configuration...');
  const [authUrl, setAuthUrl] = useState<string>('');

  useEffect(() => {
    testAuth0Config();
  }, []);

  const testAuth0Config = async () => {
    try {
      setResults('Testing Auth0 configuration...\n');
      
      // Skip the OpenID config test due to CORS issues
      setResults(prev => prev + 'Skipping OpenID config test due to CORS restrictions.\n');
      
      // Test 2: Try a minimal authorization request
      const clientId = '8dvSA0Br1funvuupTaKSCdKgCAFSmfUT';
      const redirectUri = 'https://company-formation-questionnaire.vercel.app/api/auth/callback/auth0';
      
      const authUrl = `https://dev-hx5xtiwldskmbisi.us.auth0.com/authorize?` +
        `response_type=code&` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=openid&` +
        `state=test123`;
      
      setAuthUrl(authUrl);
      setResults(prev => prev + `Generated minimal auth URL:\n${authUrl}\n`);
      
    } catch (error) {
      setResults(prev => prev + `\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Auth0 Configuration Test</h1>
      
      <div className="mb-4">
        <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
          {results}
        </pre>
      </div>
      
      {authUrl && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Generated Auth URL:</h3>
          <p className="break-all text-sm bg-blue-50 p-2 rounded">
            <a href={authUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {authUrl}
            </a>
          </p>
          <button 
            onClick={() => window.open(authUrl, '_blank')}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Test Auth URL
          </button>
        </div>
      )}
    </div>
  );
}
