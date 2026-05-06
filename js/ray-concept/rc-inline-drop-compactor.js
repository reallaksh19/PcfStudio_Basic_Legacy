/**
 * rc-inline-drop-compactor.js
 *
 * Handles geometry continuity when inline components are intentionally suppressed
 * from ISOPCFCSV / PCF generation.
 *
 * Main case:
 *   GASKET is dropped, but upstream.EP2 and downstream.EP1 must be collapsed
 *   to a common point so downstream PCF topology remains connected.
 */

const DEFAULT_DROP_TYPES = new Set(['GASKET']);

function typeOf(row) {
  return String(
    row?.type ??
    row?.Type ??
    row?.COMPONENT ??
    row?.Component ??
    row?.component ??
    ''
  ).trim().toUpperCase();
}

function isDroppedInline(row, dropTypes = DEFAULT_DROP_TYPES) {
  return dropTypes.has(typeOf(row));
}

function clonePoint(pt) {
  if (!pt) return null;
  const x = Number(pt.x ?? pt.X ?? pt[0]);
  const y = Number(pt.y ?? pt.Y ?? pt[1]);
  const z = Number(pt.z ?? pt.Z ?? pt[2]);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function getEp(row, epName) {
  if (!row) return null;

  if (epName === 'ep1') {
    return clonePoint(row.ep1 || row.EP1 || row.start || row.Start);
  }

  if (epName === 'ep2') {
    return clonePoint(row.ep2 || row.EP2 || row.end || row.End);
  }

  return null;
}

function midpoint(a, b) {
  if (a && b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
    };
  }
  return clonePoint(a || b);
}

function setEp(row, epName, point) {
  if (!row || !point) return;

  const p = clonePoint(point);
  if (!p) return;

  row[epName] = { ...p };

  // Keep common aliases in sync if present.
  const upper = epName.toUpperCase();
  if (row[upper]) row[upper] = { ...p };

  if (epName === 'ep1') {
    if ('Start X' in row) row['Start X'] = p.x;
    if ('Start Y' in row) row['Start Y'] = p.y;
    if ('Start Z' in row) row['Start Z'] = p.z;

    if ('StartX' in row) row.StartX = p.x;
    if ('StartY' in row) row.StartY = p.y;
    if ('StartZ' in row) row.StartZ = p.z;

    if ('EP1_X' in row) row.EP1_X = p.x;
    if ('EP1_Y' in row) row.EP1_Y = p.y;
    if ('EP1_Z' in row) row.EP1_Z = p.z;
  }

  if (epName === 'ep2') {
    if ('End X' in row) row['End X'] = p.x;
    if ('End Y' in row) row['End Y'] = p.y;
    if ('End Z' in row) row['End Z'] = p.z;

    if ('EndX' in row) row.EndX = p.x;
    if ('EndY' in row) row.EndY = p.y;
    if ('EndZ' in row) row.EndZ = p.z;

    if ('EP2_X' in row) row.EP2_X = p.x;
    if ('EP2_Y' in row) row.EP2_Y = p.y;
    if ('EP2_Z' in row) row.EP2_Z = p.z;
  }
}

function cloneComponent(row) {
  return {
    ...row,
    ep1: row?.ep1 ? { ...row.ep1 } : row?.ep1,
    ep2: row?.ep2 ? { ...row.ep2 } : row?.ep2,
    cp: row?.cp ? { ...row.cp } : row?.cp,
    bp: row?.bp ? { ...row.bp } : row?.bp,
  };
}

/**
 * Groups consecutive dropped inline rows, removes them, and collapses the
 * adjacent kept components to a common joint point.
 */
export function compactDroppedInlineComponentsForIsoPcf(components, options = {}) {
  const rows = Array.isArray(components) ? components.map(cloneComponent) : [];
  const dropTypes = new Set(
    (options.dropTypes || ['GASKET']).map(t => String(t).trim().toUpperCase())
  );

  const result = [];
  const dropLog = [];

  let i = 0;

  while (i < rows.length) {
    const row = rows[i];

    if (!isDroppedInline(row, dropTypes)) {
      result.push(row);
      i += 1;
      continue;
    }

    // Start of one or more consecutive suppressed inline components.
    const groupStart = i;
    const dropped = [];

    while (i < rows.length && isDroppedInline(rows[i], dropTypes)) {
      dropped.push(rows[i]);
      i += 1;
    }

    const groupEnd = i - 1;

    const upstream = result.length ? result[result.length - 1] : null;
    const downstream = i < rows.length ? rows[i] : null;

    const firstDrop = dropped[0];
    const lastDrop = dropped[dropped.length - 1];

    const dropStart = getEp(firstDrop, 'ep1') || getEp(firstDrop, 'ep2');
    const dropEnd = getEp(lastDrop, 'ep2') || getEp(lastDrop, 'ep1');

    // Use midpoint to avoid biasing upstream or downstream by full gasket thickness.
    // This makes both adjacent endpoints equal and preserves deterministic topology.
    const joint = midpoint(dropStart, dropEnd);

    if (upstream && downstream && joint) {
      setEp(upstream, 'ep2', joint);
      setEp(downstream, 'ep1', joint);

      dropLog.push({
        status: 'compacted',
        droppedCount: dropped.length,
        droppedTypes: dropped.map(typeOf),
        groupStart,
        groupEnd,
        upstreamRef: upstream.refNo || upstream.RefNo || upstream.id || '',
        downstreamRef: downstream.refNo || downstream.RefNo || downstream.id || '',
        joint,
      });
    } else {
      dropLog.push({
        status: 'dropped-without-compaction',
        droppedCount: dropped.length,
        droppedTypes: dropped.map(typeOf),
        groupStart,
        groupEnd,
        reason: !upstream ? 'missing-upstream' : !downstream ? 'missing-downstream' : 'missing-gasket-endpoints',
      });
    }

    // Do not push dropped rows.
  }

  return {
    components: result,
    dropLog,
  };
}
