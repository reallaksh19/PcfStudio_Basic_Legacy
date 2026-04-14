// ═══════════════════════════════════════════════════════════════
// DEBUG GATE UTILITY
// Provides gated logging for development. All gates are OFF
// by default in production. Enable via Settings > Debug Console.
//
// Usage:
//   import { dbg } from '/js/pcf-fixer-runtime/utils/debugGate.js';
//   dbg.tool('MARQUEE_SELECT', 'Selected 12 elements', { ids });
//   dbg.event('POINTER_DOWN', 'InstancedPipes hit', { instanceId: 5 });
//   dbg.state('TRANSLUCENT', 'Mode toggled', { prev: false, next: true });
//   dbg.warn('SUPPORT_PANEL', 'Selection cleared by onPointerMissed');
//   dbg.error('THEME', 'Invalid theme key', { key: 'NONEXISTENT' });
// ═══════════════════════════════════════════════════════════════
const MAX_ENTRIES = 500;
// In-memory ring buffer
let _entries = [];
let _listeners = new Set();
let _enabledChannels = new Set(['*']); // '*' means all
let _isEnabled = false;
const CHANNELS = {
  TOOL:   { color: '#60a5fa', prefix: '🔧' },  // Blue — tool activation/deactivation
  EVENT:  { color: '#a78bfa', prefix: '📍' },  // Violet — pointer/keyboard events
  STATE:  { color: '#34d399', prefix: '📊' },  // Green — state mutations
  RENDER: { color: '#fbbf24', prefix: '🎨' },  // Amber — render cycles, perf
  WARN:   { color: '#fb923c', prefix: '⚠️' },  // Orange — non-fatal issues
  ERROR:  { color: '#f87171', prefix: '❌' },  // Red — errors
  FIX:    { color: '#22d3ee', prefix: '🩹' },  // Cyan — applied fixes
  SYNC:   { color: '#e879f9', prefix: '🔄' },  // Pink — store sync events
};
function _push(channel, source, message, data) {
  if (!_isEnabled) return;
  if (!_enabledChannels.has('*') && !_enabledChannels.has(channel)) return;
  const entry = {
    id: _entries.length,
    timestamp: performance.now(),
    channel,
    source,
    message,
    data: data ?? null,
    channelMeta: CHANNELS[channel] || CHANNELS.TOOL,
  };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();
  // Notify listeners (DebugConsole component)
  _listeners.forEach(fn => fn(entry));
  // Also mirror to browser console in dev
  if (import.meta.env?.DEV) {
    const style = `color: ${entry.channelMeta.color}; font-weight: bold;`;
    console.log(
      `%c[${channel}] ${entry.channelMeta.prefix} ${source}: ${message}`,
      style,
      data ?? ''
    );
  }
}
export const dbg = {
  tool:   (source, msg, data) => _push('TOOL', source, msg, data),
  event:  (source, msg, data) => _push('EVENT', source, msg, data),
  state:  (source, msg, data) => _push('STATE', source, msg, data),
  render: (source, msg, data) => _push('RENDER', source, msg, data),
  warn:   (source, msg, data) => _push('WARN', source, msg, data),
  error:  (source, msg, data) => _push('ERROR', source, msg, data),
  fix:    (source, msg, data) => _push('FIX', source, msg, data),
  sync:   (source, msg, data) => _push('SYNC', source, msg, data),
  // Control API
  enable:  () => { _isEnabled = true; },
  disable: () => { _isEnabled = false; },
  isEnabled: () => _isEnabled,
  setChannels: (channels) => { _enabledChannels = new Set(channels); },
  getEntries: () => [..._entries],
  clear: () => { _entries = []; _listeners.forEach(fn => fn(null)); },
  subscribe: (fn) => { _listeners.add(fn); return () => _listeners.delete(fn); },
  // Constants
  CHANNELS,
};