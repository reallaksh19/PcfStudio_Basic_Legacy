/**
 * pcf-block-schema.js — Definitive CA attribute rules per PCF block type.
 *
 * CA1–CA10, CA97, CA98 rules:
 *   mandatory — must be present if data available
 *   never     — must NEVER appear in this block type
 *   optional  — may appear if data available
 *
 * Exports:
 *   PCF_BLOCK_SCHEMA
 *   getAllowedCASlots(blockType) → string[]
 *   shouldEmitCA97(blockType, refNo) → boolean
 *   shouldEmitCA98(blockType) → boolean
 *   emitCABlock(ca, blockType, refNo, seqNo) → string[]
 */

const INDENT = '    ';

export const PCF_BLOCK_SCHEMA = {
  PIPE:                  { ca1to7: 'mandatory', ca8: 'never',     ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  BEND:                  { ca1to7: 'mandatory', ca8: 'never',     ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  TEE:                   { ca1to7: 'mandatory', ca8: 'never',     ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  OLET:                  { ca1to7: 'mandatory', ca8: 'never',     ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  FLANGE:                { ca1to7: 'mandatory', ca8: 'mandatory', ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  VALVE:                 { ca1to7: 'mandatory', ca8: 'mandatory', ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  'REDUCER-CONCENTRIC':  { ca1to7: 'mandatory', ca8: 'mandatory', ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  'REDUCER-ECCENTRIC':   { ca1to7: 'mandatory', ca8: 'mandatory', ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  'MISC-COMPONENT':      { ca1to7: 'mandatory', ca8: 'mandatory', ca9to10: 'mandatory', ca97: 'optional',  ca98: 'mandatory' },
  SUPPORT:               { ca1to7: 'never',     ca8: 'never',     ca9to10: 'never',     ca97: 'optional',  ca98: 'optional'  },
};

// Block types where CA8 (weight) is allowed
const CA8_ALLOWED = new Set(['FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC', 'MISC-COMPONENT']);

// Block types where CA1-CA10 are forbidden
const CA_NUMERIC_FORBIDDEN = new Set(['SUPPORT']);

/**
 * Get the ordered list of CA slot numbers allowed for a given block type.
 * Returns slot identifiers (e.g. '1', '2', ..., '8', '9', '10') as strings.
 *
 * @param {string} blockType
 * @returns {string[]}
 */
export function getAllowedCASlots(blockType) {
  const schema = PCF_BLOCK_SCHEMA[blockType];
  if (!schema) return [];

  if (CA_NUMERIC_FORBIDDEN.has(blockType)) return [];

  const slots = ['1', '2', '3', '4', '5', '6', '7'];
  if (schema.ca8 === 'mandatory' || schema.ca8 === 'optional') slots.push('8');
  slots.push('9', '10');
  return slots;
}

/**
 * Returns true if CA97 (RefNo) should be emitted for this block.
 * Rule: refNo is non-empty string; SUPPORT is allowed (optional).
 *
 * @param {string} blockType
 * @param {string|null} refNo
 * @returns {boolean}
 */
export function shouldEmitCA97(blockType, refNo) {
  if (!refNo || !String(refNo).trim()) return false;
  // CA97 is optional on all block types (including SUPPORT)
  return true;
}

/**
 * Returns true if CA98 (SeqNo) should be emitted for this block.
 * Rule: SUPPORT is optional; all others always emit if data available.
 *
 * @param {string} blockType
 * @returns {boolean}
 */
export function shouldEmitCA98(blockType) {
  // CA98 allowed on all types; caller provides seqNo or not
  return true;
}

function enforceNumeric(val) {
  const n = parseFloat(String(val));
  return isNaN(n) ? String(val) : String(n);
}

/**
 * Emit CA1–CA10, CA97, CA98 lines for a component.
 * Automatically skips lines not allowed for the block type.
 *
 * @param {object} ca       — { '1': value, '2': value, ..., '8': value, '9': value, '10': value }
 * @param {string} blockType
 * @param {string|null} refNo  — CA97 value
 * @param {string|null} seqNo  — CA98 value
 * @returns {string[]}
 */
export function emitCABlock(ca, blockType, refNo, seqNo) {
  const lines = [];
  const allowed = getAllowedCASlots(blockType);

  for (const slot of allowed) {
    const val = ca?.[slot];
    if (val == null || val === '') continue;
    const attrNum = slot;
    const emitVal = slot === '3' ? enforceNumeric(val) : String(val);
    lines.push(`${INDENT}COMPONENT-ATTRIBUTE${attrNum}  ${emitVal}`);
  }

  if (shouldEmitCA97(blockType, refNo)) {
    const sanitized = String(refNo).replace(/=/g, '').trim();
    if (sanitized) lines.push(`${INDENT}COMPONENT-ATTRIBUTE97  ${sanitized}`);
  }

  if (shouldEmitCA98(blockType) && seqNo && String(seqNo).trim()) {
    lines.push(`${INDENT}COMPONENT-ATTRIBUTE98  ${seqNo}`);
  }

  return lines;
}
