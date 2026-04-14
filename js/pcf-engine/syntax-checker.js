/**
 * syntax-checker.js — Unified PCF syntax + geometry checker (Common Engine)
 *
 * Unifies syntax-validator.js (SV-001..SV-005) with geometry checks (GV-001..GV-007).
 *
 * Check set:
 *   SV-001  Required CA slots present
 *   SV-002  BEND has ANGLE + BEND-RADIUS; 0 < angle < 180
 *   SV-003  SUPPORT has <SUPPORT_NAME>
 *   SV-004  PIPE/FLANGE/VALVE have exactly 2 END-POINTs; OLET has 0
 *   SV-005  BEND CP geometric validation (corner intersection)
 *   GV-001  BEND: CP equidistant from EP1 and EP2 (±0.01mm)
 *   GV-002  TEE: CP = midpoint of EP1..EP2 (±1.0mm)
 *   GV-003  TEE: BP perpendicular to header axis (dot product < 0.01)
 *   GV-004  OLET: must NOT have END-POINTs
 *   GV-005  BEND: CP not collinear with EP1/EP2
 *   GV-006  CP or BP missing → auto-compute via geometry-calc and flag INFO
 *   GV-007  CA8 forbidden on PIPE/BEND/TEE/OLET/SUPPORT; required on FLANGE/VALVE/REDUCER
 *
 * Exports:
 *   runSyntaxCheck(components, cfg) → { errors: Issue[], warnings: Issue[], infos: Issue[] }
 */

import { PCF_BLOCK_SCHEMA } from './pcf-block-schema.js';
import { ENGINE_CONFIG } from './engine-config.js';

const _issue = (id, severity, type, message, detail = '', fixHint = '') => ({
  id, severity, type, message, detail, fixHint,
});

function dist3(a, b) {
  if (!a || !b) return Infinity;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function dot3(u, v) {
  return u.x * v.x + u.y * v.y + u.z * v.z;
}

function normalize3(v) {
  const m = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (m < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function vec3(from, to) {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

/**
 * Run unified syntax + geometry checks on a list of topology components.
 *
 * Components must have the shape:
 *   { type, ep1, ep2, cp, bp, bore, angleDeg, ca, refNo, seqNo, ... }
 *
 * @param {object[]} components
 * @param {object}   [cfg]
 * @returns {{ errors: object[], warnings: object[], infos: object[] }}
 */
export function runSyntaxCheck(components, cfg = {}) {
  const tol = { ...ENGINE_CONFIG.tolerances, ...(cfg.tolerances || {}) };
  const errors = [], warnings = [], infos = [];

  for (const comp of components) {
    const t = comp.type;

    // ── SV-001: Required CA slots present ───────────────────────────────────
    const schema = PCF_BLOCK_SCHEMA[t];
    if (schema && schema.ca1to7 === 'mandatory') {
      for (let i = 1; i <= 7; i++) {
        if (!comp.ca?.[String(i)] && comp.ca?.[String(i)] !== 0) {
          warnings.push(_issue('SV-001', 'WARNING', t,
            `${t}: missing CA${i}`,
            `RefNo: ${comp.refNo || '?'}`,
            `Provide CA${i} value in config or CSV`));
        }
      }
    }

    // ── SV-002: BEND has ANGLE and BEND-RADIUS ───────────────────────────────
    if (t === 'BEND') {
      if (comp.angleDeg == null) {
        errors.push(_issue('SV-002', 'ERROR', t,
          'BEND missing ANGLE', '', 'Check bend angle computation'));
      } else if (comp.angleDeg <= 0 || comp.angleDeg >= 180) {
        warnings.push(_issue('SV-002', 'WARNING', t,
          `BEND ANGLE suspicious: ${comp.angleDeg}°`,
          'Expected 0 < angle < 180',
          'Verify centre-point coordinates'));
      }
      if (!comp.radius && !comp.bendRadius) {
        warnings.push(_issue('SV-002', 'WARNING', t,
          'BEND missing BEND-RADIUS', '', 'Set Radius column in CSV'));
      }
    }

    // ── SV-003: SUPPORT has <SUPPORT_NAME> ──────────────────────────────────
    if (t === 'SUPPORT' && !comp.supportName) {
      warnings.push(_issue('SV-003', 'WARNING', t,
        'SUPPORT missing support name', '', 'Fill Restraint Type column'));
    }

    // ── SV-004: END-POINT count ──────────────────────────────────────────────
    if (['PIPE', 'FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'].includes(t)) {
      if (!comp.ep1 || !comp.ep2) {
        errors.push(_issue('SV-004', 'ERROR', t,
          `${t}: missing END-POINT(s)`, '', 'Check coordinate data'));
      }
    }
    if (t === 'OLET' && comp.ep1) {
      errors.push(_issue('GV-004', 'ERROR', t,
        'OLET must not have END-POINT lines', '', 'OLET uses CENTRE-POINT + BRANCH1-POINT only'));
    }

    // ── SV-005: BEND CP geometric validation ────────────────────────────────
    if (t === 'BEND' && comp.ep1 && comp.ep2 && comp.cp) {
      const c1 = { x: comp.ep1.x, y: comp.ep2.y, z: comp.ep1.z };
      const c2 = { x: comp.ep2.x, y: comp.ep1.y, z: comp.ep1.z };
      const d1 = dist3(comp.cp, c1);
      const d2 = dist3(comp.cp, c2);
      const expected = d1 < d2 ? c1 : c2;
      const deviation = Math.min(d1, d2);
      if (deviation > 1.0) {
        errors.push(_issue('SV-005', 'ERROR', t,
          `BEND CP geometric error: deviation ${deviation.toFixed(2)}mm`,
          `Expected CP: ${expected.x.toFixed(4)} ${expected.y.toFixed(4)} ${expected.z.toFixed(4)}`,
          'Move CENTRE-POINT to the corner intersection of the two perpendicular legs'));
      }
    }

    // ── GV-001: BEND CP equidistant from EP1 and EP2 ────────────────────────
    if (t === 'BEND' && comp.ep1 && comp.ep2 && comp.cp) {
      const d1 = dist3(comp.cp, comp.ep1);
      const d2 = dist3(comp.cp, comp.ep2);
      if (Math.abs(d1 - d2) > tol.equidistant) {
        errors.push(_issue('GV-001', 'ERROR', t,
          `BEND CP not equidistant: d1=${d1.toFixed(3)} d2=${d2.toFixed(3)}`,
          '',
          'Recompute CENTRE-POINT using bend geometry'));
      }
    }

    // ── GV-002: TEE CP = midpoint of EP1..EP2 ───────────────────────────────
    if (t === 'TEE' && comp.ep1 && comp.ep2 && comp.cp) {
      const mid = {
        x: (comp.ep1.x + comp.ep2.x) / 2,
        y: (comp.ep1.y + comp.ep2.y) / 2,
        z: (comp.ep1.z + comp.ep2.z) / 2,
      };
      const err = dist3(comp.cp, mid);
      if (err > tol.midpoint) {
        errors.push(_issue('GV-002', 'ERROR', t,
          `TEE CP not at midpoint of EP1/EP2: error=${err.toFixed(3)}mm`,
          '',
          'Set CENTRE-POINT to midpoint of the two END-POINTs'));
      }
    }

    // ── GV-003: TEE BP perpendicular to header axis ──────────────────────────
    if (t === 'TEE' && comp.ep1 && comp.ep2 && comp.bp && comp.cp) {
      const headerDir = normalize3(vec3(comp.ep1, comp.ep2));
      const branchDir = normalize3(vec3(comp.cp, comp.bp));
      const dotVal = Math.abs(dot3(headerDir, branchDir));
      if (dotVal > tol.perpendicular) {
        warnings.push(_issue('GV-003', 'WARNING', t,
          `TEE BP not perpendicular to header axis: dot=${dotVal.toFixed(4)}`,
          '',
          'Check BRANCH1-POINT alignment'));
      }
    }

    // ── GV-005: BEND CP not collinear with EP1/EP2 ──────────────────────────
    if (t === 'BEND' && comp.ep1 && comp.ep2 && comp.cp) {
      const v1 = normalize3(vec3(comp.ep1, comp.cp));
      const v2 = normalize3(vec3(comp.cp, comp.ep2));
      const dotVal = dot3(v1, v2);
      // If dot ≈ 1.0, CP is on the line between EP1 and EP2 (collinear)
      if (dotVal > 0.9998) {
        warnings.push(_issue('GV-005', 'WARNING', t,
          'BEND CP appears collinear with EP1/EP2',
          '',
          'CENTRE-POINT should be at the corner, not on the pipe line'));
      }
    }

    // ── GV-006: Missing CP or BP ─────────────────────────────────────────────
    if (t === 'BEND' && (!comp.cp || (comp.cp.x === 0 && comp.cp.y === 0 && comp.cp.z === 0))) {
      infos.push(_issue('GV-006', 'INFO', t,
        'BEND has no CENTRE-POINT; auto-compute recommended',
        '',
        'Use computeBendGeometry() from geometry-calc.js'));
    }
    if (t === 'TEE' && !comp.bp) {
      infos.push(_issue('GV-006', 'INFO', t,
        'TEE has no BRANCH1-POINT; auto-compute recommended',
        '',
        'Use computeTeeGeometry() from geometry-calc.js'));
    }

    // ── GV-007: CA8 rules ────────────────────────────────────────────────────
    if (schema) {
      const hasCA8 = comp.ca?.['8'] != null && comp.ca?.['8'] !== '';
      if (schema.ca8 === 'never' && hasCA8) {
        errors.push(_issue('GV-007', 'ERROR', t,
          `${t}: CA8 (weight) must NOT appear in this block type`,
          '',
          'Remove COMPONENT-ATTRIBUTE8 from this block'));
      }
      if (schema.ca8 === 'mandatory' && !hasCA8) {
        warnings.push(_issue('GV-007', 'WARNING', t,
          `${t}: CA8 (weight) is missing`,
          '',
          'Add weight data for this component'));
      }
    }
  }

  return { errors, warnings, infos };
}
