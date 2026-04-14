import { Pro2D_toolMap } from './Pro2D_ToolRegistry.mjs';

const toolAction = (id) => ({
  id: `tool_${id}`,
  label: Pro2D_toolMap[id]?.label || id,
  icon: Pro2D_toolMap[id]?.icon || '•',
  implemented: Pro2D_toolMap[id]?.implemented !== false,
  note: Pro2D_toolMap[id]?.note || ''
});

export const Pro2D_ribbonSections = [
  {
    id: 'file',
    title: 'Document',
    actions: [
      { id: 'loadMock', label: 'Load Mock', icon: '📦', implemented: true },
      { id: 'importDxf', label: 'Import DXF', icon: '📐', implemented: true },
      { id: 'pullInput', label: 'Pull Coor2PCF', icon: '⇣', implemented: true },
      { id: 'clear', label: 'Clear', icon: '🗑', implemented: true },
    ]
  },
  {
    id: 'review',
    title: 'Review',
    actions: [
      { id: 'validate', label: 'Validate', icon: '✔', implemented: true },
      { id: 'benchmark', label: 'Benchmark', icon: '⏱', implemented: true },
      toolAction('measure')
    ]
  },
  {
    id: 'draft',
    title: 'Draft',
    actions: [toolAction('pan'), toolAction('select'), toolAction('marquee'), toolAction('line'), toolAction('polyline'), toolAction('spline')]
  },
  {
    id: 'fittings',
    title: 'Fittings',
    actions: [toolAction('support'), toolAction('valve'), toolAction('flange'), toolAction('fvf'), toolAction('reducer'), toolAction('bend'), toolAction('tee')]
  },
  {
    id: 'repair',
    title: 'Repair',
    actions: [toolAction('break'), toolAction('connect'), toolAction('stretch'), toolAction('gapClean'), toolAction('overlapSolver')]
  },
  {
    id: 'interop',
    title: 'Interop',
    actions: [
      { id: 'exportSvg', label: 'Export SVG', icon: '🖼', implemented: true },
      { id: 'exportDxf', label: 'Export DXF', icon: '📐', implemented: true },
      toolAction('underlay'),
      toolAction('annotations'),
      toolAction('minimap')
    ]
  }
];
