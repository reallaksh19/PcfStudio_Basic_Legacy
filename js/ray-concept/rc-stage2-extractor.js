/**
 * rc-stage2-extractor.js — Stage 2: 2D CSV component array → Fittings-only PCF text
 * Input:  components[] from Stage 1 + raw 2D CSV (for PIPE direction lookup)
 * Output: { pcfText: string }
 * 100% independent — only imports from rc-config.js
 */

import {
  getRayConfig, fmtNum, vecSub, vecNorm, vecScale, vecAdd, ptEq
} from './rc-config.js';

// ── PCF line builder ─────────────────────────────────────────────────────────

function line(indent, ...parts) {
  return ' '.repeat(indent) + parts.join(' ');
}

function fmtCoord(pt, bore, cfg) {
  const p = cfg.decimalPrecision;
  return [
    Number(pt.x).toFixed(p),
    Number(pt.y).toFixed(p),
    Number(pt.z).toFixed(p),
    Number(bore).toFixed(p)
  ].join(' ');
}

// ── MESSAGE-SQUARE builder ────────────────────────────────────────────────────

function buildMessageSquare(comp, cfg, isStub = false) {
  if (!cfg.messageSquareEnabled) return [];
  if (isStub) {
    const seqNo = comp._stubSeqNo;
    const refNo = `${comp.refNo}_STUB`;
    const len   = fmtNum(cfg.stubPipeLength, cfg);
    const dir   = comp._stubDir ? axisLabel3(comp._stubDir) : '';
    return [
      'MESSAGE-SQUARE',
      `    PIPE, LENGTH=${len}MM, ${dir}, RefNo:=${refNo}, SeqNo:${seqNo}`
    ];
  }
  if (comp.type === 'SUPPORT') {
    const guidSuffix = lastSegment(comp.supportGuid);
    return [
      'MESSAGE-SQUARE',
      `    SUPPORT, VG, ${guidSuffix}`
    ];
  }
  const parts = [comp.type];
  if (comp.lenAxis) {
    const la = comp.lenAxis;
    // Pick first non-empty LEN axis for MESSAGE-SQUARE
    const lenPairs = [
      [la.len1, la.axis1], [la.len2, la.axis2], [la.len3, la.axis3]
    ].filter(([l]) => l !== '' && l != null);
    if (lenPairs.length) {
      parts.push(`LENGTH=${lenPairs[0][0]}MM, ${lenPairs[0][1]}`);
    }
  }
  if (comp.refNo) parts.push(`RefNo:=${comp.refNo}`);
  parts.push(`SeqNo:${comp.seqNo}`);
  if (comp.brlen) parts.push(`BrLen=${comp.brlen}MM`);

  return ['MESSAGE-SQUARE', `    ${parts.join(', ')}`];
}

function lastSegment(guid) {
  if (!guid) return '';
  const parts = guid.split(':');
  return parts[parts.length - 1];
}

function axisLabel3(dir) {
  const ax = ['x','y','z'];
  const labels = [['EAST','WEST'],['NORTH','SOUTH'],['UP','DOWN']];
  for (let i = 0; i < 3; i++) {
    const v = dir[ax[i]];
    if (Math.abs(v) > 0.5) return v > 0 ? labels[i][0] : labels[i][1];
  }
  return '';
}

// ── SUPPORT stub direction: find parent PIPE, get its direction ──────────────

function findStubDirection(support, allComponents) {
  const coor = support.supportCoor;
  if (!coor) return { x: 0, y: 0, z: 1 }; // fallback up

  for (const c of allComponents) {
    if (c.type !== 'PIPE' || !c.ep1 || !c.ep2) continue;
    // Check if support coord lies ON this pipe segment (within bore tolerance)
    const ab  = vecSub(c.ep2, c.ep1);
    const ac  = vecSub(coor, c.ep1);
    const len = Math.sqrt(ab.x**2 + ab.y**2 + ab.z**2);
    if (len < 1e-6) continue;
    const dir = { x: ab.x/len, y: ab.y/len, z: ab.z/len };
    const t   = ac.x*dir.x + ac.y*dir.y + ac.z*dir.z;
    if (t < -1e-3 || t > len + 1e-3) continue;
    // Perpendicular distance
    const proj = { x: t*dir.x, y: t*dir.y, z: t*dir.z };
    const perp = vecSub(ac, proj);
    const perpDist = Math.sqrt(perp.x**2 + perp.y**2 + perp.z**2);
    if (perpDist < (c.bore ?? 300) * 0.6) {
      return dir; // this pipe contains the support
    }
  }
  return { x: 0, y: 0, z: 1 }; // default +Z if not found
}

// ── PCF block emitters ────────────────────────────────────────────────────────

function emitFlange(comp, cfg) {
  const lines = [];
  lines.push(...buildMessageSquare(comp, cfg));
  lines.push('FLANGE');
  lines.push(line(4, 'END-POINT   ', fmtCoord(comp.ep1, comp.bore, cfg)));
  lines.push(line(4, 'END-POINT   ', fmtCoord(comp.ep2, comp.bore, cfg)));
  lines.push(line(4, '<SKEY> ', comp.skey));
  if (comp.ca97) lines.push(line(4, 'COMPONENT-ATTRIBUTE97   ', comp.ca97));
  lines.push(line(4, 'COMPONENT-ATTRIBUTE98   ', String(comp.seqNo)));
  lines.push('');
  return lines;
}

function emitBend(comp, cfg) {
  const lines = [];
  lines.push(...buildMessageSquare(comp, cfg));
  lines.push('BEND');
  lines.push(line(4, 'END-POINT   ', fmtCoord(comp.ep1, comp.bore, cfg)));
  lines.push(line(4, 'END-POINT   ', fmtCoord(comp.ep2, comp.bore, cfg)));
  lines.push(line(4, 'CENTRE-POINT   ', fmtCoord(comp.cp, comp.bore, cfg)));
  lines.push(line(4, '<SKEY> ', comp.skey));
  lines.push(line(4, 'ANGLE ', '90.0000'));
  if (comp.radius) lines.push(line(4, 'BEND-RADIUS ', fmtNum(comp.radius, cfg)));
  if (comp.ca97) lines.push(line(4, 'COMPONENT-ATTRIBUTE97   ', comp.ca97));
  lines.push(line(4, 'COMPONENT-ATTRIBUTE98   ', String(comp.seqNo)));
  lines.push('');
  return lines;
}

function emitTee(comp, cfg) {
  const lines = [];
  lines.push(...buildMessageSquare(comp, cfg));
  lines.push('TEE');
  lines.push(line(4, 'END-POINT    ', fmtCoord(comp.ep1, comp.bore, cfg)));
  lines.push(line(4, 'END-POINT    ', fmtCoord(comp.ep2, comp.bore, cfg)));
  lines.push(line(4, 'CENTRE-POINT  ', fmtCoord(comp.cp, comp.bore, cfg)));
  lines.push(line(4, 'BRANCH1-POINT ', fmtCoord(comp.bp, Number(comp.branchBore || comp.bore), cfg)));
  lines.push(line(4, '<SKEY> ', comp.skey));
  if (comp.ca97) lines.push(line(4, 'COMPONENT-ATTRIBUTE97   ', comp.ca97));
  lines.push(line(4, 'COMPONENT-ATTRIBUTE98   ', String(comp.seqNo)));
  lines.push('');
  return lines;
}

function emitOlet(comp, cfg) {
  const lines = [];
  lines.push(...buildMessageSquare(comp, cfg));
  lines.push('OLET');
  lines.push(line(4, 'CENTRE-POINT  ', fmtCoord(comp.cp, comp.bore, cfg)));
  lines.push(line(4, 'BRANCH1-POINT ', fmtCoord(comp.bp, Number(comp.branchBore || 50), cfg)));
  lines.push(line(4, '<SKEY> ', comp.skey));
  if (comp.ca97) lines.push(line(4, 'COMPONENT-ATTRIBUTE97   ', comp.ca97));
  lines.push(line(4, 'COMPONENT-ATTRIBUTE98   ', String(comp.seqNo)));
  lines.push('');
  return lines;
}

function emitValve(comp, cfg) {
  const lines = [];
  lines.push(...buildMessageSquare(comp, cfg));
  lines.push('VALVE');
  lines.push(line(4, 'END-POINT   ', fmtCoord(comp.ep1, comp.bore, cfg)));
  lines.push(line(4, 'END-POINT   ', fmtCoord(comp.ep2, comp.bore, cfg)));
  lines.push(line(4, '<SKEY> ', comp.skey));
  if (comp.ca97) lines.push(line(4, 'COMPONENT-ATTRIBUTE97   ', comp.ca97));
  lines.push(line(4, 'COMPONENT-ATTRIBUTE98   ', String(comp.seqNo)));
  lines.push('');
  return lines;
}

function emitSupport(comp, stub, cfg) {
  const lines = [];
  const guidRaw = comp.supportGuid || '';
  const guidOut = guidRaw.startsWith('UCI:') ? guidRaw : (guidRaw ? `UCI:${guidRaw}` : '');
  const supName = comp.supportName || cfg.supportMapping.fallbackName;
  // MESSAGE-SQUARE: SUPPORT, RefNo:=<RefNo>, SeqNo:<SeqNo>, <SupportName>, <GUID>
  lines.push('MESSAGE-SQUARE');
  lines.push(`    SUPPORT, RefNo:=${comp.refNo || ''}, SeqNo:${comp.seqNo}, ${supName}, ${guidOut}`);
  lines.push('SUPPORT');
  // CO-ORDS: only emit when a valid coordinate is available
  if (comp.supportCoor) {
    lines.push(line(4, 'CO-ORDS   ', fmtCoord(comp.supportCoor, stub.bore, cfg)));
  }
  lines.push(line(4, '<SUPPORT_NAME> ', supName));
  if (guidOut) lines.push(line(4, '<SUPPORT_GUID> ', guidOut));
  lines.push('');
  // 1mm stub PIPE — only if we have a valid coordinate and direction
  const stubStart = comp.supportCoor;
  const dir       = comp._stubDir;
  if (stubStart && dir) {
    const stubEnd = vecAdd(stubStart, vecScale(dir, cfg.stubPipeLength));
    lines.push(...buildMessageSquare(comp, cfg, true));
    lines.push('PIPE');
    lines.push(line(4, 'END-POINT   ', fmtCoord(stubStart, stub.bore, cfg)));
    lines.push(line(4, 'END-POINT   ', fmtCoord(stubEnd,   stub.bore, cfg)));
    lines.push(line(4, 'PIPELINE-REFERENCE', comp.pipelineRef));
    lines.push('');
  }
  return lines;
}

// ── Main Stage 2 function ────────────────────────────────────────────────────

/**
 * Extract fittings from 2D component list and emit Fittings-only PCF.
 * @param {object[]} components  — from Stage 1
 * @param {function} logFn
 * @returns {{ pcfText: string }}
 */
export function runStage2(components, logFn = () => {}) {
  const cfg = getRayConfig();

  // Pre-resolve stub directions (needs all PIPE components for lookup)
  const pipeComps = components.filter(c => c.type === 'PIPE');

  let stubSeq = 0;
  const outputLines = [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM'
  ];

  // Derive PIPELINE-REFERENCE from first fitting
  const firstFitting = components.find(c => c.pipelineRef);
  if (firstFitting) {
    outputLines.push(`PIPELINE-REFERENCE ${firstFitting.pipelineRef}`);
    outputLines.push('    PROJECT-IDENTIFIER P1');
    outputLines.push('    AREA A1');
  }
  outputLines.push('');

  // Running seq counter for stubs
  let globalSeq = components.length;

  for (const comp of components) {
    if (!cfg.fittingTypes.includes(comp.type) && comp.type !== 'SUPPORT') {
      logFn('S2', 'excluded', comp.refNo, { type: comp.type });
      continue;
    }

    logFn('S2', 'retained', comp.refNo, { type: comp.type });

    switch (comp.type) {
      case 'FLANGE':  outputLines.push(...emitFlange(comp, cfg)); break;
      case 'BEND':    outputLines.push(...emitBend(comp, cfg));   break;
      case 'TEE':     outputLines.push(...emitTee(comp, cfg));    break;
      case 'OLET':    outputLines.push(...emitOlet(comp, cfg));   break;
      case 'VALVE':   outputLines.push(...emitValve(comp, cfg));  break;
      case 'SUPPORT': {
        // Find stub direction from parent pipe
        const dir = findStubDirection(comp, components);
        comp._stubDir    = dir;
        comp._stubSeqNo  = ++globalSeq;
        // Find bore from parent pipe
        const parentPipe = pipeComps.find(p => {
          const coor = comp.supportCoor;
          if (!p.ep1 || !p.ep2 || !coor) return false;
          const ab  = vecSub(p.ep2, p.ep1);
          const len = Math.sqrt(ab.x**2 + ab.y**2 + ab.z**2);
          if (len < 1e-6) return false;
          const d   = vecSub(coor, p.ep1);
          const dirP = { x: ab.x/len, y: ab.y/len, z: ab.z/len };
          const t   = d.x*dirP.x + d.y*dirP.y + d.z*dirP.z;
          return t >= -1e-3 && t <= len + 1e-3;
        });
        const stubBore = parentPipe ? parentPipe.bore : comp.bore || 254;
        logFn('S2', 'stub-injected', comp.refNo,
          { dir: axisLabel3(dir), bore: stubBore, len: cfg.stubPipeLength });
        outputLines.push(...emitSupport(comp, { bore: stubBore }, cfg));
        break;
      }
    }
  }

  const eol = cfg.windowsLineEndings ? '\r\n' : '\n';
  const pcfText = outputLines.join(eol);
  return { pcfText };
}
