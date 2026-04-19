// Smoke test: county-lookup local map + parseAddress + resolveCounty.
import { parseAddress, lookupCountyLocal, resolveCounty } from "../src/lib/county-lookup";

async function main() {
  const cases: Array<[string, string]> = [
    ["200 S Biscayne Blvd, Miami, FL 33131",   "MIAMI-DADE"],
    ["100 Main St, Orlando, FL 32801",         "ORANGE"],
    ["55 Water St, Brooklyn, NY 11201",        "KINGS"],
    ["123 Market St, San Francisco, CA 94103", "SAN FRANCISCO"],
    ["1600 Amphitheatre Pkwy, Mountain View, CA 94043", "SANTA CLARA"],
    ["1 Space Center Blvd, Houston, TX 77058", "HARRIS"],
    ["500 Michigan Ave, Chicago, IL 60611",    "COOK"],
    ["1 Downtown Plaza, Phoenix, AZ 85004",    "MARICOPA"],
    ["77 Main St, Westminster, CO 80030",      ""], // not in local map
  ];
  let fails = 0;
  for (const [addr, expected] of cases) {
    const parsed = parseAddress(addr);
    const localHit = lookupCountyLocal(parsed.city, parsed.state);
    const ok = localHit === expected || (expected === "" && localHit === "");
    console.log(`${ok ? "OK" : "FAIL"} "${addr}"`);
    console.log(`   parsed=${JSON.stringify(parsed)}  local="${localHit}"  expected="${expected}"`);
    if (!ok) fails++;
  }

  const r = await resolveCounty({ airtableCounty: "Broward County", city: "Miami", state: "FL" });
  const overrideOk = r.county === "Broward" && r.source === "airtable";
  console.log(`${overrideOk ? "OK" : "FAIL"} Airtable override: "${r.county}" source=${r.source}`);
  if (!overrideOk) fails++;

  const r2 = await resolveCounty({ address: "200 S Biscayne Blvd, Miami, FL 33131" });
  const addrOk = r2.county === "MIAMI-DADE" && r2.source === "local-map";
  console.log(`${addrOk ? "OK" : "FAIL"} Address-only: "${r2.county}" source=${r2.source}`);
  if (!addrOk) fails++;

  console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL"}`);
  process.exit(fails);
}

main().catch((err) => { console.error(err); process.exit(1); });
