import { useEditorStore } from '../store.js';

export const useSmartFixer = () => {
    const components = useEditorStore(state => state.components);
    const updateComponent = useEditorStore(state => state.updateComponent);

    const fixGap = (issue) => {
        // Find nearest point and snap
        const component = components.find(c => c.id === issue.componentId);
        if (!component) return;

        const points = { ...component.userData.points };

        // Find which point of 'component' is the issue
        let targetPtKey = null;
        Object.entries(points).forEach(([k, pt]) => {
            if (pt.x === issue.targetPoint.x && pt.y === issue.targetPoint.y) {
                targetPtKey = k;
            }
        });

        if (targetPtKey) {
            points[targetPtKey] = { ...issue.targetPoint }; // SNAP
            updateComponent(component.id, {
                userData: { ...component.userData, points }
            });
        }
    };

    return { fixGap };
};
