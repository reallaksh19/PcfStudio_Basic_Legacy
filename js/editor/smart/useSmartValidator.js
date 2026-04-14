import { useEditorStore } from '../store.js';
import * as THREE from 'three';
import { TopologyRules } from './TopologyRules.js';

export const useSmartValidator = () => {
    const components = useEditorStore(state => state.components);
    const setIssues = useEditorStore(state => state.setIssues);

    const validate = () => {
        const issues = [];

        components.forEach((c) => {
            const points = c.userData?.points;
            if (!points) return;

            // Check connections for each endpoint
            Object.values(points).forEach((pt) => {
                const nearest = findNearest(pt, components, c.id);

                // Rule 1: Gap / Broken
                if (nearest.dist > 0.1) {
                    if (nearest.dist < TopologyRules.GAP_BROKEN) {
                        issues.push({
                            type: 'GAP',
                            description: `Broken Gap: ${nearest.dist.toFixed(1)}mm`,
                            targetPoint: nearest.pt,
                            componentId: c.id
                        });
                    }
                }
            });
        });

        setIssues(issues);
    };

    const findNearest = (pt, all, ignoreId) => {
        let minDist = Infinity;
        let nearestPt = null;

        all.forEach(c => {
            if (c.id === ignoreId) return;
            Object.values(c.userData.points).forEach(otherPt => {
                const d = Math.sqrt(
                    Math.pow(pt.x - otherPt.x, 2) +
                    Math.pow(pt.y - otherPt.y, 2) +
                    Math.pow(pt.z - otherPt.z, 2)
                );
                if (d < minDist) {
                    minDist = d;
                    nearestPt = otherPt;
                }
            });
        });

        return { dist: minDist, pt: nearestPt };
    };

    return { validate };
};
