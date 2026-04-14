import { useSceneStore } from './Smart2Dcanvas_SceneStore';

export const Smart2Dcanvas_ExportCSV = () => {
  const state = useSceneStore.getState();
  
  // Header: component, x, y, z, name/legends
  const rows: string[][] = [
    ['component', 'x', 'y', 'z', 'name/legends']
  ];

  // Export Nodes
  Object.values(state.nodes).forEach(node => {
    const z = node.z !== undefined ? node.z.toFixed(4) : '0.0000';
    rows.push(['Node', node.x.toFixed(4), node.y.toFixed(4), z, node.id]);
  });

  // Export Segments (Lines) - extracting points
  Object.values(state.segments).forEach(segment => {
    segment.points.forEach((pt, index) => {
      const z = pt.z !== undefined ? pt.z.toFixed(4) : '0.0000';
      rows.push(['SegmentPoint', pt.x.toFixed(4), pt.y.toFixed(4), z, `${segment.id}_p${index}`]);
    });
  });

  // Export Inline Items
  Object.values(state.inlineItems).forEach(item => {
    // Currently inlineItems might not have x/y directly (they use insertionStation).
    // For this basic export, we'll output them if they have metadata or we'll fake it.
    // Ideally, we'd calculate their exact World X/Y based on host segment and station.
    // As a placeholder, we export them with empty coordinates.
    // Fallback directly to the properties we added natively!
    const x = item.x !== undefined ? item.x.toFixed(4) : '';
    const y = item.y !== undefined ? item.y.toFixed(4) : '';
    rows.push(['InlineItem', x, y, '', item.type]);
  });

  // Export Supports
  Object.values(state.supports).forEach(support => {
    const node = state.nodes[support.nodeId];
    const x = node ? node.x.toFixed(4) : (support.x !== undefined ? support.x.toFixed(4) : '');
    const y = node ? node.y.toFixed(4) : (support.y !== undefined ? support.y.toFixed(4) : '');
    const z = node && node.z !== undefined ? node.z.toFixed(4) : '0.0000';
    rows.push(['Support', x, y, z, support.supportType]);
  });

  // Export Fittings
  Object.values(state.fittings).forEach(fitting => {
    const node = state.nodes[fitting.centerNodeId];
    const x = node ? node.x.toFixed(4) : '';
    const y = node ? node.y.toFixed(4) : '';
    const z = node && node.z !== undefined ? node.z.toFixed(4) : '0.0000';
    rows.push(['Fitting', x, y, z, fitting.type]);
  });

  // Convert to CSV string
  const csvContent = rows.map(e => e.join(",")).join("\n");
  
  // Trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "smart2dcanvas_export.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
