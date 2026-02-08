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
