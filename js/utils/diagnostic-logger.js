/**
 * DiagnosticLogger — Utility for logging detailed mapping diagnostics
 * Tracks header detection, SmartProcessMap mapping, RigidType/Material matching,
 * and generates summary statistics.
 */

export class DiagnosticLogger {
    constructor() {
        this.logs = []; // Array of { level, message, details, timestamp, componentIndex }
        this.stats = this._initStats();
        this.currentComponent = null;
    }

    _initStats() {
        return {
            totalComponents: 0,
            linelistMatches: 0,
            rigidTypeMatches: 0,
            materialMatches: 0,
            materialLevel1: 0,
            materialLevel2: 0,
            materialLevel3: 0,
            warnings: 0,
            errors: 0
        };
    }

    reset() {
        this.logs = [];
        this.stats = this._initStats();
        this.currentComponent = null;
    }

    _add(level, message, details = null) {
        this.logs.push({
            level,
            message,
            details,
            timestamp: new Date().toISOString().split('T')[1].slice(0, -1), // HH:MM:SS.mmm
            component: this.currentComponent
        });
    }

    startComponent(index, type) {
        this.stats.totalComponents++;
        this.currentComponent = { index, type };
        this._add('SECTION', `[Component #${index + 1}: ${type}]`);
    }

    success(message, details) { this._add('SUCCESS', message, details); }
    error(message, details) {
        this._add('ERROR', message, details);
        this.stats.errors++;
    }
    warn(message, details) {
        this._add('WARN', message, details);
        this.stats.warnings++;
    }
    info(message, details) { this._add('INFO', message, details); }
    assumption(message, details) { this._add('ASSUME', message, details); }

    // Specific logging methods
    logDNExtraction(dn) {
        this.success(`DN extracted: ${dn} from comp.bore`);
    }

    logLinelistMatch(lineNo, service) {
        this.success(`Linelist match: Line No "${lineNo}" (Service: "${service}")`);
        this.stats.linelistMatches++;
    }

    logLinelistNoMatch(lineNo) {
        this.error(`No linelist match for Line No: "${lineNo || 'N/A'}"`);
    }

    logSmartMapSuccess(attr, column, value) {
        this.success(`${attr} mapped from "${column}" → ${value}`);
    }

    logSmartMapFail(attr, column) {
        this.error(`${attr} mapping failed: column "${column}" not found or not configured`);
    }

    logSmartMapFuzzy(attr, column, value) {
        this.warn(`${attr} mapped from "${column}" → ${value} (fuzzy match: possible whitespace)`);
    }

    logSmartMapDefault(attr, value) {
        this.assumption(`${attr} using default/fallback value: ${value}`);
    }

    logInsDenDefault(insThk) {
        if (insThk > 0) {
            this.assumption(`ATTRIBUTE6 (InsDen): InsThk=${insThk} > 0 → Applying default 210`);
        } else {
            this.info(`ATTRIBUTE6 (InsDen): InsThk=${insThk} = 0 → Blank`);
        }
    }

    logDensityResolution(phase, preference, value) {
        if (value) {
            this.success(`Density: Phase="${phase}" → Using ${preference} density: ${value}`);
        } else {
            this.assumption(`Density: Phase not found or invalid, using default fallback`);
        }
    }

    logRigidTypeMatch(dn, len, tolerance, diff, typeDesc, weight) {
        this.success(`RigidType match: DN=${dn}, Len=${len.toFixed(1)}mm (±${tolerance}mm, diff=${diff.toFixed(1)}mm) → "${typeDesc}", Weight: ${weight}kg`);
        this.stats.rigidTypeMatches++;
    }

    logRigidTypeNoMatch(dn, len) {
        this.error(`No RigidType match for DN=${dn}, Len=${len.toFixed(1)}mm`);
    }

    logMaterialMatch(dn, pipingClass, level, material, wall) {
        const levelNames = { 1: 'Exact', 2: 'Trim 1 char + *', 3: 'Trim 2 chars + *' };
        const levelName = levelNames[level] || `Level ${level}`;

        if (level === 1) {
            this.success(`Material match: DN=${dn}, Class="${pipingClass}" (Level 1: ${levelName}) → Material: "${material}", Wall: ${wall}`);
            this.stats.materialLevel1++;
        } else {
            this.warn(`Material match: DN=${dn}, Class="${pipingClass}" (Level ${level}: ${levelName}) → Material: "${material}", Wall: ${wall}`);
            if (level === 2) this.stats.materialLevel2++;
            if (level === 3) this.stats.materialLevel3++;
        }
        this.stats.materialMatches++;
    }

    logMaterialNoMatch(dn, pipingClass) {
        this.error(`No Material match for DN=${dn}, Class="${pipingClass}" (tried all 3 levels)`);
    }

    logHeaderDetection(type, headers, missing = []) {
        if (missing.length === 0) {
            this.success(`${type} headers detected: ${headers.slice(0, 3).join(', ')}${headers.length > 3 ? '...' : ''}`);
        } else {
            this.warn(`${type} missing headers: ${missing.join(', ')}`);
        }
    }

    // Geometry & Topology Logging (GATE 4)
    logSegmentCut(originalLen, newLen, remainingLen) {
        this.info(`GEOMETRY SPLIT: Pipe cut by Segmentizer. Original: ${originalLen.toFixed(1)}mm → Cut: ${newLen.toFixed(1)}mm, Remaining: ${remainingLen.toFixed(1)}mm`);
    }

    logOverlapSplit(engulfing, inner) {
        this.info(`GEOMETRY CUT: Overlap block resolved. Pipe ${engulfing} split by intersecting component ${inner}.`);
    }

    logBoreToleranceFailure(group1, group2, bore1, bore2, tol) {
        this.warn(`TOPOLOGY REJECT: Bore tolerance failure between ${group1} (${bore1}mm) and ${group2} (${bore2}mm). Limit: ${tol}mm.`);
    }

    logRoutingDropNA(refNo, direction) {
        this.error(`ROUTING SEVERED: Assigned "N/A" for ${direction} mapping on ${refNo}. Sequence graph forcefully broken here.`);
    }

    // Generate summary
    getSummary() {
        const lines = [];
        lines.push('\n═══════════════════════════════════════');
        lines.push('MAPPING SUMMARY');
        lines.push('═══════════════════════════════════════');
        lines.push(`Total Components: ${this.stats.totalComponents}`);
        lines.push(`Linelist Matches: ${this.stats.linelistMatches} (${this._percent(this.stats.linelistMatches, this.stats.totalComponents)})`);
        lines.push(`RigidType Matches: ${this.stats.rigidTypeMatches} (${this._percent(this.stats.rigidTypeMatches, this.stats.totalComponents)})`);
        lines.push(`Material Matches: ${this.stats.materialMatches} (${this._percent(this.stats.materialMatches, this.stats.totalComponents)})`);
        if (this.stats.materialMatches > 0) {
            lines.push(`  - Level 1 (Exact): ${this.stats.materialLevel1}`);
            lines.push(`  - Level 2 (Trim 1): ${this.stats.materialLevel2}`);
            lines.push(`  - Level 3 (Trim 2): ${this.stats.materialLevel3}`);
        }
        lines.push(`Warnings: ${this.stats.warnings}`);
        lines.push(`Errors: ${this.stats.errors}`);
        lines.push('═══════════════════════════════════════');
        return lines.join('\n');
    }

    _percent(count, total) {
        return total > 0 ? `${Math.round((count / total) * 100)}%` : '0%';
    }

    // Get HTML formatted output with filtering
    getHTML(filterLevel = 'ALL') {
        let output = [];

        // Filter logs
        const filteredLogs = this.logs.filter(l => {
            if (filterLevel === 'ALL') return true;
            if (filterLevel === 'ERROR') return l.level === 'ERROR';
            if (filterLevel === 'WARN') return l.level === 'WARN' || l.level === 'ERROR';
            return true;
        });

        filteredLogs.forEach(l => {
            let icon = '';
            let color = '';

            switch (l.level) {
                case 'SUCCESS': icon = '✅'; color = 'var(--green-ok)'; break;
                case 'ERROR': icon = '❌'; color = 'var(--red-err)'; break;
                case 'WARN': icon = '⚠️'; color = 'var(--amber)'; break;
                case 'ASSUME': icon = '🔶'; color = 'var(--amber)'; break;
                case 'INFO': icon = 'ℹ️'; color = 'var(--blue)'; break;
                case 'SECTION': icon = ''; color = 'var(--text-primary)'; break;
            }

            let msg = `<div style="color:${color};margin-bottom:2px;">`;
            if (l.level === 'SECTION') {
                msg += `<br><strong>${l.message}</strong>`;
            } else {
                msg += `<span style="color:var(--text-muted);font-size:0.9em">[${l.timestamp}]</span> ${icon} ${l.message}`;
            }

            if (l.details) {
                try {
                    const json = JSON.stringify(l.details, null, 2);
                    msg += `<pre style="font-size:0.7em;color:var(--text-muted);margin-left:1.5rem;background:rgba(0,0,0,0.05);padding:2px">${json}</pre>`;
                } catch (e) { }
            }
            msg += `</div>`;
            output.push(msg);
        });

        // Add summary if showing all
        if (filterLevel === 'ALL' && this.stats.totalComponents > 0) {
            output.push(`<pre style="color:var(--text-primary)">${this.getSummary()}</pre>`);
        }

        return output.join('');
    }
}

// Global Singleton for unified event tracing across Phase 1 Geometry and Phase 2 UI
export const globalLogger = new DiagnosticLogger();
