/**
 * state.js — AppState singleton
 * Single source of truth for all runtime data.
 * Modules subscribe to changes via subscribe(key, callback).
 * Only set() triggers notifications.
 */

const LOG_PREFIX = "[State]";

/** Initial empty state shape. All keys documented. */
const _initial = {
  config: null,   // Loaded ConfigStore (merged defaults + user)
  rawRows: [],     // Direct from CSV/Excel parser — unmodified
  headerMap: {},     // { rawHeader: canonicalName } from header-mapper
  unmappedHeaders: [],     // Raw headers that had no alias match
  canonicalRows: [],     // After header mapping
  normalizedRows: [],     // After unit stripping
  groups: new Map(),  // OrderedMap[refno → ComponentGroup]
  groupsPass1: null,   // Store for Pass 1 groups (Multi-pass)
  topology: null,   // { nodes, adj } from topology-builder
  traversalOrder: [],     // Ordered refno[] after DFS traversal
  pcfLines: [],     // Generated PCF lines (string[])
  pcfPass1Lines: [],     // Pass 1 PCF lines (for Multi-pass debug)
  validationReport: {
    input: [],     // Issue[] from input-validator
    continuity: [],     // Issue[] from continuity-checker
    anomaly: [],     // Issue[] from anomaly-detector
    syntax: [],     // Issue[] from syntax-validator
  },
  logs: [],     // Combined sorted LogEntry[]
  processingState: "idle", // "idle"|"parsing"|"converting"|"validating"|"done"|"error"
  meta: {
    filename: "",
    rowCount: 0,
    groupCount: 0,
    processedAt: null,
  },
  linelist: null,   // Linelist state (mapping, keys, data)
  weights: null,   // Weights master data
  pipingclass: null,   // Piping Class master data
  matmap: null,   // Material Mapping master data
  rayPcfLines: [],     // Ray Mode PCF — non-pipe components only (fittings skeleton)
  viewer3dComponents: [],     // Parsed PCF components for the React 3D Viewer
};

// Deep clone initial state for reset capability
let _state = JSON.parse(JSON.stringify(_initial, (k, v) => v instanceof Map ? {} : v));
_state.groups = new Map();

// Subscriber registry: key → [callback, ...]
const _subscribers = {};

/** Read a top-level or nested state value. */
export function getState(key) {
  if (!(key in _state)) {
    console.warn(`${LOG_PREFIX} getState: unknown key "${key}"`);
  }
  return _state[key];
}

/** Set a top-level state key and notify subscribers. */
export function setState(key, value) {
  if (!(key in _state)) {
    console.warn(`${LOG_PREFIX} setState: unknown key "${key}" — adding dynamically`);
  }
  const prev = _state[key];
  _state[key] = value;
  console.debug(`${LOG_PREFIX} setState "${key}"`, {
    prev: summarise(prev),
    next: summarise(value),
  });
  notify(key, value, prev);
}

/** Merge an object into a nested state key. Key must be object-type. */
export function mergeState(key, partial) {
  const current = _state[key];
  if (typeof current !== "object" || current === null || Array.isArray(current)) {
    console.error(`${LOG_PREFIX} mergeState: key "${key}" is not an object. Use setState instead.`);
    return;
  }
  const merged = { ...current, ...partial };
  setState(key, merged);
}

/** Subscribe to state changes. Returns unsubscribe function. */
export function subscribe(key, callback) {
  if (!_subscribers[key]) _subscribers[key] = [];
  _subscribers[key].push(callback);
  console.debug(`${LOG_PREFIX} Subscriber added for key "${key}". Total: ${_subscribers[key].length}`);
  return () => {
    _subscribers[key] = _subscribers[key].filter(cb => cb !== callback);
  };
}

/** Reset all state to initial values. Config is preserved. */
export function resetState() {
  const savedConfig = _state.config;
  _state = {
    ..._initial,
    groups: new Map(),
    validationReport: { input: [], continuity: [], anomaly: [], syntax: [] },
    config: savedConfig,
  };
  console.info(`${LOG_PREFIX} State reset. Config preserved.`);
  notify("*", _state, null);
}

/** Reset processing state for a new file upload.
 *  Preserves: config, linelist, weights, pipingclass, matmap (master data).
 *  Clears: all parsed/processed data, groups, PCF output, logs, etc. */
export function resetStateForNewFile() {
  const preserved = {
    config:      _state.config,
    linelist:    _state.linelist,
    weights:     _state.weights,
    pipingclass: _state.pipingclass,
    matmap:      _state.matmap,
  };
  _state = {
    ..._initial,
    groups: new Map(),
    validationReport: { input: [], continuity: [], anomaly: [], syntax: [] },
    ...preserved,
  };
  console.info(`${LOG_PREFIX} State reset for new file. Config + masters preserved.`);
  notify("*", _state, null);
}

/** Append a log entry to state.logs. */
export function appendLog(entry) {
  _state.logs = [..._state.logs, { ...entry, ts: Date.now() }];
}

// ── Private helpers ──────────────────────────────────────────────────

function notify(key, value, prev) {
  (_subscribers[key] || []).forEach(cb => {
    try { cb(value, prev); }
    catch (err) { console.error(`${LOG_PREFIX} Subscriber error for key "${key}":`, err); }
  });
  // Wildcard subscribers receive every change
  if (key !== "*") {
    (_subscribers["*"] || []).forEach(cb => {
      try { cb({ key, value, prev }); }
      catch (err) { console.error(`${LOG_PREFIX} Wildcard subscriber error:`, err); }
    });
  }
}

/** Produce a short summary of a value for logging. */
function summarise(v) {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (v instanceof Map) return `Map(${v.size})`;
  if (typeof v === "object") return `Object{${Object.keys(v).slice(0, 3).join(",")}}`;
  return String(v).slice(0, 80);
}
