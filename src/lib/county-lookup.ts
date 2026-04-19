/**
 * County resolver — ports the SS-4 Lambda's `city_to_county()` logic to TypeScript
 * so the agreement-docgen, admin tooling, and any other TS code can resolve a
 * county from a company address *without* round-tripping through a Python Lambda.
 *
 * Resolution order (same as SS-4 Lambda):
 *   1. Explicit `airtableCounty` override (if provided)
 *   2. Local city→county table (covers FL, NY, CA, TX, IL, AZ)
 *   3. Google Maps Geocoding API (server-side fetch, needs
 *      GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
 *   4. Empty string — we NEVER fabricate a county from the city name.
 *
 * Keep the local map in sync with `lambda-functions/ss4_lambda_s3_complete.py`
 * (`city_county_map`).
 */

// ── State name → 2-letter code ──────────────────────────────────────────────
const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR",
  CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID",
  ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS",
  KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
  MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS",
  MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
  VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
  WISCONSIN: "WI", WYOMING: "WY", "DISTRICT OF COLUMBIA": "DC",
  "PUERTO RICO": "PR", "VIRGIN ISLANDS": "VI", GUAM: "GU",
  "AMERICAN SAMOA": "AS", "NORTHERN MARIANA ISLANDS": "MP",
};

// ── City → County map ───────────────────────────────────────────────────────
// Key format: "CITY|STATE_CODE" (all upper-case). Value: county name (no "County" suffix).
const CITY_COUNTY_MAP: Record<string, string> = {
  // ─── Florida ─────────────────────────────────────────────────────────
  "MIAMI|FL": "MIAMI-DADE",
  "MIAMI BEACH|FL": "MIAMI-DADE",
  "MIAMI GARDENS|FL": "MIAMI-DADE",
  "CORAL GABLES|FL": "MIAMI-DADE",
  "HIALEAH|FL": "MIAMI-DADE",
  "NORTH MIAMI|FL": "MIAMI-DADE",
  "AVENTURA|FL": "MIAMI-DADE",
  "KEY BISCAYNE|FL": "MIAMI-DADE",
  "HOMESTEAD|FL": "MIAMI-DADE",
  "KENDALL|FL": "MIAMI-DADE",
  "DORAL|FL": "MIAMI-DADE",
  "ORLANDO|FL": "ORANGE",
  "TAMPA|FL": "HILLSBOROUGH",
  "JACKSONVILLE|FL": "DUVAL",
  "FORT LAUDERDALE|FL": "BROWARD",
  "WEST PALM BEACH|FL": "PALM BEACH",
  "PALM BEACH|FL": "PALM BEACH",
  "BOCA RATON|FL": "PALM BEACH",
  "DELRAY BEACH|FL": "PALM BEACH",
  "ST. PETERSBURG|FL": "PINELLAS",
  "SAINT PETERSBURG|FL": "PINELLAS",
  "ST PETERSBURG|FL": "PINELLAS",
  "CLEARWATER|FL": "PINELLAS",
  "LARGO|FL": "PINELLAS",
  "TALLAHASSEE|FL": "LEON",
  "GAINESVILLE|FL": "ALACHUA",
  "SARASOTA|FL": "SARASOTA",
  "NAPLES|FL": "COLLIER",
  "FORT MYERS|FL": "LEE",
  "CAPE CORAL|FL": "LEE",
  "PENSACOLA|FL": "ESCAMBIA",
  "DAYTONA BEACH|FL": "VOLUSIA",
  "DELTONA|FL": "VOLUSIA",
  "MELBOURNE|FL": "BREVARD",
  "LAKELAND|FL": "POLK",
  "OCALA|FL": "MARION",
  "PORT ST. LUCIE|FL": "ST. LUCIE",
  "PORT SAINT LUCIE|FL": "ST. LUCIE",
  "PORT ST LUCIE|FL": "ST. LUCIE",
  "FORT PIERCE|FL": "ST. LUCIE",
  "BOYNTON BEACH|FL": "PALM BEACH",
  "POMPANO BEACH|FL": "BROWARD",
  "HOLLYWOOD|FL": "BROWARD",
  "MIRAMAR|FL": "BROWARD",
  "PLANTATION|FL": "BROWARD",
  "SUNRISE|FL": "BROWARD",
  "WESTON|FL": "BROWARD",
  "DEERFIELD BEACH|FL": "BROWARD",
  "PEMBROKE PINES|FL": "BROWARD",
  "PALM COAST|FL": "FLAGLER",
  "STUART|FL": "MARTIN",
  "VERO BEACH|FL": "INDIAN RIVER",
  "SEBASTIAN|FL": "INDIAN RIVER",
  "JUPITER|FL": "PALM BEACH",
  "TEQUESTA|FL": "PALM BEACH",
  "WELLINGTON|FL": "PALM BEACH",
  "ROYAL PALM BEACH|FL": "PALM BEACH",
  "RIVIERA BEACH|FL": "PALM BEACH",
  "LAKE WORTH|FL": "PALM BEACH",
  "GREENACRES|FL": "PALM BEACH",
  "WEST PALM|FL": "PALM BEACH",

  // ─── New York ────────────────────────────────────────────────────────
  "NEW YORK|NY": "NEW YORK",
  "BROOKLYN|NY": "KINGS",
  "MANHATTAN|NY": "NEW YORK",
  "QUEENS|NY": "QUEENS",
  "BRONX|NY": "BRONX",
  "THE BRONX|NY": "BRONX",
  "STATEN ISLAND|NY": "RICHMOND",
  "BUFFALO|NY": "ERIE",
  "ROCHESTER|NY": "MONROE",
  "ALBANY|NY": "ALBANY",
  "SYRACUSE|NY": "ONONDAGA",
  "YONKERS|NY": "WESTCHESTER",
  "WHITE PLAINS|NY": "WESTCHESTER",
  "MOUNT VERNON|NY": "WESTCHESTER",
  "NEW ROCHELLE|NY": "WESTCHESTER",
  "RYE|NY": "WESTCHESTER",
  "SCARSDALE|NY": "WESTCHESTER",

  // ─── California ──────────────────────────────────────────────────────
  "LOS ANGELES|CA": "LOS ANGELES",
  "SAN FRANCISCO|CA": "SAN FRANCISCO",
  "SAN DIEGO|CA": "SAN DIEGO",
  "SAN JOSE|CA": "SANTA CLARA",
  "OAKLAND|CA": "ALAMEDA",
  "SACRAMENTO|CA": "SACRAMENTO",
  "FRESNO|CA": "FRESNO",
  "LONG BEACH|CA": "LOS ANGELES",
  "ANAHEIM|CA": "ORANGE",
  "SANTA ANA|CA": "ORANGE",
  "RIVERSIDE|CA": "RIVERSIDE",
  "STOCKTON|CA": "SAN JOAQUIN",
  "IRVINE|CA": "ORANGE",
  "CHULA VISTA|CA": "SAN DIEGO",
  "FREMONT|CA": "ALAMEDA",
  "SAN BERNARDINO|CA": "SAN BERNARDINO",
  "MODESTO|CA": "STANISLAUS",
  "FONTANA|CA": "SAN BERNARDINO",
  "OXNARD|CA": "VENTURA",
  "MORENO VALLEY|CA": "RIVERSIDE",
  "HUNTINGTON BEACH|CA": "ORANGE",
  "GLENDALE|CA": "LOS ANGELES",
  "SANTA CLARITA|CA": "LOS ANGELES",
  "GARDEN GROVE|CA": "ORANGE",
  "OCEANSIDE|CA": "SAN DIEGO",
  "RANCHO CUCAMONGA|CA": "SAN BERNARDINO",
  "SANTA ROSA|CA": "SONOMA",
  "ONTARIO|CA": "SAN BERNARDINO",
  "LANCASTER|CA": "LOS ANGELES",
  "ELK GROVE|CA": "SACRAMENTO",
  "CORONA|CA": "RIVERSIDE",
  "PALMDALE|CA": "LOS ANGELES",
  "SALINAS|CA": "MONTEREY",
  "POMONA|CA": "LOS ANGELES",
  "HAYWARD|CA": "ALAMEDA",
  "ESCONDIDO|CA": "SAN DIEGO",
  "TORRANCE|CA": "LOS ANGELES",
  "SUNNYVALE|CA": "SANTA CLARA",
  "ORANGE|CA": "ORANGE",
  "FULLERTON|CA": "ORANGE",
  "PASADENA|CA": "LOS ANGELES",
  "THOUSAND OAKS|CA": "VENTURA",
  "VISALIA|CA": "TULARE",
  "SIMI VALLEY|CA": "VENTURA",
  "CONCORD|CA": "CONTRA COSTA",
  "ROSEVILLE|CA": "PLACER",
  "VALLEJO|CA": "SOLANO",
  "VICTORVILLE|CA": "SAN BERNARDINO",
  "EL MONTE|CA": "LOS ANGELES",
  "BERKELEY|CA": "ALAMEDA",
  "DOWNEY|CA": "LOS ANGELES",
  "COSTA MESA|CA": "ORANGE",
  "INGLEWOOD|CA": "LOS ANGELES",
  "VENTURA|CA": "VENTURA",
  "WEST COVINA|CA": "LOS ANGELES",
  "NORWALK|CA": "LOS ANGELES",
  "CARLSBAD|CA": "SAN DIEGO",
  "FAIRFIELD|CA": "SOLANO",
  "RICHMOND|CA": "CONTRA COSTA",
  "MURRIETA|CA": "RIVERSIDE",
  "ANTIOCH|CA": "CONTRA COSTA",
  "DAILY CITY|CA": "SAN MATEO",
  "TEMECULA|CA": "RIVERSIDE",
  "SANTA MARIA|CA": "SANTA BARBARA",
  "EL CAJON|CA": "SAN DIEGO",
  "RIALTO|CA": "SAN BERNARDINO",
  "SAN MATEO|CA": "SAN MATEO",
  "COMPTON|CA": "LOS ANGELES",
  "JURUPA VALLEY|CA": "RIVERSIDE",
  "VISTA|CA": "SAN DIEGO",
  "SOUTH GATE|CA": "LOS ANGELES",
  "MISSION VIEJO|CA": "ORANGE",
  "VACAVILLE|CA": "SOLANO",
  "CARSON|CA": "LOS ANGELES",
  "HESPERIA|CA": "SAN BERNARDINO",
  "SANTA MONICA|CA": "LOS ANGELES",
  "WESTMINSTER|CA": "ORANGE",
  "REDDING|CA": "SHASTA",
  "SANTA BARBARA|CA": "SANTA BARBARA",
  "CHICO|CA": "BUTTE",
  "NEWPORT BEACH|CA": "ORANGE",
  "SAN LEANDRO|CA": "ALAMEDA",
  "HAWTHORNE|CA": "LOS ANGELES",
  "CITRUS HEIGHTS|CA": "SACRAMENTO",
  "ALHAMBRA|CA": "LOS ANGELES",
  "LAKE FOREST|CA": "ORANGE",
  "TRACY|CA": "SAN JOAQUIN",
  "REDWOOD CITY|CA": "SAN MATEO",
  "BELLFLOWER|CA": "LOS ANGELES",
  "CHINO HILLS|CA": "SAN BERNARDINO",
  "LAKEWOOD|CA": "LOS ANGELES",
  "HEMET|CA": "RIVERSIDE",
  "MENIFEE|CA": "RIVERSIDE",
  "LYNWOOD|CA": "LOS ANGELES",
  "MANTECA|CA": "SAN JOAQUIN",
  "NAPA|CA": "NAPA",
  "REDONDO BEACH|CA": "LOS ANGELES",
  "CHINO|CA": "SAN BERNARDINO",
  "TULARE|CA": "TULARE",
  "MADERA|CA": "MADERA",
  "SANTA CLARA|CA": "SANTA CLARA",
  "SAN BRUNO|CA": "SAN MATEO",
  "SAN RAFAEL|CA": "MARIN",
  "WHITTIER|CA": "LOS ANGELES",
  "NEWARK|CA": "ALAMEDA",
  "SOUTH SAN FRANCISCO|CA": "SAN MATEO",
  "ALAMEDA|CA": "ALAMEDA",
  "TURLOCK|CA": "STANISLAUS",
  "PERRIS|CA": "RIVERSIDE",
  "MILPITAS|CA": "SANTA CLARA",
  "MOUNTAIN VIEW|CA": "SANTA CLARA",
  "BUENA PARK|CA": "ORANGE",
  "PALO ALTO|CA": "SANTA CLARA",
  "SANTA CRUZ|CA": "SANTA CRUZ",
  "EUREKA|CA": "HUMBOLDT",
  "BARSTOW|CA": "SAN BERNARDINO",
  "YUBA CITY|CA": "SUTTER",
  "SAN LUIS OBISPO|CA": "SAN LUIS OBISPO",
  "HANFORD|CA": "KINGS",
  "MERCED|CA": "MERCED",

  // ─── Texas ───────────────────────────────────────────────────────────
  "HOUSTON|TX": "HARRIS",
  "SAN ANTONIO|TX": "BEXAR",
  "DALLAS|TX": "DALLAS",
  "AUSTIN|TX": "TRAVIS",
  "FORT WORTH|TX": "TARRANT",
  "EL PASO|TX": "EL PASO",
  "ARLINGTON|TX": "TARRANT",
  "CORPUS CHRISTI|TX": "NUECES",
  "PLANO|TX": "COLLIN",
  "LAREDO|TX": "WEBB",
  "LUBBOCK|TX": "LUBBOCK",
  "GARLAND|TX": "DALLAS",
  "IRVING|TX": "DALLAS",
  "AMARILLO|TX": "POTTER",
  "GRAND PRAIRIE|TX": "DALLAS",
  "BROWNSVILLE|TX": "CAMERON",
  "MCKINNEY|TX": "COLLIN",
  "FRISCO|TX": "COLLIN",
  "PASADENA|TX": "HARRIS",
  "KILLEEN|TX": "BELL",
  "MESQUITE|TX": "DALLAS",
  "MCALLEN|TX": "HIDALGO",
  "CARROLLTON|TX": "DALLAS",
  "MIDLAND|TX": "MIDLAND",
  "DENTON|TX": "DENTON",
  "ABILENE|TX": "TAYLOR",
  "ROUND ROCK|TX": "WILLIAMSON",
  "ODESSA|TX": "ECTOR",
  "WACO|TX": "MCLENNAN",
  "RICHARDSON|TX": "DALLAS",
  "LEWISVILLE|TX": "DENTON",
  "TYLER|TX": "SMITH",
  "COLLEGE STATION|TX": "BRAZOS",
  "SAN ANGELO|TX": "TOM GREEN",
  "ALLEN|TX": "COLLIN",
  "SUGAR LAND|TX": "FORT BEND",
  "WICHITA FALLS|TX": "WICHITA",
  "LONGVIEW|TX": "GREGG",
  "MISSION|TX": "HIDALGO",
  "EDINBURG|TX": "HIDALGO",
  "BRYAN|TX": "BRAZOS",
  "BAYTOWN|TX": "HARRIS",
  "PHARR|TX": "HIDALGO",
  "TEMPLE|TX": "BELL",
  "MISSOURI CITY|TX": "FORT BEND",
  "FLOWER MOUND|TX": "DENTON",
  "HARLINGEN|TX": "CAMERON",
  "NORTH RICHLAND HILLS|TX": "TARRANT",
  "VICTORIA|TX": "VICTORIA",
  "CONROE|TX": "MONTGOMERY",
  "NEW BRAUNFELS|TX": "COMAL",
  "MANSFIELD|TX": "TARRANT",
  "ROWLETT|TX": "DALLAS",
  "WESLACO|TX": "HIDALGO",
  "PORT ARTHUR|TX": "JEFFERSON",
  "GALVESTON|TX": "GALVESTON",
  "BEAUMONT|TX": "JEFFERSON",
  "ORANGE|TX": "ORANGE",
  "TEXAS CITY|TX": "GALVESTON",
  "LAKE JACKSON|TX": "BRAZORIA",
  "FRIENDSWOOD|TX": "GALVESTON",
  "LEAGUE CITY|TX": "GALVESTON",
  "PEARLAND|TX": "BRAZORIA",
  "ALVIN|TX": "BRAZORIA",
  "ANGLETON|TX": "BRAZORIA",
  "ROSENBERG|TX": "FORT BEND",
  "RICHMOND|TX": "FORT BEND",
  "STAFFORD|TX": "FORT BEND",
  "FULSHEAR|TX": "FORT BEND",
  "KATY|TX": "HARRIS",
  "CYPRESS|TX": "HARRIS",
  "SPRING|TX": "HARRIS",
  "THE WOODLANDS|TX": "MONTGOMERY",
  "MAGNOLIA|TX": "MONTGOMERY",
  "TOMBALL|TX": "HARRIS",
  "HUMBLE|TX": "HARRIS",
  "KINGWOOD|TX": "HARRIS",
  "ATASCOCITA|TX": "HARRIS",
  "CLEAR LAKE|TX": "HARRIS",
  "WEBSTER|TX": "HARRIS",
  "SEABROOK|TX": "HARRIS",
  "KEMAH|TX": "GALVESTON",
  "DICKINSON|TX": "GALVESTON",

  // ─── Illinois ────────────────────────────────────────────────────────
  "CHICAGO|IL": "COOK",
  "AURORA|IL": "KANE",
  "NAPERVILLE|IL": "DUPAGE",
  "JOLIET|IL": "WILL",
  "ROCKFORD|IL": "WINNEBAGO",
  "ELGIN|IL": "KANE",
  "PEORIA|IL": "PEORIA",
  "WAUKEGAN|IL": "LAKE",
  "CICERO|IL": "COOK",
  "BLOOMINGTON|IL": "MCLEAN",
  "ARLINGTON HEIGHTS|IL": "COOK",
  "EVANSTON|IL": "COOK",
  "DECATUR|IL": "MACON",
  "SCHAUMBURG|IL": "COOK",
  "BOLINGBROOK|IL": "WILL",
  "PALATINE|IL": "COOK",
  "SKOKIE|IL": "COOK",
  "DES PLAINES|IL": "COOK",
  "ORLAND PARK|IL": "COOK",
  "TINLEY PARK|IL": "COOK",
  "OAK LAWN|IL": "COOK",
  "BERWYN|IL": "COOK",
  "MOUNT PROSPECT|IL": "COOK",
  "NORMAL|IL": "MCLEAN",
  "WHEATON|IL": "DUPAGE",
  "HOFFMAN ESTATES|IL": "COOK",
  "OAK PARK|IL": "COOK",
  "DOWNERS GROVE|IL": "DUPAGE",
  "ELMHURST|IL": "DUPAGE",
  "GLENVIEW|IL": "COOK",
  "DEKALB|IL": "DEKALB",
  "LOMBARD|IL": "DUPAGE",
  "BUFFALO GROVE|IL": "COOK",
  "BARTLETT|IL": "DUPAGE",
  "CRYSTAL LAKE|IL": "MCHENRY",
  "PARK RIDGE|IL": "COOK",
  "PLAINFIELD|IL": "WILL",
  "HANOVER PARK|IL": "COOK",
  "CARPENTERSVILLE|IL": "KANE",
  "WHEELING|IL": "COOK",
  "NORTHBROOK|IL": "COOK",
  "ST. CHARLES|IL": "KANE",
  "ST CHARLES|IL": "KANE",
  "SAINT CHARLES|IL": "KANE",
  "GENEVA|IL": "KANE",
  "BATAVIA|IL": "KANE",
  "MONTGOMERY|IL": "KENDALL",
  "OSWEGO|IL": "KENDALL",
  "YORKVILLE|IL": "KENDALL",

  // ─── Arizona ─────────────────────────────────────────────────────────
  "PHOENIX|AZ": "MARICOPA",
  "TUCSON|AZ": "PIMA",
  "MESA|AZ": "MARICOPA",
  "CHANDLER|AZ": "MARICOPA",
  "SCOTTSDALE|AZ": "MARICOPA",
  "GLENDALE|AZ": "MARICOPA",
  "GILBERT|AZ": "MARICOPA",
  "TEMPE|AZ": "MARICOPA",
  "PEORIA|AZ": "MARICOPA",
  "SURPRISE|AZ": "MARICOPA",
  "YUMA|AZ": "YUMA",
  "FLAGSTAFF|AZ": "COCONINO",
  "SEDONA|AZ": "YAVAPAI",
  "PRESCOTT|AZ": "YAVAPAI",
  "LAKE HAVASU CITY|AZ": "MOHAVE",
  "BULLHEAD CITY|AZ": "MOHAVE",
  "KINGMAN|AZ": "MOHAVE",
  "NOGALES|AZ": "SANTA CRUZ",
  "SIERRA VISTA|AZ": "COCHISE",
  "DOUGLAS|AZ": "COCHISE",
  "BISBEE|AZ": "COCHISE",
  "PAYSON|AZ": "GILA",
  "GLOBE|AZ": "GILA",
  "SHOW LOW|AZ": "NAVAJO",
  "HOLBROOK|AZ": "NAVAJO",
  "WINSLOW|AZ": "NAVAJO",
  "PAGE|AZ": "COCONINO",
  "WILLIAMS|AZ": "COCONINO",
};

// ── Public types ────────────────────────────────────────────────────────────
export interface ParsedAddress {
  line1: string;
  city: string;
  state: string;   // 2-letter code (uppercase) when recognized; else uppercase input
  zip: string;
}

export interface CountyResolution {
  county: string;  // e.g. "MIAMI-DADE" — empty string if unresolved
  stateCode: string; // 2-letter code; empty if unknown
  source: "airtable" | "local-map" | "google-maps" | "none";
}

// ── Address parsing ─────────────────────────────────────────────────────────
/**
 * Parse an address string into components. Handles common formats:
 *   - "123 Main St, City, ST 33131"
 *   - "123 Main St, Suite 100, City, ST 33131"
 *   - "123 Main St, City, State ZIP"  (full state name)
 */
export function parseAddress(addressStr: string | undefined | null): ParsedAddress {
  const empty: ParsedAddress = { line1: "", city: "", state: "", zip: "" };
  if (!addressStr) return empty;

  const parts = addressStr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { ...empty, line1: addressStr.trim() };
  }

  // Last part should contain "STATE ZIP" or "State ZIP" or just "STATE"
  const lastPart = parts[parts.length - 1];

  // Try 2-letter code first
  let stateMatch = lastPart.match(/\b([A-Za-z]{2})\b\s*(\d{5}(?:-\d{4})?)?/);
  let stateCode = "";
  let zip = "";

  if (stateMatch && stateMatch[1].length === 2) {
    stateCode = stateMatch[1].toUpperCase();
    zip = stateMatch[2] || "";
  } else {
    // Try full state name: "Florida 33131" or just "Florida"
    const upper = lastPart.toUpperCase().trim();
    const zipMatch = upper.match(/(\d{5}(?:-\d{4})?)\s*$/);
    if (zipMatch) zip = zipMatch[1];
    const stateNameOnly = upper.replace(/\d{5}(?:-\d{4})?\s*$/, "").trim();
    if (STATE_NAME_TO_CODE[stateNameOnly]) {
      stateCode = STATE_NAME_TO_CODE[stateNameOnly];
    } else {
      stateCode = stateNameOnly; // preserve whatever the user wrote
    }
  }

  const city = (parts[parts.length - 2] || "").trim();
  const line1 = parts[0] || "";

  return { line1, city, state: stateCode, zip };
}

// ── Local city→county lookup ────────────────────────────────────────────────
/**
 * Look up a county in the local map only (synchronous). Returns "" if not found.
 * Accepts either a 2-letter state code or a full state name.
 */
export function lookupCountyLocal(city: string, state: string): string {
  if (!city || !state) return "";
  const cityUpper = city.toUpperCase().trim();
  const stateUpper = state.toUpperCase().trim();
  const stateCode = STATE_NAME_TO_CODE[stateUpper] || stateUpper;
  return CITY_COUNTY_MAP[`${cityUpper}|${stateCode}`] || "";
}

// ── Google Maps fallback ────────────────────────────────────────────────────
/**
 * Query the Google Maps Geocoding API for the administrative_area_level_2
 * (county) of a city/state pair. Returns the county name (without "County"
 * suffix) or null on any failure.
 *
 * Requires GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in env.
 */
export async function getCountyFromGoogleMaps(
  city: string,
  state: string,
): Promise<string | null> {
  if (!city || !state) return null;

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn(
      "[county-lookup] No GOOGLE_MAPS_API_KEY set — skipping Google fallback",
    );
    return null;
  }

  try {
    const url =
      "https://maps.googleapis.com/maps/api/geocode/json" +
      `?address=${encodeURIComponent(`${city}, ${state}`)}` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[county-lookup] Google Maps API HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      status: string;
      results?: Array<{
        address_components?: Array<{ long_name: string; types: string[] }>;
      }>;
    };
    if (data.status !== "OK" || !data.results?.length) {
      console.warn(
        `[county-lookup] Google Maps returned '${data.status}' for '${city}, ${state}'`,
      );
      return null;
    }
    for (const comp of data.results[0].address_components ?? []) {
      if (comp.types.includes("administrative_area_level_2")) {
        // Strip trailing " County" if present
        return comp.long_name.replace(/\s+County$/i, "").trim();
      }
    }
    return null;
  } catch (err) {
    console.error("[county-lookup] Google Maps fetch failed:", err);
    return null;
  }
}

// ── Main resolver ───────────────────────────────────────────────────────────
export interface ResolveCountyInput {
  /** Pre-existing value (e.g. from an Airtable "County" column). If non-empty, wins. */
  airtableCounty?: string | null;
  /** Full address string like "200 S Biscayne Blvd, Miami, FL 33131". */
  address?: string | null;
  /** Or pre-parsed city + state (2-letter code or full name). */
  city?: string | null;
  state?: string | null;
}

/**
 * Resolve a county using the same 3-tier fallback the SS-4 Lambda uses:
 *   1. explicit `airtableCounty`
 *   2. local map
 *   3. Google Maps Geocoding
 * Returns an object so callers can see which source won (useful for logging).
 *
 * Never fabricates a county from the city name — returns { county: "" } on failure.
 */
export async function resolveCounty(
  input: ResolveCountyInput,
): Promise<CountyResolution> {
  // 1. Airtable override
  const rawAirtable = (input.airtableCounty || "").toString().trim();
  if (rawAirtable) {
    const normalized = rawAirtable.replace(/\s+county$/i, "").trim();
    return {
      county: normalized,
      stateCode: (input.state || "").toUpperCase(),
      source: "airtable",
    };
  }

  // Determine city + state (from explicit params or by parsing the address)
  let city = (input.city || "").trim();
  let state = (input.state || "").trim();

  if ((!city || !state) && input.address) {
    const parsed = parseAddress(input.address);
    city = city || parsed.city;
    state = state || parsed.state;
  }

  if (!city || !state) {
    return { county: "", stateCode: state.toUpperCase(), source: "none" };
  }

  const stateUpper = state.toUpperCase();
  const stateCode = STATE_NAME_TO_CODE[stateUpper] || stateUpper;

  // 2. Local map
  const localHit = lookupCountyLocal(city, stateCode);
  if (localHit) {
    return { county: localHit, stateCode, source: "local-map" };
  }

  // 3. Google Maps
  const googleHit = await getCountyFromGoogleMaps(city, stateCode);
  if (googleHit) {
    return { county: googleHit.toUpperCase(), stateCode, source: "google-maps" };
  }

  // 4. Give up — never fabricate
  return { county: "", stateCode, source: "none" };
}

/**
 * Convenience wrapper: resolve a county straight from an address string.
 * Returns just the county name (empty string if unresolvable).
 */
export async function resolveCountyFromAddress(
  address: string,
  airtableCounty?: string | null,
): Promise<string> {
  const { county } = await resolveCounty({ address, airtableCounty });
  return county;
}
