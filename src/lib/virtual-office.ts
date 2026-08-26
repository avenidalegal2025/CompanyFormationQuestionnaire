/**
 * Avenida Legal's virtual-office address.
 *
 * This is substituted as the CLIENT's principal place of business whenever the
 * client has no US address (`hasUsAddress === false`). It therefore lands on
 * real filings: the Operating / Shareholders Agreement, the Airtable
 * `Company Address` field, and the SS-4 and related PDFs.
 *
 * It used to be copy-pasted across five modules, which meant a move required
 * finding all five. It lives here now. To change the address, edit these
 * defaults or set the VIRTUAL_OFFICE_* environment variables.
 */
export const VIRTUAL_OFFICE = {
  line1: process.env.VIRTUAL_OFFICE_LINE1 || '12550 Biscayne Blvd Ste 110',
  line2: process.env.VIRTUAL_OFFICE_LINE2 || '',
  city: process.env.VIRTUAL_OFFICE_CITY || 'North Miami',
  state: process.env.VIRTUAL_OFFICE_STATE || 'FL',
  zip: process.env.VIRTUAL_OFFICE_ZIP || '33181',
} as const;

/** Single-line form, e.g. "12550 Biscayne Blvd Ste 110, North Miami, FL 33181". */
export const VIRTUAL_OFFICE_FULL = `${VIRTUAL_OFFICE.line1}, ${VIRTUAL_OFFICE.city}, ${VIRTUAL_OFFICE.state} ${VIRTUAL_OFFICE.zip}`;
