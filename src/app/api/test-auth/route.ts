import { NextResponse } from 'next/server';

export async function GET() {
  const auth0ClientId = process.env.AUTH0_CLIENT_ID;
  const auth0ClientSecret = process.env.AUTH0_CLIENT_SECRET;
  const auth0Issuer = process.env.AUTH0_ISSUER;
  const authSecret = process.env.AUTH_SECRET;

  return NextResponse.json({
    hasAuth0ClientId: !!auth0ClientId,
    hasAuth0ClientSecret: !!auth0ClientSecret,
    hasAuth0Issuer: !!auth0Issuer,
    hasAuthSecret: !!authSecret,
    auth0Issuer: auth0Issuer,
    auth0ClientId: auth0ClientId ? `${auth0ClientId.substring(0, 8)}...` : 'Not set',
  });
}

