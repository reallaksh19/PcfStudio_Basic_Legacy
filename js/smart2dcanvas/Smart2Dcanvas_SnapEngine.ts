import { useSceneStore } from './Smart2Dcanvas_SceneStore';

export type SnapResult = {
  pt: { x: number; y: number; z?: number };
  kind: 'endpoint' | 'midpoint' | 'inline' | 'support' | 'intersection' | 'nearest';
  id: string;
  distance: number;
};

function distanceToSegment(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return { pt: a, distance: Math.hypot(x - a.x, y - a.y) };
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
  const pt = { x: a.x + t * dx, y: a.y + t * dy };
  return { pt, distance: Math.hypot(x - pt.x, y - pt.y) };
}

function segmentIntersection(a1: any, a2: any, b1: any, b2: any) {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const ua = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const ub = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
  return { x: a1.x + ua * (a2.x - a1.x), y: a1.y + ua * (a2.y - a1.y) };
}

export function calculateSnap(x: number, y: number, scale = 1): SnapResult | null {
  const state = useSceneStore.getState();
  const threshold = 14 / Math.max(scale || 1, 0.001);
  let best: SnapResult | null = null;

  const consider = (pt: { x: number; y: number; z?: number }, kind: SnapResult['kind'], id: string) => {
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d > threshold) return;
    if (!best || d < best.distance) best = { pt, kind, id, distance: d };
  };

  const segments = Object.values(state.segments || {});
  segments.forEach((seg) => {
    if (!seg.points?.length) return;
    const pts = seg.points;
    consider(pts[0], 'endpoint', `${seg.id}:start`);
    consider(pts[pts.length - 1], 'endpoint', `${seg.id}:end`);
    if (pts.length >= 2) {
      const mid = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 };
      consider(mid, 'midpoint', `${seg.id}:mid`);
      const nearest = distanceToSegment(x, y, pts[0], pts[pts.length - 1]);
      consider(nearest.pt, 'nearest', `${seg.id}:nearest`);
    }
  });

  for (let i = 0; i < segments.length; i += 1) {
    const a = segments[i].points;
    if (!a?.length) continue;
    for (let j = i + 1; j < segments.length; j += 1) {
      const b = segments[j].points;
      if (!b?.length) continue;
      const hit = segmentIntersection(a[0], a[a.length - 1], b[0], b[b.length - 1]);
      if (hit) consider(hit, 'intersection', `${segments[i].id}:${segments[j].id}`);
    }
  }

  Object.values(state.inlineItems).forEach((item) => consider({ x: item.x, y: item.y }, 'inline', item.id));
  Object.values(state.supports).forEach((support) => consider({ x: support.x, y: support.y }, 'support', support.id));

  return best;
}
