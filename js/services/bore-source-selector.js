import {
  CONVERTED_BORE_COL,
  CONVERTED_BORE_SOURCE_COL,
  CONVERTED_BORE_STATUS_COL,
  guessBoreSourceColumn,
} from './bore-converter.js';

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[()\[\].]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGeneratedColumnHeader(header) {
  return /^columnx\d+$/i.test(String(header || '').trim());
}

function isConvertedBoreMetaHeader(header) {
  const h = norm(header);
  return h === norm(CONVERTED_BORE_COL) ||
    h === norm(CONVERTED_BORE_SOURCE_COL) ||
    h === norm(CONVERTED_BORE_STATUS_COL);
}

export function scoreBoreSourceHeader(header, type = '') {
  if (!header || isConvertedBoreMetaHeader(header)) return -Infinity;
  const h = norm(header);
  const t = String(type || '').toLowerCase();
  let score = 0;

  // Main rule: prefer real source columns whose name contains "size".
  if (/\bsize\b/.test(h) || h.includes('size')) score += 100;

  if (/nominal/.test(h)) score += 30;
  if (/pipe|line/.test(h)) score += 24;
  if (/\bnps\b|inch|inches/.test(h)) score += 22;
  if (/\bdn\b|\bnb\b|\bbore\b/.test(h)) score += 20;
  if (/\bod\b|o\/d|outside diameter|outside/.test(h)) score += 12;
  if (/diameter|dia/.test(h)) score += 8;

  if (t === 'linelist' && /line|pipe|nominal/.test(h)) score += 8;
  if (t === 'weights' && /nps|size|dn|nb|bore/.test(h)) score += 8;
  if (t === 'pipingclass' && /size|dn|nb|bore/.test(h)) score += 8;

  // Blank Excel headers like ColumnX1 must not beat named size/bore columns.
  if (isGeneratedColumnHeader(header)) score -= 50;

  return score;
}

export function guessPreferredBoreSourceColumn(headers, type = '') {
  const safe = Array.isArray(headers) ? headers.filter(Boolean) : [];
  const scored = safe
    .map((h, idx) => ({ h, idx, score: scoreBoreSourceHeader(h, type) }))
    .filter(x => Number.isFinite(x.score) && x.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  const scoredBest = scored[0]?.h || '';
  const legacyBest = guessBoreSourceColumn(safe, type) || '';

  if (!legacyBest) return scoredBest;
  if (!scoredBest) return legacyBest;

  const legacyScore = scoreBoreSourceHeader(legacyBest, type);
  const bestScore = scoreBoreSourceHeader(scoredBest, type);

  if (isGeneratedColumnHeader(legacyBest) && /size/i.test(scoredBest)) return scoredBest;
  if (/size/i.test(scoredBest) && bestScore >= legacyScore) return scoredBest;
  return bestScore >= legacyScore + 25 ? scoredBest : legacyBest;
}

export function shouldUsePreferredBoreSource(savedSource, preferredSource, headers, type = '') {
  const saved = String(savedSource || '').trim();
  const preferred = String(preferredSource || '').trim();
  if (!preferred) return false;
  if (!saved) return true;
  if (saved.toLowerCase() === preferred.toLowerCase()) return false;

  const safe = Array.isArray(headers) ? headers.filter(Boolean) : [];
  const savedHeader = safe.find(h => String(h).trim().toLowerCase() === saved.toLowerCase());
  if (!savedHeader) return true;

  if (isGeneratedColumnHeader(savedHeader) && /size/i.test(preferred)) return true;

  const savedScore = scoreBoreSourceHeader(savedHeader, type);
  const preferredScore = scoreBoreSourceHeader(preferred, type);
  return preferredScore >= savedScore + 25;
}
