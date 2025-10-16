"use client";

import { getAuth0SignupUrl } from "@/lib/auth0-client";

export default function TestDirectPage() {
  const handleTestAuth0 = () => {
    const callbackUrl = '/?action=test&draftId=test123';
    const auth0Url = getAuth0SignupUrl(callbackUrl);
    console.log('Generated Auth0 URL:', auth0Url);
    window.location.href = auth0Url;
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Direct Auth0 URL</h1>
      <button 
        onClick={handleTestAuth0}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Test Auth0 Direct URL
      </button>
      <div className="mt-4">
        <p>This page tests if our custom Auth0 URL generation works without any NextAuth interference.</p>
      </div>
    </div>
  );
}
