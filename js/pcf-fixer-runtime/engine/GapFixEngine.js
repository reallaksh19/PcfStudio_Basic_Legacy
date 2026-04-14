/**
 * GapFixEngine.js
 * Pure math engine for gap/break/insert operations.
 * Coordinates are in millimeters. Zero-Trust Coordinates applied.
 */

// Helper: Calculate 3D distance safely
const getDist = (p1, p2) => {
  if (!p1 || !p2) return Infinity;
  const dx = parseFloat(p1.x) - parseFloat(p2.x);
  const dy = parseFloat(p1.y) - parseFloat(p2.y);
  const dz = parseFloat(p1.z) - parseFloat(p2.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

// Helper: Prioritize element types for extension (PIPE > FLANGE > OTHERS)
const getPriority = (type) => {
  const t = (type || '').toUpperCase().trim();
  if (t === 'PIPE') return 1;
  if (t === 'FLANGE') return 2;
  return 3;
};

/**
 * fix6mmGaps
 * Extends the higher-priority element's endpoint to close 0-6mm gaps.
 */
export const fix6mmGaps = (dataTable) => {
  if (!Array.isArray(dataTable)) return { updatedTable: [], fixLog: [] };
  const updatedTable = dataTable.map(r => ({ ...r, ep1: r.ep1 ? { ...r.ep1 } : null, ep2: r.ep2 ? { ...r.ep2 } : null }));
  const fixLog = [];

  for (let i = 0; i < updatedTable.length - 1; i++) {
    const elA = updatedTable[i];
    const elB = updatedTable[i + 1];
    if (!elA.ep2 || !elB.ep1) continue;

    const dist = getDist(elA.ep2, elB.ep1);
    if (dist > 0 && dist <= 6.0) {
      const prioA = getPriority(elA.type);
      const prioB = getPriority(elB.type);

      if (prioA <= prioB) {
        elA.ep2 = { ...elB.ep1 };
        fixLog.push({ type: 'Applied/Fix', stage: 'GAP_FIX_6MM', message: `Row ${elA._rowIndex}: Extended ep2 to close ${dist.toFixed(1)}mm gap.` });
      } else {
        elB.ep1 = { ...elA.ep2 };
        fixLog.push({ type: 'Applied/Fix', stage: 'GAP_FIX_6MM', message: `Row ${elB._rowIndex}: Extended ep1 to close ${dist.toFixed(1)}mm gap.` });
      }
    }
  }

  // IMPROVEMENT: A second pass could catch cascading gaps if A pulled B away from C.
  // For now, sequentially iterating fixes current local pairs accurately.

  if (fixLog.length === 0) {
      fixLog.push({ type: 'Info', stage: 'GAP_FIX_6MM', message: 'No gaps ≤ 6mm found.' });
  }

  return { updatedTable, fixLog };
};

/**
 * fix25mmGapsWithPipe
 * Handles 6-25mm anomalies.
 * If the endpoints overlap directionally, trims the pipe.
 * If the fitting is laterally skewed (<15mm), snaps it into alignment.
 * Otherwise, inserts a bridge pipe for true gaps.
 */
export const fix25mmGapsWithPipe = (dataTable, refPrefix = 'GAPFIX') => {
  if (!Array.isArray(dataTable)) return { updatedTable: [], fixLog: [] };

  // Clone dataTable deeply for mutation
  let updatedTable = dataTable.map(r => ({
      ...r,
      ep1: r.ep1 ? { ...r.ep1 } : null,
      ep2: r.ep2 ? { ...r.ep2 } : null
  }));

  const fixLog = [];
  let insertCount = 0;
  let trimCount = 0;
  let snapCount = 0;

  for (let i = 0; i < updatedTable.length - 1; i++) {
    const elA = updatedTable[i];
    const elB = updatedTable[i + 1];

    if (!elA.ep1 || !elA.ep2 || !elB.ep1 || !elB.ep2) continue;

    const dist = getDist(elA.ep2, elB.ep1);

    if (dist > 6.0 && dist <= 25.0) {

      // Calculate directional vectors
      const dirA = {
          x: elA.ep2.x - elA.ep1.x,
          y: elA.ep2.y - elA.ep1.y,
          z: elA.ep2.z - elA.ep1.z
      };
      const lenA = Math.sqrt(dirA.x**2 + dirA.y**2 + dirA.z**2);
      if (lenA === 0) continue;

      const uDirA = { x: dirA.x/lenA, y: dirA.y/lenA, z: dirA.z/lenA };

      const gapVec = {
          x: elB.ep1.x - elA.ep2.x,
          y: elB.ep1.y - elA.ep2.y,
          z: elB.ep1.z - elA.ep2.z
      };

      // Dot product to check if the gap is along the pipe's axis or opposing it
      const dot = (uDirA.x * gapVec.x) + (uDirA.y * gapVec.y) + (uDirA.z * gapVec.z);

      // Lateral skew calculation (distance from point to line)
      const t = dot; // Projection length along dirA
      const projPoint = {
          x: elA.ep2.x + uDirA.x * t,
          y: elA.ep2.y + uDirA.y * t,
          z: elA.ep2.z + uDirA.z * t
      };
      const lateralDist = getDist(elB.ep1, projPoint);

      // CASE 1: Skewed Fitting (Lateral offset < 15mm, longitudinal gap is minimal)
      if (lateralDist > 0.5 && lateralDist <= 15.0 && Math.abs(t) <= 6.0) {
          // Snap elB's ep1 to the projected point on elA's axis
          elB.ep1 = { ...projPoint };
          snapCount++;
          fixLog.push({ type: 'Applied/Fix', stage: 'ALIGN_SKEW', message: `Row ${elB._rowIndex} snapped ${lateralDist.toFixed(1)}mm to align with Row ${elA._rowIndex}.` });
          continue; // Move to next pair
      }

      // CASE 2: Overlap (Dot product is negative, meaning elB.ep1 is "inside" elA)
      if (dot < -6.0) {
          // It's an overlap. Trim elA's ep2 back to elB's ep1.
          if ((elA.type || '').toUpperCase() === 'PIPE') {
              elA.ep2 = { ...elB.ep1 };
              trimCount++;
              fixLog.push({ type: 'Applied/Fix', stage: 'TRIM_OVERLAP', message: `Row ${elA._rowIndex} trimmed by ${Math.abs(dot).toFixed(1)}mm to resolve overlap with Row ${elB._rowIndex}.` });
          } else if ((elB.type || '').toUpperCase() === 'PIPE') {
              elB.ep1 = { ...elA.ep2 };
              trimCount++;
              fixLog.push({ type: 'Applied/Fix', stage: 'TRIM_OVERLAP', message: `Row ${elB._rowIndex} trimmed by ${Math.abs(dot).toFixed(1)}mm to resolve overlap with Row ${elA._rowIndex}.` });
          }
          continue;
      }

      // CASE 3: True Gap (Dot product is positive > 6mm)
      if (dot > 6.0) {
        insertCount++;
        const prefix = elA.pipelineRef || refPrefix || 'GAPFIX';
        const newPipe = {
          _rowIndex: elA._rowIndex + 0.5, // Will be sorted and re-indexed
          type: 'PIPE',
          ep1: { ...elA.ep2 },
          ep2: { ...elB.ep1 },
          bore: parseFloat(elA.bore) || 0,
          pipelineRef: prefix,
          tag: `${prefix}_3DTopoBridge_25mmfix`,
          skey: elA.skey || 'PIPE',
          ca1: elA.ca1 || elA.CA1 || '',
          ca2: elA.ca2 || elA.CA2 || '',
          ca3: elA.ca3 || elA.CA3 || '',
          ca4: elA.ca4 || elA.CA4 || '',
          ca5: elA.ca5 || elA.CA5 || '',
          ca6: elA.ca6 || elA.CA6 || '',
          ca7: elA.ca7 || elA.CA7 || '',
          ca8: elA.ca8 || elA.CA8 || '',
          ca9: elA.ca9 || elA.CA9 || '',
          ca10: elA.ca10 || elA.CA10 || '',
          name: `${prefix}_3DTopoBridge_25mmfix`
        };
        updatedTable.push(newPipe);
        fixLog.push({ type: 'Applied/Fix', stage: 'GAP_FIX_25MM', message: `Inserted Pipe between Row ${elA._rowIndex} & ${elB._rowIndex} (${dist.toFixed(1)}mm gap).` });
      }
    }
  }

  // Sort by _rowIndex to integrate newly inserted pipes correctly, then re-index integers
  updatedTable.sort((a, b) => a._rowIndex - b._rowIndex);
  updatedTable = updatedTable.map((row, idx) => ({ ...row, _rowIndex: idx + 1 }));

  // Logging summaries
  if (insertCount > 5) {
      fixLog.push({ type: 'Warning', stage: 'GAP_FIX_25MM', message: `Inserted ${insertCount} gap pipes. May indicate underlying data quality issues.` });
  }

  if (insertCount === 0 && trimCount === 0 && snapCount === 0) {
      fixLog.push({ type: 'Info', stage: 'GAP_FIX_25MM', message: 'No 6-25mm anomalies found.' });
  }

  return { updatedTable, fixLog };
};

/**
 * breakPipeAtPoint
 * Breaks a pipe into two at a specified point on its segment.
 */
export const breakPipeAtPoint = (pipeRow, breakPoint) => {
  if (!pipeRow || !pipeRow.ep1 || !pipeRow.ep2 || !breakPoint) return null;

  const ep1 = { x: parseFloat(pipeRow.ep1.x), y: parseFloat(pipeRow.ep1.y), z: parseFloat(pipeRow.ep1.z) };
  const ep2 = { x: parseFloat(pipeRow.ep2.x), y: parseFloat(pipeRow.ep2.y), z: parseFloat(pipeRow.ep2.z) };
  const bp = { x: parseFloat(breakPoint.x), y: parseFloat(breakPoint.y), z: parseFloat(breakPoint.z) };

  // Calculate segment vector and length
  const vx = ep2.x - ep1.x;
  const vy = ep2.y - ep1.y;
  const vz = ep2.z - ep1.z;
  const lenSq = vx * vx + vy * vy + vz * vz;
  if (lenSq === 0) return null;

  // Parametric t
  const wx = bp.x - ep1.x;
  const wy = bp.y - ep1.y;
  const wz = bp.z - ep1.z;
  let t = (wx * vx + wy * vy + wz * vz) / lenSq;

  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t));

  let snapX = ep1.x + t * vx;
  let snapY = ep1.y + t * vy;
  let snapZ = ep1.z + t * vz;
  let snapBreak = { x: snapX, y: snapY, z: snapZ };

  const dist1 = getDist(ep1, snapBreak);
  const dist2 = getDist(snapBreak, ep2);
  const totalLen = Math.sqrt(lenSq);

  // If the pipe itself is shorter than 20mm, log an error (caller handles logging) and reject.
  if (totalLen < 20.0) {
      return null;
  }

  // If within 10mm of endpoints, clamp to 10mm.
  if (dist1 < 10.0) {
      const ratio = 10.0 / totalLen;
      snapBreak = { x: ep1.x + ratio * vx, y: ep1.y + ratio * vy, z: ep1.z + ratio * vz };
  } else if (dist2 < 10.0) {
      const ratio = (totalLen - 10.0) / totalLen;
      snapBreak = { x: ep1.x + ratio * vx, y: ep1.y + ratio * vy, z: ep1.z + ratio * vz };
  }

  // Re-check distances after clamping
  if (getDist(ep1, snapBreak) <= 1.0 || getDist(snapBreak, ep2) <= 1.0) {
      return null;
  }

  const baseTag = pipeRow.tag || pipeRow.name || 'PIPE';
  const rowA = { ...pipeRow, ep2: snapBreak, tag: `${baseTag}_1`, name: `${baseTag}_1` };
  const rowB = { ...pipeRow, ep1: snapBreak, tag: `${baseTag}_2`, name: `${baseTag}_2` };
  return [rowA, rowB];
};

/**
 * insertSupportAtPipe
 * Creates a SUPPORT row at a point along a pipe.
 */
export const insertSupportAtPipe = (pipeRow, position = null, attrs = {}) => {
  if (!pipeRow || !pipeRow.ep1 || !pipeRow.ep2) return null;

  let pos = position;
  if (!pos) {
    pos = {
      x: (parseFloat(pipeRow.ep1.x) + parseFloat(pipeRow.ep2.x)) / 2,
      y: (parseFloat(pipeRow.ep1.y) + parseFloat(pipeRow.ep2.y)) / 2,
      z: (parseFloat(pipeRow.ep1.z) + parseFloat(pipeRow.ep2.z)) / 2
    };
  }

  pos = { x: parseFloat(pos.x), y: parseFloat(pos.y), z: parseFloat(pos.z) };

  const prefix = pipeRow.pipelineRef || 'UNKNOWN';

  const supportRow = {
    type: 'SUPPORT',
    ep1: { ...pos },
    ep2: { x: pos.x, y: pos.y + 100.0, z: pos.z }, // Fixed +100mm Y stub
    bore: parseFloat(pipeRow.bore) || 0,
    pipelineRef: prefix,
    tag: `${prefix}_3DTopoSupport`,
    name: `${prefix}_3DTopoSupport`,
    type_supp: 'CA150',
    ...attrs
  };

  return supportRow;
};
