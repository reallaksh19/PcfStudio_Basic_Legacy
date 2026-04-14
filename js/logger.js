/**
 * logger.js — Centralized structured logging
 * All modules import from here. Logs accumulate in AppState AND console.
 * Format is AI-parseable: every entry has module, fn, level, message, data.
 *
 * Rules:
 *  - Never throw from this module
 *  - Levels: DEBUG < INFO < WARN < ERROR
 *  - data field provides full context for failure diagnosis
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// Runtime log accumulator — imported by state.js and cleared on new parse
let _entries = [];
let _minLevel = LOG_LEVELS.INFO; // suppress DEBUG in production

/** @returns {LogEntry[]} snapshot of all entries */
export const getEntries = () => [..._entries];

/** Clear all accumulated log entries (call before each new conversion run) */
export const clearEntries = () => { _entries = []; };

/** Set minimum log level to display. 'DEBUG'|'INFO'|'WARN'|'ERROR' */
export const setMinLevel = (level) => {
  if (LOG_LEVELS[level] === undefined) return;
  _minLevel = LOG_LEVELS[level];
};

/**
 * Core log function.
 * @param {'DEBUG'|'INFO'|'WARN'|'ERROR'} level
 * @param {string} module  - filename without .js e.g. 'csv-parser'
 * @param {string} fn      - function name e.g. 'parseCSV'
 * @param {string} message - human readable description
 * @param {object} [data]  - structured context (refno, coords, values, etc.)
 */
export const log = (level, module, fn, message, data = {}) => {
  if (LOG_LEVELS[level] === undefined) level = 'INFO';
  if (LOG_LEVELS[level] < _minLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    fn,
    message,
    data,
  };

  _entries.push(entry);

  // Console output with structured prefix
  const prefix = `[${entry.timestamp}] [${level}] [${module}::${fn}]`;
  const output = data && Object.keys(data).length > 0
    ? `${prefix} ${message} | ${JSON.stringify(data)}`
    : `${prefix} ${message}`;

  if (level === 'ERROR') console.error(output);
  else if (level === 'WARN') console.warn(output);
  else if (level === 'DEBUG') console.debug(output);
  else console.info(output);
};

/** Convenience shorthands */
export const debug = (mod, fn, msg, data) => log('DEBUG', mod, fn, msg, data);
export const info  = (mod, fn, msg, data) => log('INFO',  mod, fn, msg, data);
export const warn  = (mod, fn, msg, data) => log('WARN',  mod, fn, msg, data);
export const error = (mod, fn, msg, data) => log('ERROR', mod, fn, msg, data);

/**
 * Wrap a function call with automatic error logging.
 * Returns null on failure instead of throwing.
 * @template T
 * @param {string} module
 * @param {string} fn
 * @param {() => T} callable
 * @returns {T|null}
 */
export const tryCatch = (module, fn, callable) => {
  try {
    return callable();
  } catch (e) {
    error(module, fn, `Uncaught exception: ${e.message}`, {
      errorType: e.constructor.name,
      stack: e.stack?.split('\n').slice(0, 4).join(' | '),
    });
    return null;
  }
};
