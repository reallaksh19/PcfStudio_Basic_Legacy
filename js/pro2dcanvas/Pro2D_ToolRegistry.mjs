export const Pro2D_toolRegistry = [
  { id: "pan", label: "Pan", icon: "✋", zone: "navigation", implemented: true, priority: 0 },
  { id: "select", label: "Select", icon: "🖱", zone: "draft", implemented: true, shortcut: "Esc", priority: 1 },
  { id: "marquee", label: "Marquee", icon: "▭", zone: "draft", implemented: true, note: "Uses select-mode drag in the viewport.", priority: 2 },
  { id: "measure", label: "Measure", icon: "📏", zone: "draft", implemented: false, note: "Distance overlay and measure report are not implemented yet.", priority: 3 },
  { id: "line", label: "Pipe", icon: "／", zone: "draft", implemented: true, priority: 4 },
  { id: "polyline", label: "Polyline", icon: "〰", zone: "draft", implemented: true, priority: 5 },
  { id: "spline", label: "Spline", icon: "∿", zone: "draft", implemented: true, priority: 6 },
  { id: "bend", label: "Bend", icon: "↷", zone: "fittings", implemented: false, note: "Canonical bend insert command is not wired yet.", priority: 7 },
  { id: "tee", label: "Tee", icon: "┬", zone: "fittings", implemented: false, note: "Canonical tee insert command is not wired yet.", priority: 8 },
  { id: "support", label: "Support", icon: "✚", zone: "fittings", implemented: true, priority: 9 },
  { id: "valve", label: "Valve", icon: "◇", zone: "fittings", implemented: true, priority: 10 },
  { id: "flange", label: "Flange", icon: "▮", zone: "fittings", implemented: true, priority: 11 },
  { id: "fvf", label: "FVF", icon: "▮◇▮", zone: "fittings", implemented: true, priority: 12 },
  { id: "reducer", label: "Reducer", icon: "⬘", zone: "fittings", implemented: true, priority: 13 },
  { id: "break", label: "Break", icon: "✂", zone: "repair", implemented: false, note: "Ribbon command exists but no canonical break pipeline is wired.", priority: 14 },
  { id: "connect", label: "Connect", icon: "⛓", zone: "repair", implemented: false, note: "No connect-endpoints command is implemented.", priority: 15 },
  { id: "stretch", label: "Stretch", icon: "↔", zone: "repair", implemented: false, note: "No stretch-endpoint command is implemented.", priority: 16 },
  { id: "gapClean", label: "Gap Clean", icon: "🧹", zone: "repair", implemented: false, note: "Repair placeholder only.", priority: 17 },
  { id: "overlapSolver", label: "Overlap", icon: "🧩", zone: "repair", implemented: false, note: "Repair placeholder only.", priority: 18 },
  { id: "underlay", label: "Underlay", icon: "🖼", zone: "interop", implemented: true, note: "Viewport supports underlay images through the store.", priority: 19 },
  { id: "annotations", label: "Issues", icon: "💬", zone: "interop", implemented: false, note: "Annotation layer is planned, not implemented.", priority: 20 },
  { id: "minimap", label: "Radar", icon: "🧭", zone: "interop", implemented: false, note: "No minimap/radar component is mounted yet.", priority: 21 }
];

export const Pro2D_toolMap = Object.fromEntries(Pro2D_toolRegistry.map((tool) => [tool.id, tool]));
export function Pro2D_getToolsByZone(zone) { return Pro2D_toolRegistry.filter((tool) => tool.zone === zone); }
export function Pro2D_getLeftRailTools() {
  const leftRailIds = ["pan", "select", "marquee", "measure", "line", "bend", "tee", "break", "connect", "stretch", "gapClean", "overlapSolver", "underlay", "minimap"];
  return leftRailIds.map((id) => Pro2D_toolMap[id]).filter(Boolean);
}
