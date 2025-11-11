'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';

export default function TestAuthPage() {
  const { data: session, status } = useSession();
  const [testResult, setTestResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testPassportAccess = async () => {
    setLoading(true);
    setTestResult('Testing...');
    
    try {
      // Test with a fake S3 key
      const testKey = 'test-company-abc/documents/ids/test-passport.png';
      const response = await fetch(`/api/admin/passport/view?key=${encodeURIComponent(testKey)}`);
      
      setTestResult(`
        Status: ${response.status}
        Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}
        Content-Type: ${response.headers.get('content-type')}
      `);
    } catch (error: any) {
      setTestResult(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">🔐 Authentication Test Page</h1>
        
        <div className="mb-8 p-4 bg-blue-50 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Session Status</h2>
          <p><strong>Status:</strong> {status}</p>
          {session?.user && (
            <>
              <p><strong>Email:</strong> {session.user.email}</p>
              <p><strong>Name:</strong> {session.user.name}</p>
            </>
          )}
          {!session && status === 'unauthenticated' && (
            <p className="text-red-600">❌ Not logged in</p>
          )}
        </div>

        <div className="mb-8">
          <button
            onClick={testPassportAccess}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Passport Access'}
          </button>
        </div>

        {testResult && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Test Result</h2>
            <pre className="whitespace-pre-wrap text-sm">{testResult}</pre>
          </div>
        )}

        <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Expected Behavior</h2>
          <ul className="list-disc list-inside space-y-2">
            <li><strong>If logged in as authorized email:</strong> Should return 404 (file doesn't exist) or 500 (S3 error)</li>
            <li><strong>If logged in as unauthorized email:</strong> Should return 403 with "Access Denied" HTML</li>
            <li><strong>If not logged in:</strong> Should redirect to /api/auth/signin</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

