/**
 * config-store.js
 * Load/save/merge config from localStorage.
 * Single responsibility: config persistence.
 * All other modules call getConfig() — never import defaults.js directly.
 */

import { DEFAULT_CONFIG, SCHEMA_VERSION } from "./defaults.js";

const STORAGE_KEY = "pcf_converter_config";
const LOG_PREFIX  = "[ConfigStore]";

/** Deep merge: user overrides layer on top of defaults. */
function deepMerge(base, override) {
  if (typeof base !== "object" || base === null) return override ?? base;
  if (typeof override !== "object" || override === null) return base;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    result[key] = (key in base && typeof base[key] === "object" && !Array.isArray(base[key]))
      ? deepMerge(base[key], override[key])
      : override[key];
  }
  return result;
}

/** Load config from localStorage. Falls back to defaults on any error. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.info(`${LOG_PREFIX} No saved config found. Using defaults.`);
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed._version !== SCHEMA_VERSION) {
      console.warn(`${LOG_PREFIX} Config schema mismatch: saved=${parsed._version} expected=${SCHEMA_VERSION}. Resetting.`);
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    console.info(`${LOG_PREFIX} Loaded config v${parsed._version} from localStorage.`);
    return parsed;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to parse saved config. Reason: ${err.message}. Using defaults.`);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

// In-memory config — initialized once on module load
let _config = null;

/** Initialise: merge defaults + localStorage overrides. */
function init() {
  const saved = loadFromStorage();
  _config = saved ? deepMerge(DEFAULT_CONFIG, saved) : { ...DEFAULT_CONFIG };
  console.info(`${LOG_PREFIX} Config initialised.`, { keys: Object.keys(_config) });
}

/** Get the current merged config. Throws if not initialised. */
export function getConfig() {
  if (!_config) init();
  return _config;
}

/** Save full config to localStorage. */
export function saveConfig(configObj) {
  try {
    configObj._version = SCHEMA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configObj));
    _config = configObj;
    console.info(`${LOG_PREFIX} Config saved.`);
    return { ok: true };
  } catch (err) {
    console.error(`${LOG_PREFIX} Save failed. Reason: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Update a single config path and save. path = dot-separated e.g. "outputSettings.lineEnding" */
export function setConfigValue(path, value) {
  const keys = path.split(".");
  let node = _config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in node)) {
      console.error(`${LOG_PREFIX} setConfigValue: path not found: "${path}"`);
      return { ok: false, error: `Path not found: ${path}` };
    }
    node = node[keys[i]];
  }
  const leafKey = keys[keys.length - 1];
  const oldVal = node[leafKey];
  node[leafKey] = value;
  console.info(`${LOG_PREFIX} setConfigValue "${path}": ${JSON.stringify(oldVal)} → ${JSON.stringify(value)}`);
  return saveConfig(_config);
}

/** Export config as JSON string for download. */
export function exportConfig() {
  return JSON.stringify(_config, null, 2);
}

/** Import config from JSON string. Validates schema version. */
export function importConfig(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed._version) {
      return { ok: false, error: "Missing _version in imported config." };
    }
    const merged = deepMerge(DEFAULT_CONFIG, parsed);
    return saveConfig(merged);
  } catch (err) {
    console.error(`${LOG_PREFIX} importConfig failed. Reason: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Reset to factory defaults. Clears localStorage. */
export function resetConfig() {
  localStorage.removeItem(STORAGE_KEY);
  _config = { ...DEFAULT_CONFIG };
  console.info(`${LOG_PREFIX} Config reset to defaults.`);
  return { ok: true };
}
