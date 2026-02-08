export function sanitizeCompanyNameForFile(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80);
  return cleaned || 'Company';
}

export function formatCompanyDocumentTitle(companyName: string, descriptor: string): string {
  const safeName = sanitizeCompanyNameForFile(companyName);
  const safeDescriptor = descriptor.trim();
  return `${safeName} - ${safeDescriptor}`;
}

export function formatCompanyFileName(
  companyName: string,
  descriptor: string,
  extension: string
): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${formatCompanyDocumentTitle(companyName, descriptor)}${ext}`;
}

/**
 * For client dashboard display only: return just the document type (e.g. "Membership Registry")
 * when the full name is "Company Name - Document Type". Download filenames stay full; cards show type only.
 */
export function getDocumentTypeDisplayName(fullName: string): string {
  if (!fullName || typeof fullName !== 'string') return fullName || '';
  const sep = ' - ';
  const i = fullName.indexOf(sep);
  return i >= 0 ? fullName.slice(i + sep.length).trim() : fullName;
}
