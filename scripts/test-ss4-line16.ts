/**
 * SS-4 Line 16 (principal activity) regression test.
 *
 * WHY THIS EXISTS
 * In the 2026-06-23 client review Antonio opened the generated SS-4 and found
 * Line 16 checked as "Other (specify)" for a manufacturer:
 *
 *     "veo dos problemas. Uno es esta selección de states … no debería decir
 *      la distancia de otros y especificar lo que será, pero solo verifica esa
 *      caja en fabricación"
 *     ("just check the box on manufacturing")
 *
 * Fixed in c2f7a01b, which shipped WITHOUT a test — the fix lived inside a
 * Next.js route file, where nothing could import it. The classifier now lives
 * in src/lib/ss4-line16.ts so this file can hold the line.
 *
 * The two root causes c2f7a01b addressed are both order/coverage properties
 * that a future edit can silently undo, which is exactly what a test is for:
 *   1. BILINGUAL — the questionnaire is Spanish; English-only manufacturing
 *      terms sent "fabricación de muebles" to "other".
 *   2. ORDER — retail's broad "venta/sell" signals were tested BEFORE
 *      manufacturing, so a maker who also sells classified as retail. The IRS
 *      principal-activity rule says the maker checks Manufacturing.
 *
 * Run: npx tsx scripts/test-ss4-line16.ts
 */

import { categorizeByKeywords } from "../src/lib/ss4-line16";

type Case = { purpose: string; expect: string; why: string };

const CASES: Case[] = [
  // --- the reported defect, and the trap that caused it ---
  { purpose: "Fabricación de muebles de madera", expect: "manufacturing",
    why: "the 2026-06-23 report: Spanish maker must not fall through to other" },
  { purpose: "Fabricación y venta de muebles", expect: "manufacturing",
    why: "maker who also sells — manufacturing must win over retail (IRS rule)" },
  { purpose: "Manufacturing and sale of steel parts", expect: "manufacturing",
    why: "same trap in English" },
  { purpose: "Producción y comercialización de alimentos empacados", expect: "manufacturing",
    why: "'producción' + a commerce word must still be manufacturing" },

  // --- each concrete category resolves, in Spanish and English ---
  { purpose: "Construcción de casas residenciales", expect: "construction", why: "ES construction" },
  { purpose: "General contractor building homes", expect: "construction", why: "EN construction" },
  { purpose: "Transporte de carga y logística", expect: "transportation", why: "ES transportation" },
  { purpose: "Freight shipping and warehousing", expect: "transportation", why: "EN transportation" },
  { purpose: "Clínica dental", expect: "healthcare", why: "ES healthcare" },
  { purpose: "Medical clinic services", expect: "healthcare", why: "EN healthcare" },
  { purpose: "Restaurante y servicio de catering", expect: "accommodation", why: "ES food service" },
  { purpose: "Hotel and food service", expect: "accommodation", why: "EN accommodation" },
  { purpose: "Venta al por mayor como agente comisionista", expect: "wholesale_broker",
    why: "wholesale + broker signal must beat plain wholesale" },
  { purpose: "Distribución mayorista de abarrotes", expect: "wholesale_other", why: "wholesale, no broker signal" },
  { purpose: "Inmobiliaria y venta de bienes raíces", expect: "real_estate",
    why: "real estate must beat retail's 'venta'" },
  { purpose: "Renta de equipo de construcción", expect: "construction",
    why: "documents current behavior: 'construcción' is tested before 'renta'" },
  { purpose: "Arrendamiento de vehículos", expect: "rental", why: "ES rental with no earlier signal" },
  { purpose: "Servicios financieros y de seguros", expect: "finance", why: "ES finance" },
  { purpose: "Tienda de ropa en línea", expect: "retail", why: "ES retail, no producing signal" },
  { purpose: "Online store selling consumer electronics", expect: "retail", why: "EN retail" },

  // --- genuine 'other' still works, and is a complete phrase ---
  { purpose: "Consultoría estratégica para startups", expect: "other",
    why: "no listed category fits; must fall through cleanly" },
];

let failures = 0;

for (const c of CASES) {
  const got = categorizeByKeywords(c.purpose);
  if (got.category !== c.expect) {
    failures++;
    console.error(
      `FAIL  "${c.purpose}"\n      expected=${c.expect} got=${got.category}\n      (${c.why})`,
    );
    continue;
  }
  // "other" must carry a usable, non-truncated specify string — the form prints it.
  if (got.category === "other") {
    const spec = got.otherSpecify ?? "";
    if (!spec) {
      failures++;
      console.error(`FAIL  "${c.purpose}"\n      category=other but otherSpecify is empty`);
      continue;
    }
    if (spec.length > 35) {
      failures++;
      console.error(`FAIL  "${c.purpose}"\n      otherSpecify is ${spec.length} chars, max 35: "${spec}"`);
      continue;
    }
    if (spec !== spec.toUpperCase()) {
      failures++;
      console.error(`FAIL  "${c.purpose}"\n      otherSpecify must be ALL CAPS: "${spec}"`);
      continue;
    }
  }
  console.log(`ok    ${c.expect.padEnd(16)} "${c.purpose}"`);
}

// A concrete match must never also emit otherSpecify — the form would print a
// specify string next to a checked concrete box.
for (const c of CASES) {
  const got = categorizeByKeywords(c.purpose);
  if (got.category !== "other" && got.otherSpecify) {
    failures++;
    console.error(`FAIL  "${c.purpose}"\n      category=${got.category} must not set otherSpecify`);
  }
}

console.log(
  failures === 0
    ? `\nSS-4 Line 16: ${CASES.length}/${CASES.length} cases pass`
    : `\nSS-4 Line 16: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
