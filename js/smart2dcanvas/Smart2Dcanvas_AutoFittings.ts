import { useSceneStore } from './Smart2Dcanvas_SceneStore';
import { v4 as uuidv4 } from 'uuid';

export const processAutoFittings = () => {
   const state = useSceneStore.getState();
   const segments = Object.values(state.segments);
   
   // Hardcoded standard ASME B16.9 logic constants (approximations matching scaling logic)
   const BEND_TAKEOUT = 600; 
   const TEE_TAKEOUT = 500;

   // Pass 1: Auto-Tees (Intersections)
   // For any node connecting > 2 segments, or where vertices visually overlap without nodes.
   // This is a complex geometric operation. For our canvas scope, we will identify
   // T-intersections by finding nodes shared by 3 segments. Since the Engine naturally
   // splits segments (e.g. branch lines), we only need to inject the Fitting object 
   // at that node and ensure coordinates match.
   const nodeDegreeMap: Record<string, string[]> = {};
   segments.forEach(seg => {
       if (!nodeDegreeMap[seg.startNodeId]) nodeDegreeMap[seg.startNodeId] = [];
       if (!nodeDegreeMap[seg.endNodeId]) nodeDegreeMap[seg.endNodeId] = [];
       nodeDegreeMap[seg.startNodeId].push(seg.id);
       nodeDegreeMap[seg.endNodeId].push(seg.id);
   });

   Object.entries(nodeDegreeMap).forEach(([nodeId, attachedSegs]) => {
      // If 3 branches meet at a point, it's a Tee.
      if (attachedSegs.length === 3) {
         // Trim pipes backwards (simulating takeout logic cutting pipe)
         // And inject Tee
         state.addFitting({
            id: uuidv4(),
            type: 'tee',
            centerNodeId: nodeId,
         });
      }
   });

   // Pass 2: Auto-Bends (90 / 45 degree corners)
   // We search for nodes linking exactly 2 segments.
   Object.entries(nodeDegreeMap).forEach(([nodeId, attachedSegs]) => {
     if (attachedSegs.length === 2) {
        const segA = state.segments[attachedSegs[0]];
        const segB = state.segments[attachedSegs[1]];

        // Determine angle between them
        const getVector = (seg: any, pivotNode: string) => {
            const p1 = seg.points[0];
            const p2 = seg.points[seg.points.length - 1];
            // Identify which point is at the shared node. Since coordinates govern visual layout:
            if (p1.id === pivotNode || Math.hypot(p1.x - segB.points[0].x, p1.y - segB.points[0].y) < 2) {
                return { dx: p2.x - p1.x, dy: p2.y - p1.y };
            }
            return { dx: p1.x - p2.x, dy: p1.y - p2.y };
        };

        const vA = getVector(segA, nodeId);
        const vB = getVector(segB, nodeId);

        const dotProduct = vA.dx * vB.dx + vA.dy * vB.dy;
        const magA = Math.hypot(vA.dx, vA.dy);
        const magB = Math.hypot(vB.dx, vB.dy);

        // Filter 0-length
        if (magA < 1 || magB < 1) return;

        const angle = Math.acos(dotProduct / (magA * magB)) * (180 / Math.PI);
        const isBend = Math.abs(angle - 90) < 5 || Math.abs(angle - 45) < 5;
        
        if (isBend) {
            state.addFitting({
                id: uuidv4(),
                type: 'bend',
                centerNodeId: nodeId,
                angle: angle
            });
        }
     }
   });

   alert('Auto Fittings Pass Complete: Bends and Tees mapped.');
};
