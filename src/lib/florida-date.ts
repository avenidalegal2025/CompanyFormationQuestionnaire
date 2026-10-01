// The company is formed in Florida and SunBiz records the filing in Florida
// time. Every "today" that lands in a document or in Airtable's Payment Date
// must be that same calendar day — new Date().toISOString() is UTC, which
// from 8 pm Eastern (EDT; 7 pm EST) to midnight is already tomorrow, so a
// payment in that window was dated a day ahead of the SunBiz filing.
export const FILING_TIME_ZONE = "America/New_York";

/** Today's date in Florida as YYYY-MM-DD. */
export function floridaToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FILING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
