/**
 * 3D Smart Fixer - PCF Builder (Strict PCF SYNTAX MASTER v1.0)
 *
 * Rebuilds standard PCF outputs correctly independent of parser string flaws.
 * Handles rebuilding geometry explicitly according to PCF component syntax rules.
 */

import { PCFSanitizer } from './pcf-sanitizer.js';
import { getState } from '../../state.js';

const DEFAULT_LINE_NO = 'export sys-1';

// ------------------------------------------------------------------------------------------------
// HELPER FORMATTERS
// ------------------------------------------------------------------------------------------------

/** Distance between two points */
function distance(pt1, pt2) {
    if (!pt1 || !pt2) return 0;
    return Math.sqrt(
        Math.pow(pt2.x - pt1.x, 2) +
        Math.pow(pt2.y - pt1.y, 2) +
        Math.pow(pt2.z - pt1.z, 2)
    );
}

/** Returns the dominant axis/direction label */
function getDirectionString(pt1, pt2) {
    if (!pt1 || !pt2) return '';
    const dx = pt2.x - pt1.x;
    const dy = pt2.y - pt1.y;
    const dz = pt2.z - pt1.z;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const absZ = Math.abs(dz);

    const max = Math.max(absX, absY, absZ);
    if (max === 0) return '';

    if (max === absX) return dx > 0 ? 'EAST' : 'WEST';
    if (max === absY) return dy > 0 ? 'NORTH' : 'SOUTH';
    return dz > 0 ? 'UP' : 'DOWN';
}

function getAxisIndex(axisStr) {
    const s = axisStr.toUpperCase();
    if (s.includes('X') || s === 'EAST' || s === 'WEST') return 0;
    if (s.includes('Y') || s === 'NORTH' || s === 'SOUTH') return 1;
    if (s.includes('Z') || s === 'UP' || s === 'DOWN') return 2;
    return -1;
}

// ------------------------------------------------------------------------------------------------
// BUILDER CLASS CONTEXT
// ------------------------------------------------------------------------------------------------

class PcfBuilderContext {
    constructor(precision = 4) {
        this.precision = precision;
        this.logs = [];
    }

    addError(msg) { this.logs.push(`[ERROR] ${msg}`); }
    addWarning(msg) { this.logs.push(`[WARNING] ${msg}`); }

    fmtCoord(val) {
        if (typeof val !== 'number') return (0).toFixed(this.precision);
        return val.toFixed(this.precision);
    }

    fmtBore(val) {
        // V2: Bore MUST match coord precision. Either everything is .4f or .1f.
        if (typeof val !== 'number') return (0).toFixed(this.precision);
        return val.toFixed(this.precision);
    }

    formatCoordLine(keyword, pt, fallbackBore = 0) {
        return `    ${keyword.padEnd(13, ' ')} ${this.fmtCoord(pt.x)} ${this.fmtCoord(pt.y)} ${this.fmtCoord(pt.z)} ${this.fmtBore(pt.bore || fallbackBore)}`;
    }

    // VALIDATIONS
    validateComponent(comp, prevComp) {
        const type = (comp.type || 'UNKNOWN').toUpperCase();
        if (['ISOGEN-FILES', 'UNITS-BORE', 'UNITS-CO-ORDS', 'UNITS-WEIGHT', 'UNITS-BOLT-DIA', 'UNITS-BOLT-LENGTH', 'PIPELINE-REFERENCE'].includes(type)) return;

        // V1: No (0,0,0) coordinates
        const checkZeros = (pt, name) => {
            if (pt && pt.x === 0 && pt.y === 0 && pt.z === 0) {
                this.addError(`V1: ${type} ${name} has (0,0,0) spatial coordinates.`);
            }
        };

        if (comp.points && comp.points.length > 0) {
            comp.points.forEach((pt, i) => checkZeros(pt, `EP${i+1}`));
        }
        if (comp.centrePoint) checkZeros(comp.centrePoint, 'CP');
        if (comp.branch1Point) checkZeros(comp.branch1Point, 'BP');
        if (comp.coOrds) checkZeros(comp.coOrds, 'CO-ORDS');

        // V3: Bore consistency
        if (type.includes('REDUCER') && comp.points && comp.points.length >= 2) {
            if (comp.points[0].bore === comp.points[1].bore) {
                this.addError(`V3: REDUCER has identical bores (${comp.points[0].bore}).`);
            }
        } else if (comp.points && comp.points.length >= 2) {
            if (comp.points[0].bore !== comp.points[1].bore) {
                this.addError(`V3: ${type} has mismatching EP bores (${comp.points[0].bore} vs ${comp.points[1].bore}).`);
            }
        }

        // V4, V5, V6, V7: BEND checks
        if (type === 'BEND' && comp.centrePoint && comp.points && comp.points.length >= 2) {
            const ep1 = comp.points[0];
            const ep2 = comp.points[1];
            const cp = comp.centrePoint;

            if (cp.x === ep1.x && cp.y === ep1.y && cp.z === ep1.z) this.addError(`V4: BEND CP == EP1.`);
            if (cp.x === ep2.x && cp.y === ep2.y && cp.z === ep2.z) this.addError(`V5: BEND CP == EP2.`);

            // Check collinearity (V6)
            const d1 = distance(ep1, cp);
            const d2 = distance(cp, ep2);
            const d3 = distance(ep1, ep2);
            if (Math.abs((d1 + d2) - d3) < 0.1) {
                this.addError(`V6: BEND CP is collinear with EP1-EP2 (degenerate straight pipe).`);
            }

            // Equidistant (V7)
            if (Math.abs(d1 - d2) > 1.0) { // 1mm tolerance
                this.addWarning(`V7: BEND CP not equidistant. Dist(CP,EP1)=${d1.toFixed(1)}, Dist(CP,EP2)=${d2.toFixed(1)}`);
            }
        }

        // V8, V9, V10: TEE checks
        if (type === 'TEE' && comp.centrePoint && comp.points && comp.points.length >= 2) {
            const ep1 = comp.points[0];
            const ep2 = comp.points[1];
            const cp = comp.centrePoint;

            const midX = (ep1.x + ep2.x) / 2;
            const midY = (ep1.y + ep2.y) / 2;
            const midZ = (ep1.z + ep2.z) / 2;

            if (Math.abs(cp.x - midX) > 0.1 || Math.abs(cp.y - midY) > 0.1 || Math.abs(cp.z - midZ) > 0.1) {
                this.addError(`V8: TEE CP is not vector midpoint of EP1 and EP2.`);
            }
            if (cp.bore !== ep1.bore) {
                this.addError(`V9: TEE CP bore (${cp.bore}) differs from EP1 bore (${ep1.bore}).`);
            }
            if (comp.branch1Point) {
                const bp = comp.branch1Point;
                const vHeader = { x: ep2.x - ep1.x, y: ep2.y - ep1.y, z: ep2.z - ep1.z };
                const vBranch = { x: bp.x - cp.x, y: bp.y - cp.y, z: bp.z - cp.z };
                const dot = vHeader.x * vBranch.x + vHeader.y * vBranch.y + vHeader.z * vBranch.z;
                if (Math.abs(dot) > 1.0) {
                    this.addWarning(`V10: TEE branch vector is not perfectly perpendicular to header. Dot product: ${dot.toFixed(2)}`);
                }
            }
        }

        // V11: OLET no EndPoints
        if (type === 'OLET' && comp.points && comp.points.length > 0) {
            this.addError(`V11: OLET must NOT have END-POINT lines. Found ${comp.points.length}.`);
        }

        // V12, V13: SUPPORT rules
        if (type === 'SUPPORT') {
            if (comp.attributes && Object.keys(comp.attributes).some(k => k.startsWith('COMPONENT-ATTRIBUTE') || k.startsWith('CA'))) {
                this.addError(`V12: SUPPORT must NOT have COMPONENT-ATTRIBUTE lines.`);
            }
            if (comp.coOrds && comp.coOrds.bore !== 0) {
                this.addError(`V13: SUPPORT CO-ORDS bore token must be 0.`);
            }
        }

        // V14: <SKEY> Presence
        const mandatorySkey = ['FLANGE', 'VALVE', 'BEND', 'TEE', 'OLET', 'REDUCER', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'];
        if (mandatorySkey.includes(type)) {
            const hasSkey = comp.skey || (comp.attributes && (comp.attributes['SKEY'] || comp.attributes['<SKEY>']));
            if (!hasSkey) {
                this.addWarning(`V14: <SKEY> is missing for mandatory component type ${type}.`);
            }
        }

        // V15: Coordinate Continuity (EP1[n] == EP2[n-1])
        if (prevComp && prevComp.points && prevComp.points.length > 0 && comp.points && comp.points.length > 0 && type !== 'SUPPORT' && prevComp.type !== 'SUPPORT') {
            const prevEp2 = prevComp.points[prevComp.points.length - 1];
            const currEp1 = comp.points[0];
            const dist = distance(prevEp2, currEp1);
            if (dist > 1.0) { // 1mm tolerance
                this.addWarning(`V15: Coordinate continuity broken between ${prevComp.type} and ${type}. Gap = ${dist.toFixed(1)}mm`);
            }
        }

        // V16: CA8 presence
        if (comp.attributes) {
            const hasCa8 = comp.attributes['COMPONENT-ATTRIBUTE8'] || comp.attributes['CA8'];
            if (hasCa8) {
                if (type === 'PIPE' || type === 'SUPPORT') {
                    this.addWarning(`V16: CA8 (Weight) is present on ${type}, but it is never for PIPE or SUPPORT.`);
                }
            } else {
                if (type === 'FLANGE' || type === 'VALVE') {
                    this.addWarning(`V16: CA8 (Weight) is commonly expected for ${type} but is missing.`);
                }
            }
        }
    }

    rebuildTeeGeometry(comp) {
        if (!comp.points || comp.points.length < 2) return comp;

        const ep1 = comp.points[0];
        const ep2 = comp.points[1];

        // V8: TEE CP is EXACTLY midpoint
        comp.centrePoint = {
            x: (ep1.x + ep2.x) / 2,
            y: (ep1.y + ep2.y) / 2,
            z: (ep1.z + ep2.z) / 2,
            bore: ep1.bore // V9: TEE CP bore = EP1 bore
        };

        // TEE BP calculation (§10.5.2)
        if (!comp.branch1Point) {
            const branchLen = comp.branchLength || (comp.attributes && comp.attributes['BRLEN']) ? parseFloat(comp.branchLength || comp.attributes['BRLEN']) : 0;
            const branchDir = comp.branchDirection || (comp.attributes && comp.attributes['BRANCH-DIRECTION']) || '';
            const branchBore = comp.branchBore || ep1.bore;

            if (branchLen > 0 && branchDir) {
                let dx = 0, dy = 0, dz = 0;
                const dir = branchDir.toUpperCase();
                if (dir === 'EAST' || dir === '+X') dx = branchLen;
                else if (dir === 'WEST' || dir === '-X') dx = -branchLen;
                else if (dir === 'NORTH' || dir === '+Y') dy = branchLen;
                else if (dir === 'SOUTH' || dir === '-Y') dy = -branchLen;
                else if (dir === 'UP' || dir === '+Z') dz = branchLen;
                else if (dir === 'DOWN' || dir === '-Z') dz = -branchLen;

                comp.branch1Point = {
                    x: comp.centrePoint.x + dx,
                    y: comp.centrePoint.y + dy,
                    z: comp.centrePoint.z + dz,
                    bore: branchBore
                };
            } else {
                this.addError(`TEE is missing Branch Direction or Length; cannot calculate BP accurately.`);
                // Fake a perpendicular point just to not break rendering, but it violates V10 properly
                comp.branch1Point = { ...comp.centrePoint, bore: branchBore, z: comp.centrePoint.z + 100 };
            }
        }

        return comp;
    }

    rebuildBendGeometry(comp) {
        if (!comp.points || comp.points.length < 2) return comp;
        const ep1 = comp.points[0];
        const ep2 = comp.points[1];

        if (!comp.centrePoint) {
            // General 90° approximation if incoming/outgoing known, else midpoint for failure fallback
            // V4/V5: CP cannot equal EP1 or EP2
            // To properly do this, we need the vectors.
            const inDir = comp.incomingDirection;
            const outDir = comp.outgoingDirection;
            if (inDir && outDir) {
                const inIdx = getAxisIndex(inDir);
                const outIdx = getAxisIndex(outDir);

                if (inIdx !== -1 && outIdx !== -1 && inIdx !== outIdx) {
                    comp.centrePoint = { x: ep1.x, y: ep1.y, z: ep1.z, bore: ep1.bore };
                    const coords = ['x', 'y', 'z'];
                    comp.centrePoint[coords[inIdx]] = ep2[coords[inIdx]];
                    // OutIdx remains EP1's value.
                } else {
                    this.addWarning(`BEND geometry missing strict perpendicular axis. Falling back to vector corner projection.`);
                    comp.centrePoint = {
                        x: ep1.x, // Simplified fallback, but logs warning
                        y: ep2.y,
                        z: ep1.z,
                        bore: ep1.bore
                    };
                }
            } else {
                this.addWarning(`BEND missing incoming/outgoing directions for accurate CP geometry.`);
                comp.centrePoint = {
                    x: ep1.x,
                    y: ep2.y, // simple corner
                    z: ep1.z,
                    bore: ep1.bore
                };
            }

            // Safety to prevent V4/V5
            if (comp.centrePoint.x === ep1.x && comp.centrePoint.y === ep1.y && comp.centrePoint.z === ep1.z) {
                comp.centrePoint.x += 1;
            }
        } else {
            comp.centrePoint.bore = comp.centrePoint.bore || ep1.bore;
        }

        return comp;
    }

    rebuildOletGeometry(comp) {
        // "OLET: NO END-POINT lines — this is unique to OLET." (V11)
        if (!comp.centrePoint && comp.points && comp.points.length >= 1) {
            comp.centrePoint = { ...comp.points[0] }; // Use first point as CP fallback if parent pipe logic not passed
            this.addWarning(`OLET CP derived from EP1 instead of parent pipe tap-in point.`);
        }
        if (!comp.branch1Point && comp.points && comp.points.length >= 2) {
            comp.branch1Point = { ...comp.points[1] };
        }

        // Remove END-POINTs completely to satisfy V11
        comp.points = [];
        return comp;
    }

    rebuildGeometry(components) {
        return components.map((c, idx) => {
            const comp = JSON.parse(JSON.stringify(c)); // deep clone
            const upperType = (comp.type || '').toUpperCase();

            if (upperType === 'TEE') {
                return this.rebuildTeeGeometry(comp);
            }
            if (upperType === 'OLET') {
                return this.rebuildOletGeometry(comp);
            }
            if (upperType === 'BEND') {
                return this.rebuildBendGeometry(comp);
            }

            if (upperType === 'SUPPORT') {
                if (comp.coOrds) comp.coOrds.bore = 0; // V13 rule enforcement proactively
            }

            return comp;
        });
    }

    buildHeader(components) {
        let pipelineRef = DEFAULT_LINE_NO;
        for (const comp of components) {
            if (comp.type === 'PIPELINE-REFERENCE' && comp.pipelineReference) {
                pipelineRef = 'export ' + comp.pipelineReference;
                break;
            }
            if (comp.attributes && comp.attributes['PIPELINE-REFERENCE']) {
                pipelineRef = 'export ' + comp.attributes['PIPELINE-REFERENCE'];
                break;
            }
        }

        return [
            'ISOGEN-FILES ISOGEN.FLS',
            'UNITS-BORE MM',
            'UNITS-CO-ORDS MM',
            'UNITS-WEIGHT KGS',
            'UNITS-BOLT-DIA MM',
            'UNITS-BOLT-LENGTH MM',
            `PIPELINE-REFERENCE ${pipelineRef}`,
            '    PROJECT-IDENTIFIER P1',
            '    AREA A1',
            ''
        ].join('\r\n'); // V17 CRLF
    }

    buildMessageSquareLine(comp) {
        const tokens = [];
        const upperType = comp.type ? comp.type.toUpperCase() : 'UNKNOWN';
        tokens.push(upperType);

        const attrs = comp.attributes || {};

        const ca3 = attrs['COMPONENT-ATTRIBUTE3'] || attrs['CA3'];
        if (ca3) tokens.push(ca3);

        let len = 0;
        let dir = '';

        if (comp.length) len = parseFloat(comp.length);
        else if (comp.points && comp.points.length >= 2) {
            len = distance(comp.points[0], comp.points[1]);
            dir = getDirectionString(comp.points[0], comp.points[1]);
        }

        if (len > 0) tokens.push(`LENGTH=${Math.round(len)}MM`);
        if (dir) tokens.push(dir);

        const refNo = attrs['COMPONENT-ATTRIBUTE97'] || attrs['CA97'] || comp.refNo || '';
        const seqNo = attrs['COMPONENT-ATTRIBUTE98'] || attrs['CA98'] || comp.seqNo || comp.csvSeqNo || '';

        if (refNo) tokens.push(`RefNo:${refNo}`);
        if (seqNo) tokens.push(`SeqNo:${seqNo}`);

        if ((upperType === 'TEE' || upperType === 'OLET') && comp.centrePoint && comp.branch1Point) {
            const brLen = distance(comp.centrePoint, comp.branch1Point);
            if (brLen > 0) tokens.push(`BrLen=${Math.round(brLen)}MM`);
        }

        if (upperType.includes('REDUCER') && comp.points && comp.points.length >= 2) {
            tokens.push(`Bore=${this.fmtBore(comp.points[0].bore)}/${this.fmtBore(comp.points[1].bore)}`);
        }

        if (upperType === 'FLANGE' || upperType === 'VALVE') {
            const weight = attrs['COMPONENT-ATTRIBUTE8'] || attrs['CA8'];
            if (weight) tokens.push(`Wt=${weight}`);
        }

        return tokens.join(', ');
    }

    renderComponentBlock(comp, isFullPcf) {
        const lines = [];
        const upperType = comp.type.toUpperCase();

        if (upperType !== 'SUPPORT') {
            lines.push('MESSAGE-SQUARE  ');
            lines.push(`    ${this.buildMessageSquareLine(comp)}`);
        }

        lines.push(comp.type);

        const fallbackBore = (comp.points && comp.points.length > 0) ? (comp.points[0].bore || 0) : 0;

        if (upperType === 'SUPPORT') {
            let pt = comp.coOrds || (comp.points && comp.points[0]) || {x: 0, y: 0, z: 0};
            pt.bore = 0; // V13 rule
            lines.push(this.formatCoordLine('CO-ORDS', pt, 0));

            const supportName = comp.supportName || comp.skey || 'CA150';
            lines.push(`    <SUPPORT_NAME>    ${supportName}`);

            let guid = 'UCI:UNKNOWN';
            if (comp.supportGuid) {
                guid = comp.supportGuid.startsWith('UCI:') ? comp.supportGuid : `UCI:${comp.supportGuid}`;
            } else if (comp.attributes && comp.attributes['<SUPPORT_GUID>']) {
                guid = comp.attributes['<SUPPORT_GUID>'];
            }
            lines.push(`    <SUPPORT_GUID>    ${guid}`);

        } else if (upperType === 'OLET') {
            if (comp.centrePoint) {
                lines.push(this.formatCoordLine('CENTRE-POINT', comp.centrePoint, fallbackBore));
            }
            if (comp.branch1Point) {
                lines.push(this.formatCoordLine('BRANCH1-POINT', comp.branch1Point, comp.branch1Point.bore || fallbackBore));
            }
        } else {
            if (comp.points && Array.isArray(comp.points)) {
                comp.points.forEach(pt => {
                    lines.push(this.formatCoordLine('END-POINT', pt, pt.bore || fallbackBore));
                });
            }

            if (upperType === 'BEND' || upperType === 'TEE') {
                if (comp.centrePoint) {
                    lines.push(this.formatCoordLine('CENTRE-POINT', comp.centrePoint, comp.centrePoint.bore || fallbackBore));
                }
            }

            if (upperType === 'TEE' && comp.branch1Point) {
                lines.push(this.formatCoordLine('BRANCH1-POINT', comp.branch1Point, comp.branch1Point.bore || fallbackBore));
            }
        }

        if (upperType !== 'SUPPORT') {
            const skey = comp.skey || (comp.attributes && (comp.attributes['SKEY'] || comp.attributes['<SKEY>']));
            if (skey) {
                lines.push(`    <SKEY>  ${skey}`); // SKEY -> <SKEY> rule
            }

            if (upperType === 'BEND') {
                const angle = comp.angle || (comp.attributes && comp.attributes['ANGLE']);
                if (angle) lines.push(`    ANGLE  ${angle}`);
                const bendRadius = comp.bendRadius || (comp.attributes && comp.attributes['BEND-RADIUS']);
                if (bendRadius) lines.push(`    BEND-RADIUS  ${bendRadius}`);
            }

            if (upperType === 'REDUCER-ECCENTRIC') {
                const flatDir = comp.flatDirection || (comp.attributes && comp.attributes['FLAT-DIRECTION']);
                if (flatDir) lines.push(`    FLAT-DIRECTION  ${flatDir}`);
            }

            if (comp.attributes) {
                const allowedBasic = ['COMPONENT-ATTRIBUTE8', 'CA8'];
                for (const [k, v] of Object.entries(comp.attributes)) {
                    if (k.toUpperCase() === 'SKEY' || k.toUpperCase() === '<SKEY>') continue;
                    if (k.toUpperCase() === 'ANGLE' || k.toUpperCase() === 'BEND-RADIUS' || k.toUpperCase() === 'FLAT-DIRECTION') continue;
                    if (!k.toUpperCase().startsWith('COMPONENT-ATTRIBUTE') && !k.toUpperCase().startsWith('CA')) continue;

                    const normalizedKey = k.replace(/^CA(\d+)$/i, 'COMPONENT-ATTRIBUTE$1');

                    if (isFullPcf) {
                        lines.push(`    ${normalizedKey}    ${v}`);
                    } else {
                        if ((upperType === 'FLANGE' || upperType === 'VALVE') &&
                            (normalizedKey === 'COMPONENT-ATTRIBUTE8')) {
                            lines.push(`    ${normalizedKey}    ${v}`);
                        }
                    }
                }
            }
        }

        lines.push('');
        return lines;
    }

    build(rawComponents, isFullPcf) {
        // Apply Final Output Sanitizer
        const appConfig = getState("config") || {};
        const sanitizerConfig = appConfig.exportSettings || {};
        const sanitizer = new PCFSanitizer(rawComponents, sanitizerConfig);
        const sanitizedComponents = sanitizer.sanitize();

        // Broadcast logs to UI (Debug Tab)
        const logWindow = document.getElementById("sanitizer-log-window");
        const logs = sanitizer.getLogs();

        // Expose logs globally for Output Tab to consume
        window.SanitizerActionLogs = logs;

        if (logWindow) {
            if (logs.length > 0) {
                logWindow.innerHTML = logs.map(msg => `<div>${msg}</div>`).join('');
            } else {
                logWindow.innerHTML = "<div>[No sanitizer actions required. PCF Clean.]</div>";
            }
        }

        const components = this.rebuildGeometry(sanitizedComponents);
        const lines = [this.buildHeader(components)];

        let prevComp = null;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            if (!comp.type || comp.type === 'MESSAGE-SQUARE') continue;

            const upperType = comp.type.toUpperCase();
            if (['ISOGEN-FILES', 'UNITS-BORE', 'UNITS-CO-ORDS', 'UNITS-WEIGHT', 'UNITS-BOLT-DIA', 'UNITS-BOLT-LENGTH', 'PIPELINE-REFERENCE'].includes(upperType)) {
                continue;
            }

            this.validateComponent(comp, prevComp);

            const blockLines = this.renderComponentBlock(comp, isFullPcf);
            lines.push(...blockLines);
            prevComp = comp;
        }

        return {
            pcfText: lines.join('\r\n'), // CRLF V17
            logs: this.logs
        };
    }
}

// ------------------------------------------------------------------------------------------------
// PUBLIC EXPORTS
// ------------------------------------------------------------------------------------------------

/** Option 1: Basic PCF */
export function buildBasicPcf(rawComponents, options = {}) {
    const builder = new PcfBuilderContext(options.precision !== undefined ? options.precision : 4);
    return builder.build(rawComponents, false);
}

/** Option 2: Full PCF */
export function buildFullPcf(rawComponents, options = {}) {
    const builder = new PcfBuilderContext(options.precision !== undefined ? options.precision : 4);
    return builder.build(rawComponents, true);
}
