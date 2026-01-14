/**
 * Shared utility functions to convert Airtable records to form data format
 * Used by SS-4, 2848, and 8821 generation endpoints
 */

/**
 * Get responsible party from Airtable fields (same logic as SS-4)
 * Returns: { name, firstName, lastName, ssn, address, officerRole, title }
 */
export function getResponsiblePartyFromAirtable(fields: any): {
  name: string;
  firstName: string;
  lastName: string;
  ssn: string;
  address: string;
  officerRole: string;
  title: string;
} {
  const entityType = fields['Entity Type'] || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  const isSCorp = entityType === 'S-Corp';
  const isCCorp = entityType === 'C-Corp';
  const ownerCount = fields['Owner Count'] || 0;

  let responsiblePartyName = '';
  let responsiblePartyFirstName = '';
  let responsiblePartyLastName = '';
  let responsiblePartySSN = '';
  let responsiblePartyAddress = '';
  let responsiblePartyOfficerRole = '';
  let signatureTitle = '';

  // Helper function to check if role is PRESIDENT
  const isPresidentRole = (role: string): boolean => {
    if (!role) return false;
    const roleUpper = role.trim().toUpperCase();
    return roleUpper === 'PRESIDENT' || 
           (roleUpper.startsWith('PRESIDENT') && !roleUpper.includes('VICE') && !roleUpper.includes('CO-'));
  };

  // Helper function to get valid SSN
  const hasValidSSN = (ssn: string): boolean => {
    if (!ssn || ssn.trim() === '') return false;
    const ssnUpper = ssn.toUpperCase();
    return ssnUpper !== 'N/A' && !ssnUpper.includes('FOREIGN');
  };

  if (isCorp) {
    // Get officers count
    const officersCount = fields['Officers Count'] || 0;
    const officersAllOwners = fields['Officers All Owners'] === 'Yes' || fields['Officers All Owners'] === true;
    
    interface OfficerInfo {
      officerIndex: number;
      ownerIndex: number;
      name: string;
      firstName: string;
      lastName: string;
      ssn: string;
      address: string;
      role: string;
      ownershipPercent: number;
    }
    const allOfficers: OfficerInfo[] = [];
    
    if (officersAllOwners) {
      // All owners are officers
      for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
        const ownerName = fields[`Owner ${i} Name`] || '';
        if (!ownerName || ownerName.trim() === '') continue;
        
        const ownerSSN = fields[`Owner ${i} SSN`] || '';
        let officerRole = '';
        for (let k = 1; k <= Math.min(officersCount, 6); k++) {
          const officerName = fields[`Officer ${k} Name`] || '';
          if (officerName && ownerName && 
              officerName.trim().toLowerCase() === ownerName.trim().toLowerCase()) {
            officerRole = fields[`Officer ${k} Role`] || '';
            break;
          }
        }
        
        let ownershipPercent = fields[`Owner ${i} Ownership %`] || 0;
        if (ownershipPercent < 1 && ownershipPercent > 0) {
          ownershipPercent = ownershipPercent * 100;
        }
        
        allOfficers.push({
          officerIndex: i,
          ownerIndex: i,
          name: ownerName,
          firstName: fields[`Owner ${i} First Name`] || '',
          lastName: fields[`Owner ${i} Last Name`] || '',
          ssn: ownerSSN,
          address: fields[`Owner ${i} Address`] || '',
          role: officerRole,
          ownershipPercent: ownershipPercent,
        });
      }
    } else {
      // Specific officers, match to owners
      for (let i = 1; i <= Math.min(officersCount, 6); i++) {
        const officerName = fields[`Officer ${i} Name`] || '';
        if (!officerName || officerName.trim() === '') continue;
        
        const officerRole = fields[`Officer ${i} Role`] || '';
        
        // Match to owner to get SSN and ownership
        for (let j = 1; j <= Math.min(ownerCount, 6); j++) {
          const ownerName = fields[`Owner ${j} Name`] || '';
          if (ownerName && officerName && 
              ownerName.trim().toLowerCase() === officerName.trim().toLowerCase()) {
            const ownerSSN = fields[`Owner ${j} SSN`] || '';
            
            let ownershipPercent = fields[`Owner ${j} Ownership %`] || 0;
            if (ownershipPercent < 1 && ownershipPercent > 0) {
              ownershipPercent = ownershipPercent * 100;
            }
            
            allOfficers.push({
              officerIndex: i,
              ownerIndex: j,
              name: officerName,
              firstName: fields[`Officer ${i} First Name`] || fields[`Owner ${j} First Name`] || '',
              lastName: fields[`Officer ${i} Last Name`] || fields[`Owner ${j} Last Name`] || '',
              ssn: ownerSSN,
              address: fields[`Officer ${i} Address`] || fields[`Owner ${j} Address`] || '',
              role: officerRole,
              ownershipPercent: ownershipPercent,
            });
            break;
          }
        }
      }
    }
    
    // S-Corp: President always has SSN and always signs
    if (isSCorp) {
      const president = allOfficers.find(o => isPresidentRole(o.role) && hasValidSSN(o.ssn));
      if (president) {
        responsiblePartyName = president.name;
        responsiblePartyFirstName = president.firstName;
        responsiblePartyLastName = president.lastName;
        responsiblePartySSN = president.ssn;
        responsiblePartyAddress = president.address;
        responsiblePartyOfficerRole = 'PRESIDENT';
        signatureTitle = 'PRESIDENT';
      } else {
        throw new Error(`CRITICAL: S-Corp must have a PRESIDENT officer with SSN.`);
      }
    } 
    // C-Corp: President with SSN > Any officer with SSN > Highest % owner (if no SSN)
    else if (isCCorp) {
      // Priority 1: President with SSN
      const presidentWithSSN = allOfficers.find(o => isPresidentRole(o.role) && hasValidSSN(o.ssn));
      if (presidentWithSSN) {
        responsiblePartyName = presidentWithSSN.name;
        responsiblePartyFirstName = presidentWithSSN.firstName;
        responsiblePartyLastName = presidentWithSSN.lastName;
        responsiblePartySSN = presidentWithSSN.ssn;
        responsiblePartyAddress = presidentWithSSN.address;
        responsiblePartyOfficerRole = 'PRESIDENT';
        signatureTitle = 'PRESIDENT';
      } else {
        // Priority 2: Any officer with SSN
        const officerWithSSN = allOfficers.find(o => hasValidSSN(o.ssn));
        if (officerWithSSN) {
          responsiblePartyName = officerWithSSN.name;
          responsiblePartyFirstName = officerWithSSN.firstName;
          responsiblePartyLastName = officerWithSSN.lastName;
          responsiblePartySSN = officerWithSSN.ssn;
          responsiblePartyAddress = officerWithSSN.address;
          responsiblePartyOfficerRole = officerWithSSN.role || 'PRESIDENT';
          signatureTitle = officerWithSSN.role || 'PRESIDENT';
        } else {
          // Priority 3: Highest % owner (if no SSN)
          const sortedByOwnership = [...allOfficers].sort((a, b) => b.ownershipPercent - a.ownershipPercent);
          if (sortedByOwnership.length > 0) {
            const highestOwner = sortedByOwnership[0];
            responsiblePartyName = highestOwner.name;
            responsiblePartyFirstName = highestOwner.firstName;
            responsiblePartyLastName = highestOwner.lastName;
            responsiblePartySSN = highestOwner.ssn || 'N/A-FOREIGN';
            responsiblePartyAddress = highestOwner.address;
            responsiblePartyOfficerRole = highestOwner.role || 'PRESIDENT';
            signatureTitle = highestOwner.role || 'PRESIDENT';
          }
        }
      }
    }
  } else if (isLLC) {
    // LLC: Highest % owner with SSN > Any owner with SSN > Highest % owner (if no SSN)
    const owners: Array<{
      name: string;
      firstName: string;
      lastName: string;
      ssn: string;
      address: string;
      ownershipPercent: number;
    }> = [];
    
    for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
      const ownerName = fields[`Owner ${i} Name`] || '';
      if (!ownerName || ownerName.trim() === '') continue;
      
      let ownershipPercent = fields[`Owner ${i} Ownership %`] || 0;
      if (ownershipPercent < 1 && ownershipPercent > 0) {
        ownershipPercent = ownershipPercent * 100;
      }
      
      owners.push({
        name: ownerName,
        firstName: fields[`Owner ${i} First Name`] || '',
        lastName: fields[`Owner ${i} Last Name`] || '',
        ssn: fields[`Owner ${i} SSN`] || '',
        address: fields[`Owner ${i} Address`] || '',
        ownershipPercent: ownershipPercent,
      });
    }
    
    // Priority 1: Highest % owner with SSN
    const ownersWithSSN = owners.filter(o => hasValidSSN(o.ssn));
    if (ownersWithSSN.length > 0) {
      const sortedByOwnership = [...ownersWithSSN].sort((a, b) => b.ownershipPercent - a.ownershipPercent);
      const highestOwnerWithSSN = sortedByOwnership[0];
      responsiblePartyName = highestOwnerWithSSN.name;
      responsiblePartyFirstName = highestOwnerWithSSN.firstName;
      responsiblePartyLastName = highestOwnerWithSSN.lastName;
      responsiblePartySSN = highestOwnerWithSSN.ssn;
      responsiblePartyAddress = highestOwnerWithSSN.address;
    } else {
      // Priority 2: Highest % owner (if no SSN)
      const sortedByOwnership = [...owners].sort((a, b) => b.ownershipPercent - a.ownershipPercent);
      if (sortedByOwnership.length > 0) {
        const highestOwner = sortedByOwnership[0];
        responsiblePartyName = highestOwner.name;
        responsiblePartyFirstName = highestOwner.firstName;
        responsiblePartyLastName = highestOwner.lastName;
        responsiblePartySSN = highestOwner.ssn || 'N/A-FOREIGN';
        responsiblePartyAddress = highestOwner.address;
      }
    }
    
    // Determine title for LLC
    if (ownerCount === 1) {
      signatureTitle = 'SOLE MEMBER';
    } else {
      signatureTitle = 'MEMBER';
    }
  }
  
  // Fallback to Owner 1 if still empty (same as SS-4)
  if (!responsiblePartyName || responsiblePartyName.trim() === '') {
    const owner1Name = fields['Owner 1 Name'] || '';
    if (owner1Name) {
      responsiblePartyName = owner1Name;
      responsiblePartyFirstName = fields['Owner 1 First Name'] || '';
      responsiblePartyLastName = fields['Owner 1 Last Name'] || '';
      responsiblePartySSN = fields['Owner 1 SSN'] || 'N/A-FOREIGN';
      responsiblePartyAddress = fields['Owner 1 Address'] || '';
      if (isCorp) {
        signatureTitle = 'PRESIDENT';
      } else if (isLLC && ownerCount === 1) {
        signatureTitle = 'SOLE MEMBER';
      } else if (isLLC) {
        signatureTitle = 'MEMBER';
      }
    }
  }
  
  return {
    name: responsiblePartyName,
    firstName: responsiblePartyFirstName,
    lastName: responsiblePartyLastName,
    ssn: responsiblePartySSN,
    address: responsiblePartyAddress,
    officerRole: responsiblePartyOfficerRole,
    title: signatureTitle,
  };
}

/**
 * Parse company address from Airtable format: "Street, City, State ZIP"
 */
export function parseCompanyAddress(fields: any): {
  street: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
} {
  const companyAddress = fields['Company Address'] || '';
  
  // Default to virtual office if no address
  if (!companyAddress || companyAddress.trim() === '') {
    return {
      street: '12550 Biscayne Blvd Ste 110',
      addressLine2: '',
      city: 'North Miami',
      state: 'FL',
      zip: '33181',
    };
  }
  
  // Parse "Street, City, State ZIP" format
  const parts = companyAddress.split(',').map((p: string) => p.trim());
  let street = '';
  let addressLine2 = '';
  let city = '';
  let state = '';
  let zip = '';
  
  if (parts.length >= 3) {
    // Format: "Street, City, State ZIP"
    street = parts[0];
    city = parts[1];
    const stateZipStr = parts[2];
    const stateZipMatch = stateZipStr.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (stateZipMatch) {
      state = stateZipMatch[1];
      zip = stateZipMatch[2];
    }
  } else if (parts.length === 2) {
    // Format: "Street, City State ZIP"
    street = parts[0];
    const cityStateZip = parts[1];
    const match = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (match) {
      city = match[1];
      state = match[2];
      zip = match[3];
    }
  } else {
    // Fallback: use as-is
    street = companyAddress;
  }

  // If we still couldn't parse city/state/zip (e.g. "New York New York 10001"),
  // fall back to the full raw address in the street line so we don't lose info.
  if (!city && !state && !zip && companyAddress) {
    street = companyAddress;
  }
  
  return { street, addressLine2, city, state, zip };
}

/**
 * Map Airtable record to Form 2848 (Power of Attorney) format
 */
export function mapAirtableTo2848(record: any): any {
  const fields = record.fields || record;
  const entityType = fields['Entity Type'] || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  const isSCorp = entityType === 'S-Corp';
  const ownerCount = fields['Owner Count'] || 0;
  
  // Get responsible party (same logic as SS-4)
  const responsibleParty = getResponsiblePartyFromAirtable(fields);
  
  // Parse company address
  const address = parseCompanyAddress(fields);
  
  // Get company phone
  const companyPhone = (fields['Business Phone'] || '').trim();
  
  // Get formation year
  const paymentDate = fields['Payment Date'] || new Date().toISOString().split('T')[0];
  const formationYear = new Date(paymentDate).getFullYear().toString();
  
  // Determine tax form number
  let taxFormNumber = '';
  if (isLLC) {
    taxFormNumber = '1065';
  } else if (isSCorp) {
    taxFormNumber = '1120-S';
  } else if (isCorp) {
    taxFormNumber = '1120';
  } else {
    taxFormNumber = '1120';
  }
  
  return {
    // Company Information (Taxpayer)
    companyName: fields['Company Name'] || '',
    companyAddress: address.street,
    companyAddressLine2: address.addressLine2,
    companyCity: address.city,
    companyState: address.state,
    companyZip: address.zip,
    companyPhone: companyPhone,
    
    // Representative (Antonio Regojo)
    representativeName: 'ANTONIO REGOJO',
    representativeAddress: '10634 NE 11 AVE.',
    representativeCity: 'MIAMI',
    representativeState: 'FL',
    representativeZip: '33138',
    representativePhone: '786-512-0434',
    representativeFax: '866-496-4957',
    
    // Representative signature section (Page 2)
    representativeDesignation: 'A',
    representativeJurisdiction: 'FLORIDA',
    representativeLicenseNo: '41990',
    representativeSignature: '',
    representativeDate: '',
    
    // Authorization details - Section 3
    authorizedType: 'INCOME TAX',
    authorizedForm: taxFormNumber,
    authorizedYear: formationYear,
    
    // EIN | SS4 | Year
    ein: '',
    ss4: 'SS-4',
    formationYear: formationYear,
    
    // Signature information (Section 7)
    signatureName: responsibleParty.name || fields['Owner 1 Name'] || '',
    signatureTitle: responsibleParty.title || 'AUTHORIZED SIGNER',
    signatureCompanyName: fields['Company Name'] || '',
  };
}

/**
 * Map Airtable record to Form 8821 (Tax Information Authorization) format
 */
export function mapAirtableTo8821(record: any): any {
  const fields = record.fields || record;
  const entityType = fields['Entity Type'] || 'LLC';
  const isLLC = entityType === 'LLC';
  const isCorp = entityType === 'C-Corp' || entityType === 'S-Corp';
  const ownerCount = fields['Owner Count'] || 0;
  
  // Get responsible party (same logic as SS-4)
  const responsibleParty = getResponsiblePartyFromAirtable(fields);
  
  // Parse company address
  const address = parseCompanyAddress(fields);
  
  // Get company phone
  const companyPhone = (fields['Business Phone'] || '').trim();
  
  // Determine signature title
  let signatureTitle = '';
  if (isCorp) {
    signatureTitle = 'PRESIDENT';
  } else if (isLLC && ownerCount === 1) {
    signatureTitle = 'SOLE MEMBER';
  } else if (isLLC) {
    signatureTitle = 'MEMBER';
  } else {
    signatureTitle = 'AUTHORIZED SIGNER';
  }
  
  return {
    // Company Information
    companyName: fields['Company Name'] || '',
    ein: '',
    companyAddress: address.street,
    
    // Box 1: Taxpayer (COMPANY)
    taxpayerName: fields['Company Name'] || '',
    taxpayerSSN: '',
    taxpayerAddress: address.street,
    taxpayerAddressLine2: '',
    taxpayerCity: address.city,
    taxpayerState: address.state,
    taxpayerZip: address.zip,
    taxpayerPhone: companyPhone,
    
    // Box 2: Third Party Designee (Antonio Regojo)
    designeeName: 'ANTONIO REGOJO',
    designeeAddress: '10634 NE 11 AVE.',
    designeeCity: 'MIAMI',
    designeeState: 'FL',
    designeeZip: '33138',
    designeePhone: '786-512-0434',
    designeeFax: '866-496-4957',
    
    // Authorization details - Section 3 always "N/A", Section 4 always checked
    taxInfo: 'N/A',
    taxForms: 'N/A',
    taxYears: 'N/A',
    taxMatters: 'N/A',
    
    // Signature information
    signatureName: responsibleParty.name || fields['Owner 1 Name'] || '',
    signatureTitle: responsibleParty.title || signatureTitle,
  };
}

/**
 * Map Airtable record to Membership Registry format (for LLCs)
 */
export function mapAirtableToMembershipRegistry(record: any): any {
  const fields = record.fields || record;
  const entityType = fields['Entity Type'] || 'LLC';
  
  if (entityType !== 'LLC') {
    throw new Error('Membership Registry is only for LLCs');
  }
  
  // Parse company address
  const address = parseCompanyAddress(fields);
  
  // Get company name
  const companyName = fields['Company Name'] || '';
  
  // Get formation state
  const formationState = fields['Formation State'] || '';
  
  // Get formation date (use Payment Date as proxy, or current date)
  const paymentDate = fields['Payment Date'];
  let formationDate = '';
  if (paymentDate) {
    // Format date as MM/DD/YYYY
    const date = new Date(paymentDate);
    if (!isNaN(date.getTime())) {
      formationDate = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    }
  }
  if (!formationDate) {
    // Use current date as fallback
    const now = new Date();
    formationDate = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  
  // Build full company address
  // Prefer parsed components, but if parsing fails (e.g. "New York New York 10001"),
  // fall back to the raw Airtable string so we don't drop city/state/zip.
  const rawCompanyAddress = (fields['Company Address'] || '').toString().trim();
  let companyAddress: string;

  if (address.city || address.state || address.zip) {
    const companyAddressParts = [
      address.street,
      address.city ? `${address.city}, ${address.state || ''} ${address.zip || ''}`.trim() : '',
    ].filter(Boolean);
    companyAddress = companyAddressParts.join('\n');
  } else if (rawCompanyAddress) {
    companyAddress = rawCompanyAddress;
  } else {
    const companyAddressParts = [
      address.street,
      address.city ? `${address.city}, ${address.state || ''} ${address.zip || ''}`.trim() : '',
    ].filter(Boolean);
    companyAddress = companyAddressParts.join('\n');
  }
  
  // Collect all members (owners)
  const members: Array<{
    name: string;
    address: string;
    ownershipPercent: number;
    ssn?: string;
  }> = [];
  
  // Count actual owners
  let actualOwnerCount = 0;
  for (let i = 1; i <= 6; i++) {
    const ownerName = fields[`Owner ${i} Name`] || '';
    if (ownerName && ownerName.trim() !== '') {
      actualOwnerCount++;
    }
  }
  const ownerCount = actualOwnerCount || fields['Owner Count'] || 0;
  
  // Collect member information
  for (let i = 1; i <= Math.min(ownerCount, 6); i++) {
    const ownerName = fields[`Owner ${i} Name`] || '';
    if (!ownerName || ownerName.trim() === '') continue;
    
    let ownershipPercent = fields[`Owner ${i} Ownership %`] || 0;
    // If ownership is stored as decimal (0-1), convert to percentage
    // Handle both 0-1 range (decimal) and 0-100 range (percentage)
    if (ownershipPercent > 0 && ownershipPercent <= 1) {
      ownershipPercent = ownershipPercent * 100;
    }
    
    const ownerAddress = formatAddress(fields[`Owner ${i} Address`] || '');
    const ownerSSN = fields[`Owner ${i} SSN`] || '';
    
    members.push({
      name: ownerName.trim(),
      address: ownerAddress,
      ownershipPercent: ownershipPercent,
      ssn: ownerSSN && ownerSSN.toUpperCase() !== 'N/A' && !ownerSSN.toUpperCase().includes('FOREIGN') ? ownerSSN : undefined,
    });
  }
  
  // Sort members by ownership percentage (descending)
  members.sort((a, b) => b.ownershipPercent - a.ownershipPercent);
  
  // Collect all managers
  const managers: Array<{
    name: string;
    address: string;
  }> = [];
  
  // Count actual managers
  let actualManagerCount = 0;
  for (let i = 1; i <= 6; i++) {
    const managerName = fields[`Manager ${i} Name`] || '';
    if (managerName && managerName.trim() !== '') {
      actualManagerCount++;
    }
  }
  const managerCount = actualManagerCount || fields['Managers Count'] || 0;
  
  // Collect manager information
  for (let i = 1; i <= Math.min(managerCount, 6); i++) {
    const managerName = fields[`Manager ${i} Name`] || '';
    if (!managerName || managerName.trim() === '') continue;
    
    const managerAddress = formatAddress(fields[`Manager ${i} Address`] || '');
    
    managers.push({
      name: managerName.trim(),
      address: managerAddress,
    });
  }
  
  return {
    companyName: companyName,
    companyAddress: companyAddress,
    formationState: formationState,
    formationDate: formationDate,
    members: members,
    managers: managers,
    memberCount: members.length,
    managerCount: managers.length,
  };
}

/**
 * Get the template path for Membership Registry based on member and manager counts
 * 
 * ACTUAL S3 STRUCTURE (from AWS Console):
 * Bucket: company-formation-template-llc-and-inc
 * Base Path: llc-formation-templates/membership-registry-all-templates/
 * 
 * Structure:
 * - Folders by member count: membership-registry-{N}-member/ (singular) or membership-registry-{N}-members/ (plural)
 * - Files inside: Template Membership Registry_{N} Members_{M} Manager.docx
 * 
 * Examples:
 * - 1 member, 1 manager: 
 *   llc-formation-templates/membership-registry-all-templates/membership-registry-1-member/Template Membership Registry_1 Members_1 Manager.docx
 * - 2 members, 3 managers:
 *   llc-formation-templates/membership-registry-all-templates/membership-registry-2-members/Template Membership Registry_2 Members_3 Manager.docx
 */
export function getMembershipRegistryTemplateName(memberCount: number, managerCount: number): string {
  // Cap at 6 for both members and managers (max supported)
  const members = Math.min(Math.max(memberCount, 1), 6);
  const managers = Math.min(Math.max(managerCount, 0), 6);
  
  // Folder name: membership-registry-{N}-member (singular) or membership-registry-{N}-members/ (plural)
  const folderName = members === 1 
    ? 'membership-registry-1-member'
    : `membership-registry-${members}-members`;
  
  // File name: Template Membership Registry_{N} Members_{M} Manager.docx
  const fileName = `Template Membership Registry_${members} Members_${managers} Manager.docx`;
  
  // Full path
  return `llc-formation-templates/membership-registry-all-templates/${folderName}/${fileName}`;
}

/**
 * Get the template path for Organizational Resolution based on member and manager counts
 * 
 * S3 STRUCTURE:
 * Bucket: company-formation-template-llc-and-inc
 * Base Path: llc-formation-templates/organizational-resolution-all-templates/
 * 
 * Structure:
 * - Folders: Template Organization Resolution_{N} Member/ or Template Organization Resolution_{N} Members/
 * - Files: Template Organization Resolution_{N} Members_{M} Manager.docx
 * 
 * Examples:
 * - 1 member, 1 manager:
 *   llc-formation-templates/organizational-resolution-all-templates/Template Organization Resolution_1 Member/Template Organization Resolution_1 Member_1 Manager.docx
 * - 2 members, 3 managers:
 *   llc-formation-templates/organizational-resolution-all-templates/Template Organization Resolution_2 Members/Template Organization Resolution_2 Members_3 Managers.docx
 */
export function getOrganizationalResolutionTemplateName(memberCount: number, managerCount: number): string {
  const members = Math.min(Math.max(memberCount, 1), 6);
  const managers = Math.min(Math.max(managerCount, 0), 6);
  
  // Folder name: Template Organization Resolution_{N} Member (singular) or Template Organization Resolution_{N} Members (plural)
  const folderName = members === 1
    ? 'Template Organization Resolution_1 Member'
    : `Template Organization Resolution_${members} Members`;
  
  // File name pattern:
  // - Member/Members follows pluralization based on member count
  // - Manager/Managers is PLURAL only for 2+ managers when members >= 2
  //   (for 1-member templates, S3 uses "Manager" even for 2+ managers)
  const memberWord = members === 1 ? 'Member' : 'Members';
  const managerWord =
    members === 1
      ? 'Manager'
      : managers === 1
        ? 'Manager'
        : 'Managers';
  const fileName = `Template Organization Resolution_${members} ${memberWord}_${managers} ${managerWord}.docx`;
  
  return `llc-formation-templates/organizational-resolution-all-templates/${folderName}/${fileName}`;
}

/**
 * Helper function to format address
 */
function formatAddress(address: string): string {
  if (!address || address.trim() === '') {
    return '';
  }
  return address.trim();
}
