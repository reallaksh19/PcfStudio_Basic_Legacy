export function toStrictNumber(value, fallback = NaN) {
  const n = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

export function convertInchToMmIfEnabled(rawBore, enableBoreInchToMm, standardMmBores = []) {
  const bore = toStrictNumber(rawBore, NaN);
  if (!Number.isFinite(bore)) return null;
  if (!enableBoreInchToMm) return bore;

  const std = new Set((standardMmBores || []).map(v => Number(v)));
  if (bore <= 48 && !std.has(bore)) {
    return Math.round(bore * 25.4 * 10) / 10;
  }
  return bore;
}
