function fmt(n) { return Number.isFinite(Number(n)) ? String(Number(n)) : '0'; }

export function Pro2D_importSimpleDxf(text) {
  const lines = String(text || '').split(/\r?\n/);
  const entities = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].trim();
    if (code === '0' && ['LINE', 'ARC', 'CIRCLE', 'TEXT'].includes(value)) {
      const entity = { type: value };
      i += 2;
      for (; i < lines.length - 1; i += 2) {
        const c = lines[i].trim();
        const v = lines[i + 1].trim();
        if (c === '0') { i -= 2; break; }
        entity[c] = v;
      }
      entities.push(entity);
    }
  }
  return entities;
}

export function Pro2D_exportSimpleDxf(scene = {}) {
  const out = ['0','SECTION','2','ENTITIES'];
  const segments = Object.values(scene.segments || {});
  for (const seg of segments) {
    const pts = seg.points || [];
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (!a || !b) continue;
    out.push('0','LINE','8',String(seg.metadata?.layer || 'PRO2D'),'10',fmt(a.x),'20',fmt(a.y),'11',fmt(b.x),'21',fmt(b.y));
  }
  const fittings = Object.values(scene.fittings || {});
  for (const fit of fittings) {
    if (fit.type === 'BEND' && fit.centerPoint && Number.isFinite(fit.radius)) {
      out.push('0','ARC','8',String(fit.metadata?.layer || 'PRO2D_FIT'),'10',fmt(fit.centerPoint.x),'20',fmt(fit.centerPoint.y),'40',fmt(fit.radius),'50',fmt(fit.angle || 0),'51',fmt((fit.angle || 0) + (fit.angleDeg || 90)));
    } else {
      out.push('0','TEXT','8',String(fit.metadata?.layer || 'PRO2D_FIT'),'10',fmt(fit.x),'20',fmt(fit.y),'1',String(fit.type));
    }
  }
  for (const item of Object.values(scene.inlineItems || {})) {
    out.push('0','TEXT','8',String(item.metadata?.layer || 'PRO2D_INLINE'),'10',fmt(item.x),'20',fmt(item.y),'1',String(item.type).toUpperCase());
  }
  for (const support of Object.values(scene.supports || {})) {
    out.push('0','CIRCLE','8',String(support.metadata?.layer || 'PRO2D_SUPPORT'),'10',fmt(support.x),'20',fmt(support.y),'40','5');
  }
  out.push('0','ENDSEC','0','EOF');
  return out.join('\n');
}
