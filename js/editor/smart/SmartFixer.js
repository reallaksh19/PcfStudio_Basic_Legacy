import * as THREE from 'three';
import { useEditorStore } from '../store.js';

export class SmartFixer {
    constructor(tolerance = 6.0) {
        this.tolerance = tolerance; // mm
    }

    applyFixes(approvedIssues) {
        const store = useEditorStore.getState();
        const { components, updateComponent, deleteNode, addNode } = store;

        let fixesApplied = 0;
        console.log(`[SmartFixer] Applying ${approvedIssues.length} approved fixes.`);

        approvedIssues.forEach(issue => {
            if (!issue.approved) return;

            try {
                switch(issue.action) {
                    case 'Connect':
                    case 'Gap Filling':
                        this._fixGap(issue, components, updateComponent);
                        fixesApplied++;
                        break;
                    case 'Trim Overlap':
                        this._trimOverlap(issue, components, updateComponent);
                        fixesApplied++;
                        break;
                    case 'Delete Foldback':
                        this._deleteFoldback(issue, components, deleteNode);
                        fixesApplied++;
                        break;
                    default:
                        console.warn(`[SmartFixer] Unknown action: ${issue.action}`);
                }
            } catch (err) {
                console.error(`[SmartFixer] Failed to apply fix for issue ${issue.id}:`, err);
            }
        });

        console.log(`[SmartFixer] Complete. Applied ${fixesApplied} fixes.`);
        return fixesApplied;
    }

    _fixGap(issue, allComponents, updateFn) {
        const { c1, c2, p1, p2, dist } = issue;

        if (dist > 15000) {
            console.warn(`[SmartFixer] Rejected Gap Fill: Distance ${dist.toFixed(1)}mm exceeds 15000mm limit.`);
            return;
        }

        const type1 = (c1.type || c1.userData?.type || '').toUpperCase();
        const type2 = (c2.type || c2.userData?.type || '').toUpperCase();

        const bore1 = Number(c1.bore || c1.userData?.bore || 50);
        const bore2 = Number(c2.bore || c2.userData?.bore || 50);

        if (dist <= this.tolerance) {
            this._snapCoordinates(c1, p1, p2, updateFn);
            return;
        }

        if (type1 === 'PIPE') {
            if (type2 === 'ELBOW' || type2 === 'BEND') {
                if (bore1 !== bore2) return;
                this._snapMajorAxis(c1, p1, p2, updateFn);
                return;
            }

            if (type2 === 'PIPE' || type2 === 'FLANGE' || type2 === 'VALVE') {
                if (bore1 !== bore2) return;
                this._snapMajorAxis(c1, p1, p2, updateFn);
                return;
            }

            if (type2 === 'TEE') {
                if (bore1 === bore2) {
                    this._snapMajorAxis(c1, p1, p2, updateFn);
                }
                return;
            }

            if (type2.includes('OLET')) {
                 const offset = bore2 / 2;
                 const target = p2.clone().add(new THREE.Vector3(0, offset, 0));
                 this._snapCoordinates(c1, p1, target, updateFn);
                 return;
            }
        }
    }

    _trimOverlap(issue, allComponents, updateFn) {
        const { c1, c2, dist } = issue;

        if (Math.abs(dist) <= this.tolerance) return;

        const bore1 = Number(c1.bore || c1.userData?.bore || 50);
        const bore2 = Number(c2.bore || c2.userData?.bore || 50);

        if (bore1 !== bore2) return;

        const p1s = this._getVec(c1, '1');
        const p1e = this._getVec(c1, '2');
        const p2s = this._getVec(c2, '1');

        if (!p1s || !p1e || !p2s) return;

        if (p1e.distanceTo(p2s) < p1s.distanceTo(p2s)) {
            this._snapCoordinates(c1, p1e, p2s, updateFn);
        } else {
            this._snapCoordinates(c1, p1s, p2s, updateFn);
        }
    }

    _deleteFoldback(issue, allComponents, deleteFn) {
        deleteFn(issue.c1.id);
    }

    _snapCoordinates(mesh, currentPoint, targetPoint, updateFn) {
        const p1Raw = this._getVec(mesh, '1');
        const p2Raw = this._getVec(mesh, '2');

        let indexToUpdate = null;
        if (p1Raw && p1Raw.distanceTo(currentPoint) < 0.1) indexToUpdate = '1';
        if (p2Raw && p2Raw.distanceTo(currentPoint) < 0.1) indexToUpdate = '2';

        if (!indexToUpdate) return;

        const newPoints = { ...mesh.points, ...mesh.userData?.points };
        newPoints[indexToUpdate] = { x: targetPoint.x, y: targetPoint.y, z: targetPoint.z };

        if (mesh.points && mesh.points[`EP${indexToUpdate}`]) {
            newPoints[`EP${indexToUpdate}`] = newPoints[indexToUpdate];
        }

        updateFn(mesh.id, { points: newPoints, userData: { ...mesh.userData, points: newPoints } });
    }

    _snapMajorAxis(mesh, currentPoint, targetPoint, updateFn) {
        const distance = currentPoint.distanceTo(targetPoint);
        if (distance > 12500) {
            console.warn(`[SmartFixer] Skew Limiter Blocked Fix: Distance ${distance.toFixed(1)}mm exceeds 12500mm.`);
            return;
        }

        this._snapCoordinates(mesh, currentPoint, targetPoint, updateFn);
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
}
