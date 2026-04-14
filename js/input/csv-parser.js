/**
 * csv-parser.js
 * Parse CSV/TSV text into raw row objects using PapaParse.
 * Supports both batch and streaming modes.
 * Input: string (file text) + config
 * Output: { headers: string[], rows: object[], delimiter: string, errors: string[] }
 */

import Papa from "papaparse";
import { gate } from '../services/gate-logger.js';

const LOG_PREFIX = "[CSVParser]";

// ── Sanitization Helpers ─────────────────────────────────────────────

/** Strip UTF-8 BOM character from start of text. */
function stripBOM(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/** Normalize common Unicode oddities (smart quotes, em-dashes, etc). */
function normalizeUnicode(str) {
  return str
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // Smart single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')  // Smart double quotes → "
    .replace(/[\u2013\u2014]/g, '-')               // En/Em dash → -
    .replace(/\u2026/g, '...')                     // Ellipsis → ...
    .replace(/\u00A0/g, ' ');                      // Non-breaking space → space
}

/** Collapse multiple spaces into single space. */
function collapseSpaces(str) {
  return str.replace(/\s{2,}/g, ' ');
}

/** Build header transform function from sanitize config. */
function buildHeaderTransform(sanitize) {
  return (h) => {
    if (!h) return h;
    let cleaned = h;
    if (sanitize.trimWhitespace !== false) cleaned = cleaned.trim();
    if (sanitize.normalizeUnicode !== false) cleaned = normalizeUnicode(cleaned);
    if (sanitize.collapseSpaces !== false) cleaned = collapseSpaces(cleaned);
    if (sanitize.lowercaseHeaders) cleaned = cleaned.toLowerCase();
    return cleaned;
  };
}

/** Build cell value transform from sanitize config. */
function buildValueTransform(sanitize) {
  return (v) => {
    if (typeof v !== 'string') return v;
    let cleaned = v;
    if (sanitize.trimWhitespace !== false) cleaned = cleaned.trim();
    if (sanitize.normalizeUnicode !== false) cleaned = normalizeUnicode(cleaned);
    return cleaned;
  };
}

/** Detect delimiter by scanning first 3 lines. */
function detectDelimiter(text) {
  const candidates = ["\t", ",", ";", "|"];
  const sample = text.split("\n").slice(0, 3).join("\n");
  const counts = candidates.map(d => ({ d, n: (sample.match(new RegExp(`\\${d}`, "g")) || []).length }));
  counts.sort((a, b) => b.n - a.n);
  const best = counts[0];
  console.info(`${LOG_PREFIX} detectDelimiter: "${best.d === "\t" ? "TAB" : best.d}" (${best.n} occurrences in sample)`);
  return best.d;
}

/**
 * parseCSV — parse CSV/TSV text (batch or streaming).
 * @param {string} text  Raw file text
 * @param {object} config  inputSettings from config
 * @returns {{ headers: string[], rows: object[], delimiter: string, errors: string[] }}
 */
export function parseCSV(text, config) {
  if (!text || typeof text !== "string") {
    console.error(`${LOG_PREFIX} parseCSV: invalid input — expected string, got ${typeof text}`);
    return { headers: [], rows: [], delimiter: ",", errors: ["Invalid input: expected text string."] };
  }

  const sanitize = config.sanitize || {};

  // 1. Pre-process: BOM stripping
  let cleaned = text;
  if (sanitize.stripBOM !== false) {
    cleaned = stripBOM(cleaned);
  }

  // 2. Detect delimiter
  const delimiter = config.autoDetectDelimiter
    ? detectDelimiter(cleaned)
    : config.fallbackDelimiter;

  const headerTransform = buildHeaderTransform(sanitize);
  const valueTransform = buildValueTransform(sanitize);

  // 3. Choose parse mode
  if (config.streamingParse) {
    return parseStreaming(cleaned, delimiter, headerTransform, valueTransform, config);
  } else {
    return parseBatch(cleaned, delimiter, headerTransform, valueTransform);
  }
}

// ── Batch Mode (Original) ────────────────────────────────────────────

function parseBatch(text, delimiter, headerTransform, valueTransform) {
  const result = Papa.parse(text, {
    delimiter,
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: headerTransform,
    transform: valueTransform,
  });

  const errors = (result.errors || []).map(e =>
    `Row ${e.row ?? "?"}: ${e.message} (code: ${e.code})`
  );

  if (errors.length) {
    console.warn(`${LOG_PREFIX} PapaParse reported ${errors.length} issue(s):`, errors);
  }

  const headers = result.meta?.fields || [];
  const rows = result.data || [];

  gate('CSVParser', 'parseBatch', 'Batch Parse Complete', {
    delimiter: delimiter === "\t" ? "TAB" : delimiter,
    headers: headers.length,
    rows: rows.length,
    errors: errors.length,
  });

  return { headers, rows, delimiter, errors };
}

// ── Streaming Mode (Step) ────────────────────────────────────────────

function parseStreaming(text, delimiter, headerTransform, valueTransform, config) {
  const rows = [];
  const errors = [];
  let headers = [];
  const chunkSize = config.streamingChunkSize || 500;
  let chunkCount = 0;

  Papa.parse(text, {
    delimiter,
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: headerTransform,
    transform: valueTransform,
    step: (result) => {
      if (result.errors?.length) {
        errors.push(...result.errors.map(e =>
          `Row ${e.row ?? "?"}: ${e.message} (code: ${e.code})`
        ));
      }
      if (result.data) {
        rows.push(result.data);
      }
      // Track chunk boundaries for potential future progress callbacks
      if (rows.length % chunkSize === 0) {
        chunkCount++;
      }
    },
    complete: (meta) => {
      headers = meta?.meta?.fields || [];
    }
  });

  // PapaParse step mode with string input is synchronous
  // so headers/rows are populated by this point
  if (headers.length === 0 && rows.length > 0) {
    headers = Object.keys(rows[0]);
  }

  gate('CSVParser', 'parseStreaming', 'Streaming Parse Complete', {
    delimiter: delimiter === "\t" ? "TAB" : delimiter,
    headers: headers.length,
    rows: rows.length,
    chunks: chunkCount,
    errors: errors.length,
  });

  return { headers, rows, delimiter, errors };
}

/**
 * readFileAsText — FileReader wrapper returning a Promise<string>.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!(file instanceof File)) {
      reject(new Error(`${LOG_PREFIX} readFileAsText: expected File, got ${typeof file}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`${LOG_PREFIX} FileReader error reading "${file.name}"`));
    reader.readAsText(file, "UTF-8");
    console.info(`${LOG_PREFIX} Reading file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
  });
}
