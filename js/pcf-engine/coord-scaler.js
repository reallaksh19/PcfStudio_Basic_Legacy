/**
 * coord-scaler.js — Coordinate overflow guard with ÷1000 scaling.
 *
 * If any coordinate component exceeds ENGINE_CONFIG.coordMaxDigits,
 * shows a non-blocking notification and divides all coords by 1000.
 *
 * Exports:
 *   maybeScaleCoords(components, showPopup?) → Promise<{ components, scaled }>
 *   scaleComponent(comp, divisor) → component
 */

import { ENGINE_CONFIG } from './engine-config.js';

/**
 * Scale a single point by a divisor.
 */
function scalePoint(pt, divisor) {
  if (!pt || typeof pt !== 'object') return pt;
  return { x: pt.x / divisor, y: pt.y / divisor, z: pt.z / divisor };
}

/**
 * Deep-copy a component with all coordinate fields divided by divisor.
 */
export function scaleComponent(comp, divisor) {
  return {
    ...comp,
    ep1:         scalePoint(comp.ep1, divisor),
    ep2:         scalePoint(comp.ep2, divisor),
    cp:          scalePoint(comp.cp, divisor),
    bp:          scalePoint(comp.bp, divisor),
    supportCoor: typeof comp.supportCoor === 'object' && comp.supportCoor
                   ? scalePoint(comp.supportCoor, divisor)
                   : comp.supportCoor,
  };
}

function hasOverflowCoord(pt, max) {
  if (!pt || typeof pt !== 'object') return false;
  return Math.abs(pt.x) > max || Math.abs(pt.y) > max || Math.abs(pt.z) > max;
}

/**
 * Check all coordinates in a component list.
 * If any exceed ENGINE_CONFIG.coordMaxDigits, optionally show a popup and
 * return a scaled copy with all coords ÷ 1000.
 *
 * @param {object[]} components
 * @param {function} [showPopup]  — optional async fn → boolean confirmation
 *                                  defaults to auto-scale without asking
 * @returns {Promise<{ components: object[], scaled: boolean }>}
 */
export async function maybeScaleCoords(components, showPopup) {
  const max = ENGINE_CONFIG.coordMaxDigits;

  const hasOverflow = components.some(c =>
    [c.ep1, c.ep2, c.cp, c.bp, c.supportCoor].some(pt => hasOverflowCoord(pt, max))
  );

  if (!hasOverflow) return { components, scaled: false };

  let confirmed = true;
  if (typeof showPopup === 'function') {
    confirmed = await showPopup(
      `One or more coordinates exceed ${max.toLocaleString()} mm. Divide all coordinates by 1000?`
    );
  }

  if (!confirmed) return { components, scaled: false };

  return {
    components: components.map(c => scaleComponent(c, 1000)),
    scaled: true,
  };
}
