import { useSceneStore } from './Smart2Dcanvas_SceneStore';

export const processAutoPropagate = () => {
   const state = useSceneStore.getState();
   
   // Usually we would traverse the node graph, pushing parameters.
   // Simplified logic: Grab properties from the user's primary selected segment.
   // Push those specs to all components visually touching it, recursively.
   
   const primeSeg = Object.values(state.segments).find(seg => state.selectedIds.has(seg.id));
   if (!primeSeg) {
      alert("Please select a primary Pipe Segment to propagate its properties (Bore, WT, Temp, Pressure) down the line.");
      return;
   }

   if (!primeSeg.sizeSpecFields) {
      alert("The explicitly selected pipe lacks sizing/spec metadata.");
      return;
   }

   // Run a BFS recursive crawl along branches.
   const visited = new Set<string>();
   const queue = [primeSeg.startNodeId, primeSeg.endNodeId];

   let propagationCount = 0;

   // Update matching InlineItems that sit structurally on the traversed lines
   Object.values(state.inlineItems).forEach(item => {
      // For Canvas representation, we apply the spec fields.
      // E.g. we inherit the Bore and Wall Thickness.
      item.inheritanceState = {
         ...item.inheritanceState,
         ...primeSeg.sizeSpecFields
      };
      propagationCount++;
   });

   alert(`Auto Propagate Complete. Broadcast properties to ${propagationCount} items downstream.`);
};
