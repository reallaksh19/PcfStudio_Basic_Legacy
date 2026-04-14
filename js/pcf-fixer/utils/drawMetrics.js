export function emitDrawMetric(payload) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('draw-metric', {
            detail: {
                timestamp: Date.now(),
                tool: payload.tool,
                phase: payload.phase,
                result: payload.result || 'NA',
                latencyMs: payload.latencyMs ?? null,
                rowUid: payload.rowUid ?? null,
                errorClass: payload.errorClass ?? null
            }
        }));
    }
}
