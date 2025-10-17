"use client";

import { getAuth0SignupUrl } from "@/lib/auth0-client";

export default function TestDirectPage() {
  const handleTestAuth0 = () => {
    const callbackUrl = '/?action=test&draftId=test123';
    const auth0Url = getAuth0SignupUrl(callbackUrl);
    console.log('Generated Auth0 URL:', auth0Url);
    window.location.href = auth0Url;
  };

  const handleTestSimpleAuth0 = () => {
    // Test with minimal parameters
    const baseUrl = 'dev-hx5xtiwldskmbisi.us.auth0.com';
    const clientId = '8dvSA0Br1funvuupTaKSCdKgCAFSmfUT';
    const redirectUri = 'https://company-formation-questionnaire.vercel.app/api/auth/callback/auth0';
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid email profile',
    });
    
    const simpleUrl = `https://${baseUrl}/authorize?${params.toString()}`;
    console.log('Simple Auth0 URL:', simpleUrl);
    window.location.href = simpleUrl;
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Direct Auth0 URL</h1>
      <div className="space-y-4">
        <button 
          onClick={handleTestAuth0}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 block"
        >
          Test Auth0 Direct URL (Full)
        </button>
        <button 
          onClick={handleTestSimpleAuth0}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 block"
        >
          Test Auth0 Simple URL (Minimal)
        </button>
      </div>
      <div className="mt-4">
        <p>This page tests if our custom Auth0 URL generation works without any NextAuth interference.</p>
        <p className="text-sm text-gray-600 mt-2">Try the "Simple" button first to test with minimal parameters.</p>
      </div>
    </div>
  );
}
