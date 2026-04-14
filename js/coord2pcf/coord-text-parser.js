/**
 * coord-text-parser.js — Parse AutoCAD LIST command output (LWPOLYLINE)
 * Zero-Trust: strips invisible chars, handles "Press ENTER to continue:", bulge/arc blocks.
 *
 * Exports:
 *   parseAutoCADText(rawText) → { runs: ParsedRun[], warnings: string[] }
 *   classifyBulgeAngle(bulge) → '90' | '45' | 'arc' | null
 *
 * ParsedRun:  { points: Point3D[], metadata: { layer, handle, area, length } }
 * Point3D:    { x, y, z, index, bulge?, arcCenter?, arcRadius?, startAngle?, endAngle? }
 */

const POINT_RE  = /at\s+point\s+X\s*=\s*([-+]?\d*\.?\d+)\s+Y\s*=\s*([-+]?\d*\.?\d+)\s+Z\s*=\s*([-+]?\d*\.?\d+)/i;
const BULGE_RE  = /bulge\s+([-+]?\d*\.?\d+)/i;
const CENTER_RE = /center\s+X\s*=\s*([-+]?\d*\.?\d+)\s+Y\s*=\s*([-+]?\d*\.?\d+)\s+Z\s*=\s*([-+]?\d*\.?\d+)/i;
const RADIUS_RE = /radius\s+([-+]?\d*\.?\d+)/i;
const SANG_RE   = /start\s+angle\s+([-+]?\d*\.?\d+)/i;
const EANG_RE   = /end\s+angle\s+([-+]?\d*\.?\d+)/i;
const LAYER_RE  = /Layer:\s*"([^"]+)"/i;
const HANDLE_RE = /Handle\s*=\s*([0-9a-fA-F]+)/i;
const AREA_RE   = /area\s+([-+]?\d*\.?\d+)/i;
const LENGTH_RE = /length\s+([-+]?\d*\.?\d+)/i;
const LWPOLY_RE = /LWPOLYLINE/i;

/** Sanitize raw text — strip invisible chars, normalize endings, remove console pause lines. */
function sanitize(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
    .replace(/^press\s+enter\s+to\s+continue\s*:?\s*$/gim, '')
    .trim();
}

/** Split raw text into LWPOLYLINE blocks. If no header found, treat all as one block. */
function splitIntoBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (LWPOLY_RE.test(line)) {
      if (current !== null) blocks.push(current);
      current = [line];
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null && current.length > 0) blocks.push(current);
  if (blocks.length === 0) blocks.push(lines); // fallback: no header found
  return blocks;
}

/** Parse one block into a ParsedRun. */
function parseBlock(lines) {
  const text = lines.join('\n');

  const metadata = {
    layer:  (LAYER_RE.exec(text)  || [])[1]?.trim() || '',
    handle: (HANDLE_RE.exec(text) || [])[1]?.trim() || '',
    area:   AREA_RE.exec(text)   ? parseFloat(AREA_RE.exec(text)[1])   : null,
    length: LENGTH_RE.exec(text) ? parseFloat(LENGTH_RE.exec(text)[1]) : null,
  };

  const points = [];
  let pointIndex = 0;
  let pendingBulge = null;
  let pendingArcCenter = null;
  let pendingArcRadius = null;
  let pendingStartAngle = null;
  let pendingEndAngle   = null;

  for (const line of lines) {
    const t = line.trim();

    const ptM = POINT_RE.exec(t);
    if (ptM) {
      const pt = {
        x: parseFloat(ptM[1]),
        y: parseFloat(ptM[2]),
        z: parseFloat(ptM[3]),
        index: pointIndex++,
      };
      if (pendingBulge !== null) {
        pt.bulge = pendingBulge;
        if (pendingArcCenter)          pt.arcCenter    = pendingArcCenter;
        if (pendingArcRadius !== null)  pt.arcRadius    = pendingArcRadius;
        if (pendingStartAngle !== null) pt.startAngle   = pendingStartAngle;
        if (pendingEndAngle   !== null) pt.endAngle     = pendingEndAngle;
      }
      points.push(pt);
      // Reset arc context
      pendingBulge = null; pendingArcCenter = null;
      pendingArcRadius = null; pendingStartAngle = null; pendingEndAngle = null;
      continue;
    }

    const bM = BULGE_RE.exec(t);
    if (bM) { pendingBulge = parseFloat(bM[1]); continue; }

    const cM = CENTER_RE.exec(t);
    if (cM) { pendingArcCenter = { x: parseFloat(cM[1]), y: parseFloat(cM[2]), z: parseFloat(cM[3]) }; continue; }

    const rM = RADIUS_RE.exec(t);
    if (rM) { pendingArcRadius = parseFloat(rM[1]); continue; }

    const saM = SANG_RE.exec(t);
    if (saM) { pendingStartAngle = parseFloat(saM[1]); continue; }

    const eaM = EANG_RE.exec(t);
    if (eaM) { pendingEndAngle = parseFloat(eaM[1]); continue; }
  }

  return { points, metadata };
}

/**
 * Main export: parse raw AutoCAD LIST output.
 * @param {string} rawText
 * @returns {{ runs: Array<{points, metadata}>, warnings: string[] }}
 */
export function parseAutoCADText(rawText) {
  if (!rawText || !rawText.trim()) return { runs: [], warnings: ['Empty input'] };

  const clean  = sanitize(rawText);
  const blocks = splitIntoBlocks(clean);
  const warnings = [];
  const runs = [];

  for (let i = 0; i < blocks.length; i++) {
    const run = parseBlock(blocks[i]);
    if (run.points.length === 0) {
      warnings.push(`Block ${i + 1}: No coordinate points found`);
      continue;
    }
    runs.push(run);
  }

  if (runs.length === 0) warnings.push('No valid coordinate data found in input');
  return { runs, warnings };
}

/**
 * Classify bulge value to bend angle.
 * Bulge = tan(arc_included_angle / 4).
 * 90° arc → bulge ≈ tan(22.5°) ≈ 0.4142
 * 45° arc → bulge ≈ tan(11.25°) ≈ 0.1989
 * @param {number} bulge
 * @returns {'90'|'45'|'arc'|null}
 */
export function classifyBulgeAngle(bulge) {
  if (bulge === null || bulge === undefined) return null;
  const abs = Math.abs(Number(bulge));
  if (Math.abs(abs - 0.4142) < 0.015) return '90';
  if (Math.abs(abs - 0.1989) < 0.015) return '45';
  if (abs > 0.001) return 'arc';
  return null;
}
