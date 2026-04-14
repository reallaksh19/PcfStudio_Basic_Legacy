/**
 * Wrapper for PapaParse to support native ESM loading in browser.
 * Relies on papaparse.min.js being loaded via <script> tag.
 */
const Papa = window.Papa;
export default Papa;
