/**
 * SS-4 Line 16 — "Principal activity" classification.
 *
 * Extracted from src/app/api/airtable/generate-ss4/route.ts so it can be
 * exercised directly by a test. A Next.js route file may only export HTTP
 * method handlers, so anything that needs a regression test has to live here.
 *
 * The OpenAI classifier in the route is the primary path; this keyword matcher
 * is the fallback AND the arbiter when the model answers "other" (a concrete
 * keyword match is preferred over "other"). Ordering and bilingual coverage
 * are the whole point — see categorizeByKeywords.
 */

const DANGLING_WORDS = new Set(['FOR', 'TO', 'IN', 'OF', 'WITH', 'AND', 'OR', 'THE', 'A', 'AN', 'BY', 'AT', 'ON', 'FROM', 'AS', 'BUT', 'NOR', 'SO', 'YET', 'INTO', 'UPON', 'THROUGH', 'BETWEEN', 'AMONG', 'HACIA', 'PARA', 'EN', 'DE', 'Y', 'CON']);

export function stripDanglingWords(text: string): string {
  let result = text.trim();
  let words = result.split(/\s+/);
  while (words.length > 1 && DANGLING_WORDS.has(words[words.length - 1].replace(/[,;.]$/, '').toUpperCase())) {
    words.pop();
    result = words.join(' ').replace(/[,;]+$/, '').trim();
    words = result.split(/\s+/);
  }
  return result;
}

export function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return stripDanglingWords(text);
  const truncated = text.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  let result: string;
  // Only use the space if it's not too early (keep at least 60% of the max)
  if (lastSpace > maxLen * 0.6) {
    result = truncated.substring(0, lastSpace).trim();
  } else {
    result = truncated.trim();
  }
  return stripDanglingWords(result);
}
/**
 * Fallback keyword-based categorization
 */
export function categorizeByKeywords(businessPurpose: string): { category: string; otherSpecify?: string } {
  const purposeLower = businessPurpose.toLowerCase();
  const has = (...terms: string[]) => terms.some((t) => purposeLower.includes(t));

  // Order matters: most-specific PRODUCING/SERVICE categories are tested BEFORE
  // retail, because a maker who also sells ("fabricación y venta…") must check
  // Manufacturing, not Retail (the IRS principal-activity rule). Keywords are
  // bilingual (EN + ES) — the questionnaire is Spanish, so a purpose like
  // "fabricación de muebles" previously fell through to "other".
  if (has('construction', 'building', 'contractor', 'construcción', 'construccion', 'obra', 'edificación', 'edificacion', 'contratista')) {
    return { category: 'construction' };
  }
  if (has('manufactur', 'production', 'producing', 'factory', 'fabrication', 'assembly',
          'manufactura', 'fabricación', 'fabricacion', 'fabrica', 'fábrica', 'producción', 'produccion',
          'elaboración', 'elaboracion', 'ensamble', 'ensamblaje', 'maquila', 'industria')) {
    return { category: 'manufacturing' };
  }
  if (has('transportation', 'transport', 'warehousing', 'logistics', 'shipping', 'freight',
          'transporte', 'logística', 'logistica', 'almacenaje', 'almacenamiento', 'envío', 'envio', 'carga', 'flete', 'paquetería', 'paqueteria')) {
    return { category: 'transportation' };
  }
  if (has('health', 'medical', 'hospital', 'clinic', 'dental',
          'salud', 'médic', 'medic', 'clínica', 'clinica', 'dentista', 'enfermería', 'enfermeria')) {
    return { category: 'healthcare' };
  }
  if (has('restaurant', 'hotel', 'accommodation', 'food service', 'catering', 'cafe', 'café',
          'restaurante', 'hospedaje', 'alojamiento', 'cafetería', 'cafeteria', 'comida', 'gastronom')) {
    return { category: 'accommodation' };
  }
  if (has('wholesale', 'mayoreo', 'mayorista', 'al por mayor') && has('broker', 'agent', 'corredor', 'agente', 'comisión', 'comision')) {
    return { category: 'wholesale_broker' };
  }
  if (has('wholesale', 'mayoreo', 'mayorista', 'al por mayor', 'distribución', 'distribucion', 'distributor', 'distribuidor')) {
    return { category: 'wholesale_other' };
  }
  if (has('real estate', 'realty', 'property', 'bienes raíces', 'bienes raices', 'inmobiliaria', 'inmueble')) {
    return { category: 'real_estate' };
  }
  if (has('rental', 'leasing', 'lease', 'renta', 'arrendamiento', 'alquiler')) {
    return { category: 'rental' };
  }
  if (has('finance', 'financial', 'insurance', 'banking', 'investment',
          'finanzas', 'financ', 'seguros', 'banca', 'inversión', 'inversion', 'crédito', 'credito')) {
    return { category: 'finance' };
  }
  // Retail LAST among concrete categories — broad "sell/venta" signals would
  // otherwise pre-empt the more-specific producing categories above.
  if (has('retail', 'store', 'shop', 'sale of', 'sell', 'selling', 'consumer', 'customer',
          'e-commerce', 'ecommerce', 'online sales', 'venta', 'consumidor', 'tienda', 'minorista', 'menudeo', 'al por menor', 'comercio')) {
    return { category: 'retail' };
  }

  // Default to "other" with truncated business purpose
  const otherSpecify = truncateAtWordBoundary(businessPurpose.toUpperCase(), 35);
  return { category: 'other', otherSpecify };
}