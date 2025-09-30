import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function POST(request: NextRequest) {
  try {
    const { formData, permissions = 'view' } = await request.json();
    
    if (!formData) {
      return NextResponse.json({ error: 'Form data is required' }, { status: 400 });
    }

    // Create a compressed version of the form data to reduce token size
    const compressedData = {
      company: formData.company ? {
        companyName: formData.company.companyName,
        entityType: formData.company.entityType,
        addressLine1: formData.company.addressLine1,
        city: formData.company.city,
        state: formData.company.state,
        zipCode: formData.company.zipCode,
        country: formData.company.country
      } : undefined,
      owners: formData.owners ? formData.owners.map((owner: any) => ({
        fullName: owner.fullName,
        ownership: owner.ownership,
        address: owner.address,
        isUsCitizen: owner.isUsCitizen,
        tin: owner.tin
      })) : undefined,
      admin: formData.admin ? {
        wantAgreement: formData.admin.wantAgreement,
        directors: formData.admin.directors,
        officers: formData.admin.officers,
        managers: formData.admin.managers
      } : undefined
    };

    // Create JWT token with compressed data
    const token = jwt.sign(
      {
        data: compressedData,
        permissions,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days expiration
      },
      JWT_SECRET
    );

    // Generate magic link with shorter token
    const originFromRequest = request.nextUrl.origin;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || originFromRequest;
    const magicLink = `${baseUrl}/collaborate?t=${token}`;

    return NextResponse.json({ 
      success: true, 
      magicLink,
      expiresIn: '7 days'
    });

  } catch (error) {
    console.error('Error generating magic link:', error);
    return NextResponse.json(
      { error: 'Failed to generate magic link' }, 
      { status: 500 }
    );
  }
}

