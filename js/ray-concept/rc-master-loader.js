/**
 * rc-master-loader.js — "Load data from Masters" logic for the CSV→PCF tab.
 * Populates CA attributes, RATING, and weight (CA8) on all components
 * using Linelist Manager, Piping Class Master, and Weight Config data.
 *
 * Steps:
 *   1. CA1/2/5/10 from linelist (by lineNoKey); CA3/CA4 from piping class master (bore + pipingClass)
 *   2. RATING from piping class prefix (user-configured 2-char then 1-char map)
 *   3. CA8 (weight) from weight master (bore + rating + length ±6mm)
 */

import { linelistService } from '../services/linelist-service.js';
import { dataManager }     from '../services/data-manager.js';
import { materialService } from '../services/material-service.js';
import { masterTableService } from '../services/master-table-service.js';
import { getState }        from '../state.js';
import { resolveWeightForCa8 } from '../services/fallbackcontract.js';

const WEIGHT_TYPES = new Set([
  'FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'
]);

function _firstText(row, keys) {
  if (!row) return '';
  // Pass 1: exact key match (fastest path)
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  // Pass 2: case-insensitive key match (handles 'Wall Thickness' vs 'Wall thickness' etc.)
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const kl = key.toLowerCase();
    const found = rowKeys.find(rk => rk.toLowerCase() === kl);
    if (found) {
      const value = row[found];
      if (value != null && String(value).trim() !== '') return String(value).trim();
    }
  }
  return '';
}

/** Return the actual column names present in a PC master row (for diagnostic logging). */
function _pcRowCols(row) {
  return row ? Object.keys(row).join(', ') : '(no row)';
}

const PC_CLASS_KEYS  = ['Piping Class', 'piping_class', 'PipingClass'];
const PC_SIZE_KEYS   = ['Size', 'DN', 'NPS'];
const PC_RATING_KEYS = ['Rating', 'rating'];

// NPS (inches) → NB (mm) lookup — from Pipe size Vs Sch master table (steeltubes.co.in / ASME B36.10)
const _NPS_TO_DN = new Map([
  [0.5,20],[0.75,25],[1,32],[1.25,40],[1.5,50],[2,65],[2.5,80],[3,90],
  [3.5,100],[4,125],[5,150],[6,200],[8,250],[10,300],[12,350],[14,400],
  [16,450],[18,500],[20,550],[22,600],[24,650],[26,700],[28,750],
  [30,800],[32,850],[34,900],[36,950]
]);
// NB (mm) → NPS (inches) reverse map
const _DN_TO_NPS = new Map([..._NPS_TO_DN.entries()].map(([nps, dn]) => [dn, nps]));

/**
 * True when a component bore and a PC master size value refer to the same
 * nominal pipe size, regardless of whether either is expressed as NPS (inches)
 * or DN (mm).  Tries direct match first, then NPS↔DN cross-conversion.
 */
function _boreMatches(compBore, pcSize) {
  if (!Number.isFinite(compBore) || compBore <= 0) return false;
  if (!Number.isFinite(pcSize)   || pcSize   <= 0) return false;
  if (Math.abs(compBore - pcSize) < 1) return true;          // same units
  const nps = _DN_TO_NPS.get(Math.round(compBore));          // comp is DN mm → NPS
  if (nps !== undefined && Math.abs(nps - pcSize) < 0.01) return true;
  const dn  = _NPS_TO_DN.get(compBore);                      // comp is NPS → DN mm
  if (dn  !== undefined && Math.abs(dn  - pcSize) < 1) return true;
  return false;
}

function _resolvePipingClassRow(pcData, pipingClass, bore, rating = '') {
  const pcClass     = String(pipingClass || '').trim();
  if (!pcClass || !Array.isArray(pcData) || pcData.length === 0) return null;
  const pcClassLow  = pcClass.toLowerCase();
  const targetBore  = Number.parseFloat(bore) || 0;
  const targetRating = String(rating || '').trim();

  // Step 1 — filter to rows where class matches (case-insensitive)
  const classRows = pcData.filter(row =>
    _firstText(row, PC_CLASS_KEYS).trim().toLowerCase() === pcClassLow
  );
  if (!classRows.length) return null;

  // Step 2 — filter to rows where bore matches (handles NPS ↔ DN conversion)
  const boreRows = classRows.filter(row => {
    const sz = Number.parseFloat(_firstText(row, PC_SIZE_KEYS) || '0');
    return _boreMatches(targetBore, sz);
  });
  if (!boreRows.length) return null;

  // Step 3 — prefer a row whose rating matches (or has no rating); fall back to first bore match
  if (targetRating) {
    const ratingRow = boreRows.find(row => {
      const r = _firstText(row, PC_RATING_KEYS);
      return !r || r === targetRating;
    });
    return ratingRow || boreRows[0];
  }
  return boreRows[0];
}

/**
 * Explain why _resolvePipingClassRow returned null.
 * Returns a plain-text diagnosis suitable for the masters log.
 */
function _diagnosePCNoMatch(pcData, pipingClass, bore) {
  const pcClassLow = String(pipingClass || '').trim().toLowerCase();
  const targetBore = Number.parseFloat(bore) || 0;

  const classRows = pcData.filter(row =>
    _firstText(row, PC_CLASS_KEYS).trim().toLowerCase() === pcClassLow
  );

  if (!classRows.length) {
    // Gather a sample of what classes ARE in the master for comparison
    const sampleClasses = [...new Set(
      pcData.slice(0, 200).map(r => _firstText(r, PC_CLASS_KEYS)).filter(Boolean)
    )].slice(0, 10).join(', ');
    return {
      reason:        'class not found in PC master',
      searchedClass: pipingClass,
      sampleClasses: sampleClasses || '(none readable)',
    };
  }

  // Class exists — bore didn't match even with NPS↔DN conversion
  const sampleBores = [...new Set(
    classRows.map(r => _firstText(r, PC_SIZE_KEYS)).filter(Boolean)
  )].slice(0, 12).join(', ');
  const npsEquiv = _DN_TO_NPS.get(Math.round(targetBore));
  const dnEquiv  = _NPS_TO_DN.get(targetBore);
  return {
    reason:          'class found but bore had no match',
    searchedClass:   pipingClass,
    searchedBore_mm: targetBore,
    searchedBore_nps: npsEquiv  ?? '(not a standard DN)',
    searchedBore_dn:  dnEquiv   ?? '(not a standard NPS)',
    classRowCount:   classRows.length,
    pcBoresForClass: sampleBores || '(none readable)',
    hint: 'Verify the Size column values in the PC master and compare to the bore values shown above',
  };
}

/**
 * Fuzzy-match a raw material string against PCF Material Map entries.
 * Returns { code, desc, score, method } of the best match, or null if nothing
 * scores above the minimum threshold.
 *
 * Match priority:
 *   1. Exact (case-insensitive)         → score 1.0
 *   2. One string fully contains other  → score 0.9
 *   3. Jaccard token overlap ≥ 0.35     → score = overlap ratio
 */
function _fuzzyMatchMaterial(raw, matMap) {
  if (!raw || !Array.isArray(matMap) || !matMap.length) return null;

  const norm  = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const toks  = s => new Set(norm(s).split(' ').filter(Boolean));

  const rawNorm = norm(raw);
  const rawToks = toks(raw);

  let best = null;
  let bestScore = 0;

  for (const entry of matMap) {
    const desc = entry.desc || entry.Desc || entry.description || entry.Description || '';
    const code = entry.code || entry.Code || '';
    if (!desc || !code) continue;

    const descNorm = norm(desc);

    // Pass 1 — exact
    if (rawNorm === descNorm) return { code, desc, score: 1, method: 'exact' };

    // Pass 2 — substring containment
    if (rawNorm.includes(descNorm) || descNorm.includes(rawNorm)) {
      if (0.9 > bestScore) { bestScore = 0.9; best = { code, desc, score: 0.9, method: 'contains' }; }
      continue;
    }

    // Pass 3 — Jaccard token overlap
    const descToks  = toks(desc);
    const shared    = [...rawToks].filter(t => descToks.has(t)).length;
    const unionSize = new Set([...rawToks, ...descToks]).size;
    const jaccard   = unionSize > 0 ? shared / unionSize : 0;
    if (jaccard >= 0.35 && jaccard > bestScore) {
      bestScore = jaccard;
      best = { code, desc, score: jaccard, method: 'token-jaccard' };
    }
  }

  return best;
}

function _normalizeMaterialKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function _normalizeComponentKey(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function _componentLengthMm(comp) {
  const fromLenAxis = comp?.lenAxis?.len1;
  const lenAxis = Number.parseFloat(String(fromLenAxis ?? '').replace(/[^\d.-]/g, ''));
  if (Number.isFinite(lenAxis) && lenAxis > 0) return lenAxis;

  const directLength = Number.parseFloat(String(comp?.length ?? comp?.len ?? comp?.lengthMm ?? '').replace(/[^\d.-]/g, ''));
  if (Number.isFinite(directLength) && directLength > 0) return directLength;

  const ep1 = comp?.ep1 || comp?.eps?.[0];
  const ep2 = comp?.ep2 || comp?.eps?.[1];
  if (ep1 && ep2) {
    const dx = Number(ep2.x) - Number(ep1.x);
    const dy = Number(ep2.y) - Number(ep1.y);
    const dz = Number(ep2.z) - Number(ep1.z);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Number.isFinite(len) && len > 0 ? Math.round(len) : null;
  }
  return null;
}

export function collectCa8WeightRequests(components) {
  const requests = [];
  const seen = new Set();

  for (const comp of Array.isArray(components) ? components : []) {
    if (String(comp?.type || '').trim().toUpperCase() !== 'VALVE') continue;

    const bore = Number.parseFloat(String(comp?.bore ?? '').replace(/[^\d.-]/g, ''));
    const rating = Number.parseFloat(String(comp?.rating ?? '').replace(/[^\d.-]/g, ''));
    const lengthMm = _componentLengthMm(comp);
    if (!Number.isFinite(bore) || !Number.isFinite(rating) || !Number.isFinite(lengthMm)) continue;

    const candidates = masterTableService.findValveWeightCandidates({ boreMm: bore, ratingClass: rating, lengthMm });
    if (!Array.isArray(candidates) || candidates.length <= 1) continue;

    const key = _normalizeComponentKey(comp?.refNo || comp?.componentName || comp?.itemDescription || `${bore}-${rating}-${lengthMm}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    requests.push({
      key,
      description: `${comp?.refNo || comp?.componentName || 'VALVE'} • DN ${bore} • Rating ${rating} • Length ${lengthMm} mm`,
      candidates: candidates
        .map(row => ({
          weight: row.valve_weight ?? null,
          type: row.valve_type || '',
          description: row.valve_type || '',
        }))
        .filter(row => row.weight != null)
    });
  }

  return requests;
}

export function collectMaterialCodeRequests(components, cfg) {
  const requests = [];
  const seen = new Set();
  const matMapData = dataManager.getMaterialMap() || [];

  let pcData = dataManager.getPipingClassMaster() || [];
  if (!pcData.length) {
    try {
      const raw = localStorage.getItem('pcf_master_pipingclass');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) pcData = parsed;
      }
    } catch (_) {}
  }

  for (const comp of Array.isArray(components) ? components : []) {
    const pipingClass = String(comp?.pipingClass || comp?.['PIPING-CLASS'] || '').trim();
    const bore = Number.parseFloat(comp?.bore) || 0;
    const rating = String(comp?.rating || '').trim();
    const pcRow = _resolvePipingClassRow(pcData, pipingClass, bore, rating);
    const rawCsvMaterial = _firstText(comp, ['ca3', 'CA3', 'material', 'Material']);
    const pcMaterial = pcRow ? _firstText(pcRow, ['Material_Name', 'Material Name', 'Material', 'material', 'Mat', 'MAT']) : '';
    const mat = (rawCsvMaterial && (/\s/.test(rawCsvMaterial) || rawCsvMaterial.length > 4))
      ? rawCsvMaterial
      : pcMaterial;
    if (!mat) continue;

    const materialCode = materialService.resolveMaterialCode(mat, matMapData);
    if (materialCode) continue;

    const key = _normalizeMaterialKey(mat);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    requests.push({ key, description: mat, code: '' });
  }

  return requests;
}

/**
 * Populate CA fields, rating, and CA8 on every component in-place.
 * @param {Array}  components  rcState.components array (mutated in-place)
 * @param {Object} cfg         getConfig() result (for ratingPrefixMap)
 * @returns {number} count of components that were updated
 */
export async function loadMastersInto(components, cfg, materialOverrides = new Map(), ca8Overrides = new Map()) {
  const map2 = (cfg?.ratingPrefixMap?.twoChar) || { '10':10000,'20':20000,'15':1500,'25':2500 };
  const map1 = (cfg?.ratingPrefixMap?.oneChar) || { '1':150,'3':300,'6':600,'9':900,'5':5000 };
  const weightData = dataManager.getWeights() || [];
  const ca6Default = Number(cfg?.caDefinitions?.CA6?.default ?? 210);

  // Material Map — used to resolve raw PC master material name → PCF code for CA3
  let matMapData = dataManager.getMaterialMap() || [];
  if (!matMapData.length) {
    try {
      const raw = localStorage.getItem('pcf_master_materialmap');
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p) && p.length) matMapData = p; }
    } catch (_) {}
  }

  // Piping Class Master: live memory first, then localStorage fallback.
  // dataManager.getPipingClassMaster() returns [] when autoLoadPipingClassMasters is OFF
  // even though the data is saved in localStorage — mirror the same fallback we use for linelist.
  let pcData = dataManager.getPipingClassMaster() || [];
  if (!pcData.length) {
    try {
      const raw = localStorage.getItem('pcf_master_pipingclass');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          pcData = parsed;
          console.info(`[MasterLoader] pcData loaded from localStorage fallback (${pcData.length} rows)`);
        }
      }
    } catch (_) { /* ignore parse errors */ }
  }

  // One-time PC master diagnostic snapshot
  const _pcSnap = (() => {
    if (!pcData.length) return { loaded: false };
    const sample = pcData[0];
    return {
      loaded:    true,
      rows:      pcData.length,
      cols:      Object.keys(sample).join(', '),
      hasMat:    !!_firstText(sample, ['Material_Name', 'Material Name', 'Material', 'material']),
      hasWall:   !!_firstText(sample, ['Wall Thickness', 'Wall thickness', 'WallThickness', 'Wall_Thickness']),
      hasCorr:   !!_firstText(sample, ['Corrosion Allowance', 'Corrosion Allow', 'Corrosion', 'corrosion']),
    };
  })();

  // Build a one-time snapshot of linelist state for miss diagnostics (avoids repeated state reads)
  const _llSnap = (() => {
    try {
      const st = getState('linelist') || {};
      linelistService._buildLookupMaps?.(); // ensure indexes are built before we snapshot
      return {
        dmRows:       dataManager.getLinelist().length,
        simpleSize:   linelistService._simpleMap?.size ?? 0,
        lineRefKey:   st.smartMap?.LineRef || null,
        sequenceCol:  st.keys?.sequenceCol || null,
      };
    } catch (_) { return { dmRows: 0, simpleSize: 0, lineRefKey: null, sequenceCol: null }; }
  })();

  // ── Pre-filter PC data to only rows whose Size matches a bore in this component set ───
  // Avoids scanning 10000+ rows for every component (would be N_components × N_pcRows iterations).
  const _compBores = [...new Set(
    components.map(c => Number.parseFloat(c.bore)).filter(b => Number.isFinite(b) && b > 0)
  )];
  const pcDataActive = pcData.length > 0 && _compBores.length > 0
    ? pcData.filter(row => {
        const sz = Number.parseFloat(_firstText(row, PC_SIZE_KEYS) || '0');
        return _compBores.some(b => _boreMatches(b, sz));
      })
    : pcData;
  // Use the filtered table for all per-component lookups
  const pcLookup = pcDataActive;

  let updated = 0;
  // Collect up to 3 unique PC-miss diagnostics for the summary log
  const _pcMissSamples = [];
  const _pcMissClasses = new Set();

  for (const comp of components) {
    let changed = false;
    const trace = comp._mastersMeta = {
      lineNoKey: comp.lineNoKey || '—',
      pipingClass: comp.pipingClass || '—',
      rating: comp.rating || '—',
      bore: comp.bore ?? '—',
      linelist: { found: false },
      ca6: { applied: false, rule: 'CA5 > 0 && InsType includes C' },
      pipingClassMaster: { matched: false },
      ca7: { applied: false, rule: 'Piping Class Master by class + bore (+ rating)' },
      ca8: { applied: false, rule: 'weight resolver' }
    };

    // ── Step 1a: CA1/2/5/10 from Linelist Manager ──────────────────
    if (comp.lineNoKey) {
      try {
        const attrs = linelistService.getSmartAttributes(comp.lineNoKey);
        if (attrs?.Found) {
          trace.linelist = {
            found: true,
            query: comp.lineNoKey,
            insType: attrs.InsType || '—',
            insThk: attrs.InsThk || '—',
            hp: attrs.HP || '—'
          };
          if (attrs.P1   != null && attrs.P1   !== '') { comp.ca1  = attrs.P1;   changed = true; }
          if (attrs.T1   != null && attrs.T1   !== '') { comp.ca2  = attrs.T1;   changed = true; }
          if (attrs.InsThk != null && attrs.InsThk !== '') { comp.ca5 = attrs.InsThk; changed = true; }
          const insType = String(attrs.InsType || '').trim().toUpperCase();
          const ca5Val = Number.parseFloat(comp.ca5) || 0;
          trace.ca6.gate = {
            ca5: ca5Val,
            insType: insType || '—',
            current: comp.ca6 ?? '—'
          };
          if (ca5Val > 0 && insType.includes('C') && (comp.ca6 == null || String(comp.ca6).trim() === '')) {
            comp.ca6 = Number.isFinite(ca6Default) ? ca6Default : 210;
            trace.ca6.applied = true;
            trace.ca6.value = comp.ca6;
            trace.ca6.source = `config default ${Number.isFinite(ca6Default) ? ca6Default : 210}`;
            changed = true;
          } else if (ca5Val <= 0) {
            trace.ca6.reason = 'CA5 is not positive';
          } else if (!insType.includes('C')) {
            trace.ca6.reason = 'InsType does not contain C';
          } else {
            trace.ca6.reason = 'CA6 already populated';
          }
          if (attrs.HP   != null && attrs.HP   !== '') { comp.ca10 = attrs.HP;   changed = true; }
        } else {
          trace.linelist = {
            found:       false,
            query:       comp.lineNoKey,
            reason:      _llSnap.simpleSize === 0
              ? (_llSnap.dmRows === 0 ? 'linelist not loaded' : 'index built but empty — check LineRef column mapping')
              : 'no row matched this lineNoKey',
            dmRows:      _llSnap.dmRows,
            indexedKeys: _llSnap.simpleSize,
            lineRefKey:  _llSnap.lineRefKey || '(not mapped)',
            sequenceCol: _llSnap.sequenceCol || '(not mapped)',
          };
        }
      } catch (err) {
        trace.linelist = { found: false, query: comp.lineNoKey, reason: err?.message || 'linelist lookup failed' };
      }
    }

    // ── Step 1b: CA3/CA4 from Piping Class Master ───────────────────
    const bore = Number.parseFloat(comp.bore) || 0;
    let pcRow = null;
    const rawCsvMaterial = _firstText(comp, ['ca3', 'CA3', 'material', 'Material']);
    if (comp.pipingClass && pcLookup.length > 0) {
      pcRow = _resolvePipingClassRow(pcLookup, comp.pipingClass, bore, comp.rating);
      trace.pipingClassMaster = {
        matched: !!pcRow,
        class: comp.pipingClass || '—',
        bore,
        rating: comp.rating || '—'
      };
      if (pcRow) {
        const wall = _firstText(pcRow, ['Wall Thickness', 'Wall thickness', 'WallThickness', 'Wall_Thickness', 'WT', 'Wt']);
        if (wall) { comp.ca4 = wall; changed = true; }
        trace.pipingClassMaster.rowClass  = _firstText(pcRow, ['Piping Class', 'piping_class', 'PipingClass']) || '—';
        trace.pipingClassMaster.wall      = wall || '— (not found)';
        if (!rawCsvMaterial) trace.pipingClassMaster.warnMat = `CA3 empty — tried: Material_Name, Material Name, Material. Row cols: ${_pcRowCols(pcRow)}`;
        if (!wall) trace.pipingClassMaster.warnWall = `CA4 empty — tried: Wall Thickness, WallThickness, Wall_Thickness. Row cols: ${_pcRowCols(pcRow)}`;
      } else {
        const diag = _diagnosePCNoMatch(pcLookup.length ? pcLookup : pcData, comp.pipingClass, bore);
        trace.pipingClassMaster.reason        = diag.reason;
        trace.pipingClassMaster.searchedClass = diag.searchedClass;
        trace.pipingClassMaster.searchedBore  = diag.searchedBore ?? bore;
        trace.pipingClassMaster.pcRows        = pcData.length;
        if (diag.sampleClasses)    trace.pipingClassMaster.sampleClasses    = diag.sampleClasses;
        if (diag.pcBoresForClass)  trace.pipingClassMaster.pcBoresForClass  = diag.pcBoresForClass;
        if (diag.hint)             trace.pipingClassMaster.hint             = diag.hint;
        // Collect unique failing class for summary
        const missKey = `${comp.pipingClass}|${bore}`;
        if (_pcMissSamples.length < 3 && !_pcMissClasses.has(missKey)) {
          _pcMissClasses.add(missKey);
          _pcMissSamples.push(diag);
        }
      }
    } else if (!comp.pipingClass) {
      trace.pipingClassMaster.reason = 'pipingClass is blank';
    } else {
      trace.pipingClassMaster.reason = 'piping class master is empty';
    }

    const pcMaterial = pcRow ? _firstText(pcRow, ['Material_Name', 'Material Name', 'Material', 'material', 'Mat', 'MAT']) : '';
    const mat = (rawCsvMaterial && (/\s/.test(rawCsvMaterial) || rawCsvMaterial.length > 4))
      ? rawCsvMaterial
      : pcMaterial;
    if (mat) {
      const mapMatch = _fuzzyMatchMaterial(mat, matMapData);
      const materialCode = materialService.resolveMaterialCode(mat, matMapData, materialOverrides);
      trace.pipingClassMaster = trace.pipingClassMaster || {};
      trace.pipingClassMaster.ca3_raw = mat;
      if (materialCode) {
        comp.ca3 = materialCode;
        trace.pipingClassMaster.ca3_code   = materialCode;
        trace.pipingClassMaster.ca3_mapDesc= mapMatch?.desc || '';
        trace.pipingClassMaster.ca3_score  = mapMatch?.score != null ? mapMatch.score.toFixed(2) : 'prompt';
        trace.pipingClassMaster.ca3_method = mapMatch?.method || 'prompt';
      } else {
        comp.ca3 = '';
        trace.pipingClassMaster.ca3_warn   = 'no Material Code provided — CA3 left blank';
      }
      changed = true;
    }

    // ── Step 2: Rating from piping class prefix ─────────────────────
    const s = String(comp.pipingClass || '').trim();
    const r2 = map2[s.slice(0, 2)];
    const r1 = map1[s.slice(0, 1)];
    const newRating = r2 ?? r1 ?? null;
    const recalculatedRating = newRating != null ? newRating : '';
    if (String(comp.rating ?? '') !== String(recalculatedRating)) changed = true;
    comp.rating = recalculatedRating;
    trace.rating = {
      recalculated: true,
      source: comp.pipingClass || comp.pipelineRef || '—',
      value: comp.rating || '—'
    };

    if (comp.pipingClass && pcLookup.length > 0) {
      const row = pcRow || _resolvePipingClassRow(pcLookup, comp.pipingClass, bore, comp.rating);
      trace.ca7.gate = {
        class: comp.pipingClass || '—',
        bore,
        rating: comp.rating || '—',
        current: comp.ca7 ?? '—'
      };
      if (row) {
        const corr = _firstText(row, ['Corrosion Allowance', 'Corrosion Allow', 'Corrosion Allow.', 'Corrosion', 'corrosion', 'CA', 'Corr']);
        if (corr) {
          comp.ca7 = corr;
          trace.ca7.applied = true;
          trace.ca7.value   = corr;
          trace.ca7.source  = 'Piping Class Master';
          changed = true;
        } else {
          trace.ca7.reason  = 'Corrosion Allowance column not found or empty';
          trace.ca7.rowCols = _pcRowCols(row);
        }
      } else {
        trace.ca7.reason = 'no piping class master row';
      }
    } else if (!comp.pipingClass) {
      trace.ca7.reason = 'pipingClass is blank';
    } else {
      trace.ca7.reason = 'piping class master is empty';
    }

    // ── Step 3: CA8 (weight) via unified resolver ────────────────────
    if (WEIGHT_TYPES.has(comp.type) && weightData.length > 0) {
      const ca8OverrideKey = _normalizeComponentKey(comp.refNo || comp.componentName || comp.itemDescription || comp.ca97 || comp.ca98 || '');
      const ca8Override = ca8Overrides?.get?.(ca8OverrideKey);
      if (ca8Override != null && String(ca8Override).trim() !== '') {
        comp.ca8 = String(ca8Override).trim();
        trace.ca8.override = comp.ca8;
        changed = true;
      }

      const lengthMm = _componentLengthMm(comp);
      const valveCandidates = String(comp.type || '').trim().toUpperCase() === 'VALVE'
        ? masterTableService.findValveWeightCandidates({ boreMm: comp.bore, ratingClass: comp.rating, lengthMm })
        : [];
      if (Array.isArray(valveCandidates) && valveCandidates.length > 1 && String(comp.ca8 || '').trim() === '') {
        comp.ca8Options = valveCandidates
          .map(row => ({
            weight: row.valve_weight ?? null,
            type: row.valve_type || '',
            description: row.valve_desc || row.valve_type || ''
          }))
          .filter(row => row.weight != null);
        trace.ca8.reason = 'ambiguous valve weight — choose from CA8 dropdown';
        changed = true;
      } else {
        delete comp.ca8Options;
      }

      const resolution = resolveWeightForCa8({
        type: comp.type,
        directWeight: comp.ca8,
        boreMm: comp.bore,
        ratingClass: comp.rating,
        valveType: comp.description || comp.compName || comp.itemDescription || '',
        lengthMm
      }, { includeApprovedFittings: true });
      if (resolution.weight != null) {
        comp.ca8 = resolution.weight;
        comp.ca8Trace = resolution.trace.join(' > ');
        trace.ca8.applied = true;
        trace.ca8.value = resolution.weight;
        trace.ca8.trace = resolution.trace.join(' > ');
        changed = true;
      } else if (resolution.trace?.includes('blocked:ambiguous-valve-match')) {
        trace.ca8.reason = 'ambiguous valve weight — choose from CA8 dropdown';
      } else {
        trace.ca8.reason = resolution.trace?.[resolution.trace.length - 1] || 'weight resolver returned no result';
      }
    }

    if (changed) updated++;
  }

  return { updated, pcSnap: _pcSnap, pcMissSamples: _pcMissSamples, pcDataActive };
}
