function toNum(value, field, log, ctx) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    log.warn('BAD_NUMBER', { field, value, ctx });
    return null;
  }
  return n;
}

function parseCoordString(str, log, ctx) {
  if (!str) return null;
  const parts = String(str).trim().split(/\s+/);
  if (parts.length < 3) {
    log.warn('BAD_COORD', { value: str, ctx });
    return null;
  }
  const x = toNum(parts[0], 'coord_x', log, ctx);
  const y = toNum(parts[1], 'coord_y', log, ctx);
  const z = toNum(parts[2], 'coord_z', log, ctx);
  // Optionally parse bore if parts.length >= 4, but for now just x, y, z
  let bore = null;
  if (parts.length >= 4) bore = toNum(parts[3], 'coord_bore', log, ctx);

  if (x === null || y === null || z === null) return null;
  return { x, y, z, bore };
}

function normalizeBlock(block, log, idx) {
  const { type, parsed, rawAttrs } = block;
  const id = `${type.toLowerCase()}_${idx}`;

  const comp = {
    id,
    type,
    ep1: null,
    ep2: null,
    cp: null,
    bp: null,
    bore: null,
    refNo: parsed['COMPONENT-ATTRIBUTE97'] || parsed['COMPONENT-ATTRIBUTE98'] || '',
    spec: parsed['PIPING-CLASS'] || '',
    skey: parsed['SKEY'] || '',
    raw: rawAttrs,
  };

  // Endpoints
  const eps = parsed['END-POINT'] || [];
  if (eps.length > 0) comp.ep1 = parseCoordString(eps[0], log, id);
  if (eps.length > 1) comp.ep2 = parseCoordString(eps[1], log, id);

  const cps = parsed['CENTRE-POINT'] || [];
  if (cps.length > 0) comp.cp = parseCoordString(cps[0], log, id);

  const bps = parsed['BRANCH1-POINT'] || [];
  if (bps.length > 0) comp.bp = parseCoordString(bps[0], log, id);

  // Establish primary bore
  if (comp.ep1 && comp.ep1.bore !== null) comp.bore = comp.ep1.bore;
  else if (comp.cp && comp.cp.bore !== null) comp.bore = comp.cp.bore;

  // Basic validation check
  if (!comp.ep1 && !comp.cp) {
    log.warn('NO_GEOM_ANCHOR', { id, type });
  }

  return comp;
}

export function normalizePcfModel(parsed, log) {
  const components = [];

  for (let i = 0; i < parsed.blocks.length; i++) {
    const block = parsed.blocks[i];
    const comp = normalizeBlock(block, log, i + 1);
    if (comp) components.push(comp);
  }

  log.info('NORMALIZE_COMPLETE', { normalized: components.length, original: parsed.blocks.length });

  return {
    meta: parsed.meta,
    headers: parsed.headers,
    components,
  };
}
