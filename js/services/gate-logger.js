import { log } from '../logger.js';

/**
 * Gate Logger — Wrapper for critical checkpoints with throttling.
 * Prevents log spam by limiting repetitive events.
 */

// Throttle state: tracks call counts per gate ID
const throttleState = new Map();
const THROTTLE_CONFIG = {
    enabled: true,
    logFirstN: 3,    // Log first 3 occurrences
    logLastN: 2,     // Log last 2 occurrences
    maxEvents: 1000  // Buffer limit before forcing summary
};

/**
 * Gate logger with throttling.
 * @param {string} module - Module name
 * @param {string} fn - Function name
 * @param {string} message - Log message
 * @param {object} snapshot - Data snapshot (optional)
 */
export function gate(module, fn, message, snapshot = {}) {
    const gateId = `${module}::${fn}`;

    if (!THROTTLE_CONFIG.enabled) {
        // Throttling disabled - log everything
        log('INFO', module, fn, `🚩 GATE: ${message}`, {
            ...snapshot,
            isGate: true,
            ts: performance.now(),
        });
        return;
    }

    // Initialize throttle state for this gate if needed
    if (!throttleState.has(gateId)) {
        throttleState.set(gateId, {
            count: 0,
            firstEvents: [],
            lastEvents: [],
            totalCount: 0
        });
    }

    const state = throttleState.get(gateId);
    state.count++;
    state.totalCount++;

    // Store in appropriate buffer
    const event = { message, snapshot, ts: performance.now() };

    if (state.count <= THROTTLE_CONFIG.logFirstN) {
        // Log first N immediately
        log('INFO', module, fn, `🚩 GATE: ${message}`, {
            ...snapshot,
            isGate: true,
            ts: event.ts,
            throttled: false
        });
        state.firstEvents.push(event);
    } else {
        // Buffer for last N
        state.lastEvents.push(event);
        if (state.lastEvents.length > THROTTLE_CONFIG.logLastN) {
            state.lastEvents.shift(); // Keep only last N
        }
    }

    // Force summary if hitting max events
    if (state.count >= THROTTLE_CONFIG.maxEvents) {
        flushThrottle(module, fn, gateId);
    }
}

/**
 * Flush throttled events (called at end of processing).
 * @param {string} module
 * @param {string} fn
 * @param {string} gateId
 */
function flushThrottle(module, fn, gateId) {
    const state = throttleState.get(gateId);
    if (!state || state.count <= THROTTLE_CONFIG.logFirstN) return;

    const skipped = state.count - THROTTLE_CONFIG.logFirstN - state.lastEvents.length;

    // Log summary
    log('INFO', module, fn, `🚩 GATE SUMMARY: ${state.totalCount} events`, {
        isGate: true,
        throttled: true,
        totalEvents: state.totalCount,
        skippedEvents: skipped,
        ts: performance.now()
    });

    // Log last N events
    state.lastEvents.forEach((event, idx) => {
        log('INFO', module, fn, `🚩 GATE (last ${state.lastEvents.length - idx}): ${event.message}`, {
            ...event.snapshot,
            isGate: true,
            throttled: false,
            ts: event.ts
        });
    });

    // Reset count for this gate
    state.count = 0;
    state.lastEvents = [];
}

/**
 * Manually flush all throttled gates (call at end of major operations).
 */
export function flushAllGates() {
    for (const [gateId, state] of throttleState.entries()) {
        const [module, fn] = gateId.split('::');
        flushThrottle(module, fn, gateId);
    }
}

/**
 * Reset throttle state (for testing or new runs).
 */
export function resetGateThrottle() {
    throttleState.clear();
}
