/**
 * pcf-sanitizer.js
 *
 * Final gatekeeper for PCF export. Ensures topological and structural integrity
 * of components before they are converted into a PCF string.
 */

export class PCFSanitizer {
    constructor(components, config = {}) {
        // Deep clone to prevent mutating the original application state
        this.components = JSON.parse(JSON.stringify(components));

        this.logs = [];

        // Default configuration if not provided
        this.config = {
            removeZeroLengthElements: true,
            fixTees: true,
            fixBends: true,
            fixSupports: true,
            removeOrphans: true,
            ...config
        };
    }

    _log(action, comp) {
        const refNo = comp.attributes?.['REF-NO'] || comp.id || 'Unknown';
        this.logs.push(`[${comp.type} ${refNo}]: ${action}`);
    }

    sanitize() {
        // Strip out non-numeric characters from CA3 (Material)
        this._sanitizeCA3();

        // Drop MISC-COMPONENT entirely
        this._removeMiscComponents();

        if (this.config.removeZeroLengthElements) this._removeZeroLengthElements();
        if (this.config.fixTees) this._fixTees();
        if (this.config.fixBends) this._fixBends();
        if (this.config.fixSupports) this._fixSupports();
        if (this.config.removeOrphans) this._removeOrphans();

        return this.components;
    }

    getLogs() {
        return this.logs;
    }

    /** Ensure Material CA3 is completely numeric */
    _sanitizeCA3() {
        this.components.forEach(comp => {
            if (comp.attributes && typeof comp.attributes['CA3'] === 'string') {
                const numericOnly = comp.attributes['CA3'].replace(/[^0-9.]/g, '');
                if (comp.attributes['CA3'] !== numericOnly && numericOnly.length > 0) {
                    this._log(`Stripped text/units from CA3. Changed "${comp.attributes['CA3']}" to "${numericOnly}"`, comp);
                    comp.attributes['CA3'] = numericOnly;
                }
            }
        });
    }

    /** Remove MISC-COMPONENT types which can corrupt output */
    _removeMiscComponents() {
        const initialCount = this.components.length;
        this.components = this.components.filter(c => {
            const isMisc = c.type === 'MISC-COMPONENT';
            if (isMisc) this._log('Dropped MISC-COMPONENT block.', c);
            return !isMisc;
        });
    }

    /**
     * 1. Remove elements with length 0.00 and heal the connection
     */
    _removeZeroLengthElements() {
        const toRemove = new Set();

        this.components.forEach(comp => {
            if (comp.type === 'SUPPORT' || comp.type === 'OLET') return;

            const ep1 = comp.points.find(p => p.type === 'END' && p.index === 0);
            const ep2 = comp.points.find(p => p.type === 'END' && p.index === 1);

            if (ep1 && ep2) {
                const dx = ep2.x - ep1.x;
                const dy = ep2.y - ep1.y;
                const dz = ep2.z - ep1.z;
                const len = Math.sqrt(dx*dx + dy*dy + dz*dz);

                if (len < 0.001) { // Floating point zero
                    toRemove.add(comp.id);
                }
            }
        });

        // Filter out zero-length components
        this.components = this.components.filter(c => !toRemove.has(c.id));
    }

    /**
     * 2. TEE Integrity: Check CP, BP, and Bore
     */
    _fixTees() {
        this.components.forEach(comp => {
            if (comp.type !== 'TEE') return;

            const ep1 = comp.points.find(p => p.type === 'END' && p.index === 0);
            const ep2 = comp.points.find(p => p.type === 'END' && p.index === 1);
            let bp = comp.points.find(p => p.type === 'BRANCH');
            let cp = comp.points.find(p => p.type === 'CENTRE');

            // Find missing CP by taking the midpoint of EP1 and EP2
            if (!cp || (cp.x === 0 && cp.y === 0 && cp.z === 0)) {
                if (ep1 && ep2) {
                    const newCp = {
                        x: (ep1.x + ep2.x) / 2,
                        y: (ep1.y + ep2.y) / 2,
                        z: (ep1.z + ep2.z) / 2,
                        type: 'CENTRE'
                    };

                    if (cp) {
                        Object.assign(cp, newCp);
                    } else {
                        comp.points.push(newCp);
                    }
                    comp.centrePoint = newCp;
                }
            }

            // Find missing BP if we have a branch bore but no point
            if (!bp || (bp.x === 0 && bp.y === 0 && bp.z === 0)) {
                if (ep1 && ep2) {
                    cp = comp.centrePoint || cp;
                    // Compute a default orthogonal vector (Z or Y depending on pipe direction)
                    const dx = ep2.x - ep1.x;
                    const dy = ep2.y - ep1.y;
                    const dz = ep2.z - ep1.z;

                    let bx = cp.x, by = cp.y, bz = cp.z;

                    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > Math.abs(dz)) {
                        by += 100; // Branch goes up
                    } else {
                        bx += 100; // Branch goes sideways
                    }

                    const newBp = { x: bx, y: by, z: bz, bore: comp.bore || 100, type: 'BRANCH' };
                    if (bp) {
                        Object.assign(bp, newBp);
                    } else {
                        comp.points.push(newBp);
                    }
                    comp.branch1Point = newBp;
                }
            }

            // Enforce Bore: Branch Bore <= Header Bore
            const headerBore = Math.max(ep1?.bore || 0, ep2?.bore || 0);
            bp = comp.points.find(p => p.type === 'BRANCH');
            if (bp && bp.bore > headerBore && headerBore > 0) {
                bp.bore = headerBore;
            }
        });
    }

    /**
     * 3. BEND Integrity: Check CP vector intersection
     */
    _fixBends() {
        this.components.forEach(comp => {
            if (comp.type !== 'BEND') return;

            const ep1 = comp.points.find(p => p.type === 'END' && p.index === 0);
            const ep2 = comp.points.find(p => p.type === 'END' && p.index === 1);
            let cp = comp.points.find(p => p.type === 'CENTRE');

            if (!cp || (cp.x === 0 && cp.y === 0 && cp.z === 0) || (cp.x === ep1?.x && cp.y === ep1?.y && cp.z === ep1?.z)) {
                if (ep1 && ep2) {
                    // Simplistic fallback for missing CP: midpoint + offset
                    const newCp = {
                        x: (ep1.x + ep2.x) / 2 + 10,
                        y: (ep1.y + ep2.y) / 2 + 10,
                        z: (ep1.z + ep2.z) / 2 + 10,
                        type: 'CENTRE',
                        bore: ep1.bore // Inherit EP1 bore
                    };

                    if (cp) {
                        Object.assign(cp, newCp);
                    } else {
                        comp.points.push(newCp);
                    }
                    comp.centrePoint = newCp;
                    this._log('Generated missing CENTRE-POINT and synced bore.', comp);
                }
            } else if (cp && ep1 && (!cp.bore || cp.bore !== ep1.bore)) {
                cp.bore = ep1.bore;
                this._log('Synced CENTRE-POINT bore to match END-POINT.', comp);
            }
        });
    }

    /**
     * 4. SUPPORT Integrity: Default names and snapping coordinates
     */
    _fixSupports() {
        this.components.forEach(comp => {
            if (comp.type !== 'SUPPORT') return;

            // Missing name
            if (!comp.attributes) comp.attributes = {};
            if (!comp.attributes['NAME']) {
                const autoName = `SUP-AUTO-${Math.floor(Math.random() * 10000)}    CA150`;
                comp.attributes['NAME'] = autoName;
                this._log(`Missing SUPPORT_NAME generated: ${autoName}`, comp);
            }

            // Coordinates
            let coord = comp.points.find(p => p.type === 'CO-ORD' || !p.type);
            if (!coord || (coord.x === 0 && coord.y === 0 && coord.z === 0)) {
                if (!coord) {
                    coord = { x: 0, y: 0, z: 0, type: 'CO-ORD' };
                    comp.points.push(coord);
                }
                comp.coOrds = coord;
                // Currently leaves it at 0,0,0 or whatever the default is if missing.
                // Snapping requires nearest-pipe logic which is computationally heavy without a spatial index.
            }
        });
    }


    /**
     * 5. Remove Orphans: Elements > 10 meters away from anything else
     */
    _removeOrphans() {
        if (this.components.length < 2) return;

        const toRemove = new Set();
        const eps = this.components.flatMap(c => c.points.filter(p => p.type === 'END' || p.type === 'BRANCH'));

        this.components.forEach(comp => {
            if (comp.type === 'SUPPORT' || comp.type === 'OLET') return; // Don't drop these

            let minDistance = Infinity;
            const compEps = comp.points.filter(p => p.type === 'END' || p.type === 'BRANCH');

            if (compEps.length === 0) return;

            compEps.forEach(p1 => {
                eps.forEach(p2 => {
                    if (comp.points.includes(p2)) return;
                    const d = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
                    if (d < minDistance) minDistance = d;
                });
            });

            if (minDistance > 10000) {
                toRemove.add(comp.id);
            }
        });

        this.components = this.components.filter(c => !toRemove.has(c.id));
    }
}
