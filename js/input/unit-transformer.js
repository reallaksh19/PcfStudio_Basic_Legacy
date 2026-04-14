/**
 * unit-transformer.js
 * Strip unit suffixes from numeric columns. Return normalised rows.
 * Input: canonicalRows[], config.unitStripping
 * Output: normalizedRows[] — same shape, numeric strings converted
 */

const LOG_PREFIX = "[UnitTransformer]";

/**
 * stripSuffix — strip a known unit suffix and parse float.
 * @param {string} val
 * @param {string[]} suffixes  e.g. ["mm", "nb"]
 * @returns {number|string}  float if parseable, original string otherwise
 */
export function stripSuffix(val, suffixes) {
  if (val === null || val === undefined || val === "") return "";

  let s = String(val).trim();
  const lower = s.toLowerCase();

  for (const suffix of suffixes) {
    if (lower.endsWith(suffix.toLowerCase())) {
      s = s.slice(0, s.length - suffix.length).trim();
      break;
    }
  }

  const num = parseFloat(s);
  if (!isNaN(num)) return num;

  // Could not parse after stripping — return original for caller to decide
  return val;
}

/**
 * normaliseRow — apply unit stripping rules to a single canonical row.
 * @param {object} row         Canonical row
 * @param {object} stripping   config.unitStripping
 * @returns {object}  New row with stripped values
 */
export function normaliseRow(row, stripping) {
  const out = { ...row };
  for (const [colName, rule] of Object.entries(stripping)) {
    if (!(colName in out)) continue;
    const raw = out[colName];
    if (raw === null || raw === undefined || raw === "") continue;

    const stripped = stripSuffix(raw, rule.suffixes);
    if (stripped !== raw) {
      out[colName] = stripped;
    }
  }
  return out;
}

/**
 * normaliseRows — apply unit stripping to all canonical rows.
 * Logs a summary of how many cells were transformed.
 * @param {object[]} canonicalRows
 * @param {object}   unitStripping   config.unitStripping
 * @returns {object[]}
 */
export function normaliseRows(canonicalRows, unitStripping) {
  if (!Array.isArray(canonicalRows)) {
    console.error(`${LOG_PREFIX} normaliseRows: expected array, got ${typeof canonicalRows}`);
    return [];
  }

  let transformCount = 0;
  const result = canonicalRows.map((row, idx) => {
    const out = { ...row };
    for (const [col, rule] of Object.entries(unitStripping)) {
      if (!(col in out)) continue;
      const raw = out[col];
      if (raw === null || raw === undefined || raw === "") continue;
      const stripped = stripSuffix(raw, rule.suffixes);
      if (stripped !== raw) {
        out[col] = stripped;
        transformCount++;
      }
    }
    return out;
  });

  console.info(`${LOG_PREFIX} normaliseRows complete.`, {
    rows:       canonicalRows.length,
    transforms: transformCount,
  });

  return result;
}
