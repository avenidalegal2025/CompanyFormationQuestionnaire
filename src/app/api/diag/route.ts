import { NextResponse } from "next/server";

function truncate(val?: string, keep: number = 6) {
  if (!val) return "";
  if (val.length <= keep * 2) return val;
  return `${val.slice(0, keep)}…${val.slice(-keep)}`;
}

export async function GET() {
  const {
    NODE_ENV,
    NEXTAUTH_URL,
    AUTH_SECRET,
    COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET,
    COGNITO_ISSUER,
    COGNITO_DOMAIN,
    COGNITO_REGION,
    COGNITO_USER_POOL_ID,
  } = process.env;

  const issuerLooksRight =
    !!COGNITO_ISSUER &&
    /^https:\/\/cognito-idp\.[\w-]+\.amazonaws\.com\/[\w-]+_.+/.test(
      COGNITO_ISSUER
    );

  const issuerHasPoolId =
    !!COGNITO_ISSUER && /\/[\w-]+_.+/.test(COGNITO_ISSUER || "");

  const callbackUrl = NEXTAUTH_URL
    ? `${NEXTAUTH_URL.replace(/\/$/, "")}/api/auth/callback/cognito`
    : undefined;

  return NextResponse.json({
    info: "Environment diagnostic (values are truncated for safety)",
    env: {
      NODE_ENV,
      NEXTAUTH_URL,
      AUTH_SECRET: truncate(AUTH_SECRET),
      COGNITO_CLIENT_ID: truncate(COGNITO_CLIENT_ID),
      COGNITO_CLIENT_SECRET: truncate(COGNITO_CLIENT_SECRET),
      COGNITO_ISSUER: COGNITO_ISSUER || "",
      COGNITO_DOMAIN: COGNITO_DOMAIN || "",
      COGNITO_REGION: COGNITO_REGION || "",
      COGNITO_USER_POOL_ID: COGNITO_USER_POOL_ID || "",
    },
    checks: {
      NEXTAUTH_URL_present: !!NEXTAUTH_URL,
      AUTH_SECRET_present: !!AUTH_SECRET,
      COGNITO_CLIENT_ID_present: !!COGNITO_CLIENT_ID,
      COGNITO_CLIENT_SECRET_present: !!COGNITO_CLIENT_SECRET,
      COGNITO_ISSUER_present: !!COGNITO_ISSUER,
      issuerLooksRight,
      issuerHasPoolId,
      expectedCallbackUrl: callbackUrl,
    },
  });
}