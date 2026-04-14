/**
 * header-mapper.js
 * Map raw CSV headers to canonical names using config.headerAliases.
 * One function = one job.
 */

import { gate } from '../services/gate-logger.js';

const LOG_PREFIX = "[HeaderMapper]";

/**
 * Build a lookup: normalised alias → canonical name.
 * Run once on init (or when aliases change).
 * @param {object} headerAliases  config.headerAliases
 * @returns {Map<string, string>}  normalised → canonical
 */
export function buildAliasLookup(headerAliases) {
  const lookup = new Map();
  for (const [canonical, aliases] of Object.entries(headerAliases)) {
    // Canonical name itself is always valid
    lookup.set(canonical.toLowerCase().trim(), canonical);
    for (const alias of aliases) {
      const key = alias.toLowerCase().trim();
      if (lookup.has(key) && lookup.get(key) !== canonical) {
        console.warn(`${LOG_PREFIX} Alias collision: "${alias}" maps to both "${lookup.get(key)}" and "${canonical}". "${canonical}" wins.`);
      }
      lookup.set(key, canonical);
    }
  }
  console.info(`${LOG_PREFIX} Built alias lookup with ${lookup.size} entries for ${Object.keys(headerAliases).length} canonical columns.`);
  return lookup;
}

/**
 * mapHeaders — map an array of raw header strings to canonical names.
 * @param {string[]} rawHeaders
 * @param {object}   headerAliases  config.headerAliases
 * @returns {{ headerMap: object, unmapped: string[] }}
 *   headerMap: { rawHeader → canonicalName }  (mapped headers only)
 *   unmapped:  raw headers with no alias match
 */
export function mapHeaders(rawHeaders, headerAliases) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) {
    console.error(`${LOG_PREFIX} mapHeaders: rawHeaders must be a non-empty array.`);
    return { headerMap: {}, unmapped: [] };
  }

  const lookup = buildAliasLookup(headerAliases);
  const headerMap = {};
  const unmapped = [];

  for (const raw of rawHeaders) {
    const key = raw.toLowerCase().trim();
    if (lookup.has(key)) {
      headerMap[raw] = lookup.get(key);
    } else {
      unmapped.push(raw);
    }
  }

  gate('HeaderMapper', 'mapHeaders', 'Headers Mapped', {
    total: rawHeaders.length,
    mapped: Object.keys(headerMap).length,
    unmapped: unmapped.length,
    unmappedList: unmapped.slice(0, 50), // cap to 50
  });

  console.info(`${LOG_PREFIX} mapHeaders result.`, {
    total: rawHeaders.length,
    mapped: Object.keys(headerMap).length,
    unmapped: unmapped.length,
    unmappedList: unmapped,
  });

  return { headerMap, unmapped };
}

/**
 * applyHeaderMap — remap rows using headerMap.
 * @param {object[]} rows       Raw parsed rows ({ rawHeader: value })
 * @param {object}   headerMap  { rawHeader: canonicalName }
 * @returns {object[]}  Rows with canonical keys (unmapped columns preserved as-is)
 */
export function applyHeaderMap(rows, headerMap) {
  if (!Array.isArray(rows)) {
    console.error(`${LOG_PREFIX} applyHeaderMap: rows must be an array.`);
    return [];
  }

  return rows.map((row, i) => {
    const canonical = {};
    for (const [raw, val] of Object.entries(row)) {
      canonical[headerMap[raw] || raw] = val;
    }
    return canonical;
  });
}
