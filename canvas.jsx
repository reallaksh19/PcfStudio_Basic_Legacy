/**
 * canvas.jsx — thin re-export shim.
 * All logic now lives in js/coorcanvas/CoorCanvas_AppShell.jsx.
 * This file exists so that existing imports of '../../canvas.jsx'
 * (e.g. in coord2pcf-tab.js) continue to work without changes.
 */
export { default } from './js/coorcanvas/CoorCanvas_AppShell.jsx';
