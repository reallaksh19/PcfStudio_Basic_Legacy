import * as THREE from 'three';

export class SmartValidator {
    constructor(tolerance = 6.0) {
        this.tolerance = tolerance; // mm
    }

    validate(components) {
        const issues = [];
        console.log('[SmartValidator] Validation Started', { componentCount: components.length });

        for (let i = 0; i < components.length; i++) {
            const c1 = components[i];

            const p1Raw = c1.points?.['1'] || c1.points?.EP1 || c1.points?.Start || c1.userData?.points?.['1'];
            const p2Raw = c1.points?.['2'] || c1.points?.EP2 || c1.points?.End || c1.userData?.points?.['2'];

            if (!p1Raw && !p2Raw) continue;

            const p1 = p1Raw ? new THREE.Vector3(Number(p1Raw.x||0), Number(p1Raw.y||0), Number(p1Raw.z||0)) : null;
            const p2 = p2Raw ? new THREE.Vector3(Number(p2Raw.x||0), Number(p2Raw.y||0), Number(p2Raw.z||0)) : null;

            if (p1) this._checkConnection(c1, p1, components, issues, 'Start');
            if (p2) this._checkConnection(c1, p2, components, issues, 'End');

            this._checkOverlap(c1, components, issues);
        }

        const uniqueIssues = [];
        const seen = new Set();
        issues.forEach(issue => {
            const ids = [issue.c1.id, issue.c2.id].sort().join('-');
            const key = `${issue.type}-${ids}`;
            if (!seen.has(key)) {
                seen.add(key);
                issue.action = this._mapAction(issue);
                issue.approved = true;
                uniqueIssues.push(issue);
            }
        });

        console.log('[SmartValidator] Validation Complete', { issuesCount: uniqueIssues.length });
        return uniqueIssues;
    }

    _mapAction(issue) {
        if (issue.type === 'GAP') return 'Connect';
        if (issue.type === 'MODEL_ERROR') return 'Gap Filling';
        if (issue.type === 'OVERLAP') return 'Trim Overlap';
        if (issue.type === 'FOLDBACK') return 'Delete Foldback';
        return 'Review';
    }

    _checkConnection(c1, p1, allComponents, issues, pointLabel) {
        const conn = this._findNearestConnection(p1, allComponents, c1);
        if (!conn.c2) return;

        const dist = conn.dist;
        const c2 = conn.c2;

        const bore = Number(c1.bore || c1.userData?.bore || 50);

        // CRITICAL FIX: Broken connections should only be small gaps (< 100mm)
        // Gaps larger than this are likely different pipe runs, not connection issues
        const MAX_BROKEN_CONNECTION_GAP = 100;
        const gapLimit = Math.min(Math.max(this.tolerance, bore * 2.0), MAX_BROKEN_CONNECTION_GAP);

        const maxModelLimit = 15000;
        const MIN_MODEL_ERROR_GAP = MAX_BROKEN_CONNECTION_GAP; // Model errors start where broken connections end

        if (dist > 0.1) {
            // Only flag small gaps as broken connections (< 100mm)
            // Anything larger is likely a different pipe run or intentional gap
            if (dist <= gapLimit) {
                issues.push({
                    id: `iss-${Date.now()}-${Math.random()}`,
                    type: 'GAP',
                    description: `Broken Connection (${dist.toFixed(1)}mm)`,
                    c1, c2, p1, p2: conn.point,
                    dist
                });
            }
            // MODEL_ERROR detection disabled - gaps > 100mm are likely intentional
            // Uncomment below if you want to flag medium-range gaps (100-300mm) as potential model errors
            /*
            else if (dist > MIN_MODEL_ERROR_GAP && dist <= 300) {
                issues.push({
                    id: `iss-${Date.now()}-${Math.random()}`,
                    type: 'MODEL_ERROR',
                    description: `Model Gap (${dist.toFixed(1)}mm)`,
                    c1, c2, p1, p2: conn.point,
                    dist
                });
            }
            */
        }
    }

    _checkOverlap(c1, allComponents, issues) {
        const type1 = (c1.type || c1.userData?.type || '').toUpperCase();
        if (type1 !== 'PIPE') return;

        const p1s = this._getVec(c1, '1');
        const p1e = this._getVec(c1, '2');
        if (!p1s || !p1e) return;

        const line1 = new THREE.Line3(p1s, p1e);

        for (const c2 of allComponents) {
            if (c1.id === c2.id) continue;

            const p2s = this._getVec(c2, '1');
            const p2e = this._getVec(c2, '2');
            if (!p2s) continue;

            const closestPt = new THREE.Vector3();
            line1.closestPointToPoint(p2s, true, closestPt);

            const dist = closestPt.distanceTo(p2s);

            if (dist < 0.1) {
                const distToStart = closestPt.distanceTo(p1s);
                const distToEnd = closestPt.distanceTo(p1e);

                if (distToStart > 0.1 && distToEnd > 0.1) {
                    issues.push({
                        id: `iss-${Date.now()}-${Math.random()}`,
                        type: 'OVERLAP',
                        description: `Intersecting Overlap`,
                        c1, c2,
                        dist: -distToStart
                    });
                }
            }
        }
    }

    _getVec(c, idx) {
        const raw = c.points?.[idx] || c.userData?.points?.[idx];
        if (!raw) {
            const map = { '1': 'EP1', '2': 'EP2' };
            const ep = c.points?.[map[idx]] || c.userData?.points?.[map[idx]];
            if (ep) return new THREE.Vector3(Number(ep.x||0), Number(ep.y||0), Number(ep.z||0));
            return null;
        }
        return new THREE.Vector3(Number(raw.x||0), Number(raw.y||0), Number(raw.z||0));
    }

    _findNearestConnection(point, allComponents, ignoreComponent) {
        let minDist = Infinity;
        let nearestC = null;
        let nearestPoint = null;

        for (const c of allComponents) {
            if (c.id === ignoreComponent.id) continue;

            const pStart = this._getVec(c, '1');
            const pEnd = this._getVec(c, '2');

            if (pStart) {
                const d = point.distanceTo(pStart);
                if (d < minDist) { minDist = d; nearestC = c; nearestPoint = pStart; }
            }
            if (pEnd) {
                const d = point.distanceTo(pEnd);
                if (d < minDist) { minDist = d; nearestC = c; nearestPoint = pEnd; }
            }
        }

        return { dist: minDist, c2: nearestC, point: nearestPoint };
    }
}
