/**
 * coord-csv-parser.js — Parse CSV/Excel coordinate files
 * Columns: East, North, Up, SupportName, DE/BO, Remarks
 * Uses papaparse (CSV) and xlsx (Excel) — both in importmap.
 *
 * Exports:
 *   parseCSVText(csvText)           → { points: EnrichedPoint[], warnings: string[] }
 *   parseExcelBuffer(arrayBuffer)   → Promise<{ points: EnrichedPoint[], warnings: string[] }>
 *
 * EnrichedPoint: { x, y, z, supportName, deBo, remarks, index }
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// Zero-Trust: fuzzy column name normalizer (strips spaces/special chars, lowercase)
const norm = s => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase();

// Canonical column mappings: normalized key → field name
const COL_MAP = {
  'east':        'x',   'e':          'x',   'easting':    'x',
  'north':       'y',   'n':          'y',   'northing':   'y',
  'up':          'z',   'elevation':  'z',   'elev':       'z',   'z': 'z',
  'supportname': 'supportName',   'support': 'supportName',
  'debo':        'deBo',   'debo':    'deBo',
  'remarks':     'remarks', 'remark': 'remarks', 'comment': 'remarks',
  'notes':       'remarks', 'legend': 'remarks',
};

/** Map header array to { fieldName → columnIndex }. */
function mapHeaders(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = norm(h);
    if (COL_MAP[key]) map[COL_MAP[key]] = i;
  });
  return map;
}

/** Convert a single row (array) to an EnrichedPoint. Returns null if x/y invalid. */
function rowToPoint(row, headerMap, index) {
  const get = field => {
    const idx = headerMap[field];
    if (idx === undefined) return '';
    const val = Array.isArray(row) ? row[idx] : Object.values(row)[idx];
    return val !== null && val !== undefined ? String(val).trim() : '';
  };

  const x = parseFloat(get('x'));
  const y = parseFloat(get('y'));
  const z = parseFloat(get('z')) || 0;

  if (isNaN(x) || isNaN(y)) return null;

  return {
    x, y, z,
    supportName: get('supportName') || '',
    deBo:        get('deBo') || '',
    remarks:     get('remarks') || '',
    index,
  };
}

/** Process headers + rows arrays into ParseResult. */
function processRows(headers, rows) {
  const hMap = mapHeaders(headers);
  const warnings = [];

  if (hMap.x === undefined) warnings.push('Could not detect East/X column');
  if (hMap.y === undefined) warnings.push('Could not detect North/Y column');

  const points = [];
  let idx = 0;
  for (const row of rows) {
    const pt = rowToPoint(row, hMap, idx);
    if (pt) { points.push(pt); idx++; }
  }

  if (points.length === 0) warnings.push('No valid coordinate rows found');
  return { points, warnings };
}

/**
 * Parse CSV text using PapaParse.
 * @param {string} csvText
 * @returns {{ points: EnrichedPoint[], warnings: string[] }}
 */
export function parseCSVText(csvText) {
  if (!csvText || !csvText.trim()) return { points: [], warnings: ['Empty CSV input'] };

  const result = Papa.parse(csvText.trim(), {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (!result.data || result.data.length < 2) {
    return { points: [], warnings: ['CSV has fewer than 2 rows (need header + data)'] };
  }

  const headers = result.data[0].map(h => String(h).trim());
  const rows    = result.data.slice(1);
  return processRows(headers, rows);
}

/**
 * Parse Excel ArrayBuffer using xlsx.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ points: EnrichedPoint[], warnings: string[] }>}
 */
export async function parseExcelBuffer(arrayBuffer) {
  try {
    const workbook  = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const data      = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!data || data.length < 2) {
      return { points: [], warnings: ['Excel sheet has fewer than 2 rows (need header + data)'] };
    }

    const headers = data[0].map(h => String(h).trim());
    const rows    = data.slice(1);
    return processRows(headers, rows);
  } catch (err) {
    return { points: [], warnings: [`Excel parse error: ${err.message}`] };
  }
}
