import { NextResponse } from "next/server";

export function GET() {
  const data = {
    NEXTAUTH_URL_present: Boolean(process.env.NEXTAUTH_URL),
    AUTH_SECRET_present: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    COGNITO_CLIENT_ID_present: Boolean(process.env.COGNITO_CLIENT_ID),
    COGNITO_CLIENT_SECRET_present: Boolean(process.env.COGNITO_CLIENT_SECRET),
    COGNITO_ISSUER_present: Boolean(process.env.COGNITO_ISSUER),
    // sanity checks
    issuerLooksRight: (process.env.COGNITO_ISSUER || "").startsWith("https://cognito-idp."),
    issuerHasPoolId: (process.env.COGNITO_ISSUER || "").split("/").slice(-1)[0]?.includes("_") || false,
  };
  return NextResponse.json(data);
}