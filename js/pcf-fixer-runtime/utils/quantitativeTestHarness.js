// ═══════════════════════════════════════════════════════════════
// * QUANTITATIVE TEST HARNESS — PCF Smart Fixer
// * ═══════════════════════════════════════════════════════════════
// *
// * Every test computes a NUMERIC value and compares it to an EXPECTED
// * numeric value. PASS = delta within tolerance. FAIL = delta exceeds.
// *
// * Usage (browser console after app loads):
// *   import('/src/utils/quantitativeTestHarness.js').then(m => m.runAll())
// *
// * Or attach to window for quick access:
// *   window.__QT__ = await import('/src/utils/quantitativeTestHarness.js');
// *   window.__QT__.runAll();
// *   window.__QT__.runSuite('SELECT');
// *   window.__QT__.runOne('SEL-01');
// */
// ─── LOGGING SYSTEM ──────────────────────────────────────────
const LOG = [];
const MAX_LOG = 2000;
/** Structured numeric log entry */
function qlog(testId, channel, metric, value, unit = '') {
  const entry = {
    t: performance.now(),
    testId,
    channel,    // 'MEASURE' | 'ASSERT' | 'PERF' | 'STATE' | 'EVENT'
    metric,     // e.g. 'selectedCount', 'latencyMs', 'rowDelta'
    value,      // always a number
    unit,       // 'ms' | 'count' | 'px' | 'mm' | 'bool(0/1)' | 'bytes'
  };
  LOG.push(entry);
  if (LOG.length > MAX_LOG) LOG.shift();
  return entry;
}
/** Assert: numeric value vs expected, with tolerance */
function qassert(testId, metric, actual, expected, tolerance, unit = '') {
  const delta = Math.abs(actual - expected);
  const pass = delta <= tolerance;
  qlog(testId, 'ASSERT', metric, actual, unit);
  return {
    testId,
    metric,
    actual,
    expected,
    delta,
    tolerance,
    unit,
    pass,
    verdict: pass ? '✅ PASS' : '❌ FAIL',
  };
}
/** Performance timer */
function qperf(testId, metric, fn) {
  const t0 = performance.now();
  const result = fn();
  const elapsed = performance.now() - t0;
  qlog(testId, 'PERF', metric, elapsed, 'ms');
  return { elapsed, result };
}
// ─── STORE ACCESS ────────────────────────────────────────────
function S() {
  // window.useStore is exposed by src/exposeStore.js (imported in main.jsx)
  if (!window.useStore) throw new Error('[QT] window.useStore not found. Ensure exposeStore.js is imported in main.jsx.');
  return window.useStore.getState();
}
// ─── TEST DEFINITIONS ────────────────────────────────────────
// Each test returns an array of qassert results.
// Format: { id, suite, name, fn: () => qassert[] }
const TESTS = [];
function defTest(id, suite, name, fn) {
  TESTS.push({ id, suite, name, fn });
}
// ════════════════════════════════════════════════════════════
// SUITE: SELECT — Single/Multi selection on main canvas
// ════════════════════════════════════════════════════════════
defTest('SEL-01', 'SELECT', 'Single select sets selectedElementId to non-null', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length === 0) return [qassert('SEL-01', 'dataTableLength', 0, 1, 0, 'count')]; // no data = fail
  const targetRow = rows[0]._rowIndex;
  s.clearMultiSelect();
  s.setSelected(null);
  // ACT
  s.setSelected(targetRow);
  s.setMultiSelect([targetRow]);
  // ASSERT
  const selId = s.selectedElementId;
  const multiLen = s.multiSelectedIds.length;
  return [
    qassert('SEL-01', 'selectedElementId', selId, targetRow, 0, 'rowIndex'),
    qassert('SEL-01', 'multiSelectedIds.length', multiLen, 1, 0, 'count'),
  ];
});
defTest('SEL-02', 'SELECT', 'Multi-select accumulates correct count', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 3) return [qassert('SEL-02', 'dataTableLength', rows.length, 3, 0, 'count')];
  s.clearMultiSelect();
  s.setSelected(null);
  // ACT — select 3
  s.toggleMultiSelect(rows[0]._rowIndex);
  s.toggleMultiSelect(rows[1]._rowIndex);
  s.toggleMultiSelect(rows[2]._rowIndex);
  return [
    qassert('SEL-02', 'multiSelectedIds.length', s.multiSelectedIds.length, 3, 0, 'count'),
  ];
});
defTest('SEL-03', 'SELECT', 'Toggle deselect reduces count by exactly 1', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 3) return [qassert('SEL-03', 'dataTableLength', rows.length, 3, 0, 'count')];
  s.clearMultiSelect();
  s.toggleMultiSelect(rows[0]._rowIndex);
  s.toggleMultiSelect(rows[1]._rowIndex);
  s.toggleMultiSelect(rows[2]._rowIndex);
  const before = s.multiSelectedIds.length; // 3
  // ACT — deselect one
  s.toggleMultiSelect(rows[1]._rowIndex);
  const after = s.multiSelectedIds.length;
  return [
    qassert('SEL-03', 'countBefore', before, 3, 0, 'count'),
    qassert('SEL-03', 'countAfter', after, 2, 0, 'count'),
    qassert('SEL-03', 'delta', before - after, 1, 0, 'count'),
  ];
});
defTest('SEL-04', 'SELECT', 'ClearMultiSelect sets count to zero', () => {
  const s = S();
  s.setMultiSelect([1, 2, 3, 4, 5]);
  const before = s.multiSelectedIds.length;
  s.clearMultiSelect();
  return [
    qassert('SEL-04', 'before', before, 5, 0, 'count'),
    qassert('SEL-04', 'after', s.multiSelectedIds.length, 0, 0, 'count'),
  ];
});
defTest('SEL-05', 'SELECT', 'Select latency under 2ms', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length === 0) return [qassert('SEL-05', 'dataTableLength', 0, 1, 0)];
  const { elapsed } = qperf('SEL-05', 'selectLatencyMs', () => {
    for (let i = 0; i < 100; i++) {
      s.setSelected(rows[i % rows.length]._rowIndex);
      s.setMultiSelect([rows[i % rows.length]._rowIndex]);
    }
  });
  const perOp = elapsed / 100;
  return [
    qassert('SEL-05', 'perOpMs', perOp, 0, 2.0, 'ms'), // expect ~0, tolerance 2ms
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: MODE — Tool mode switching and cleanup
// ════════════════════════════════════════════════════════════
defTest('MODE-01', 'MODE', 'setCanvasMode changes mode value', () => {
  const s = S();
  s.setCanvasMode('MEASURE');
  const v1 = s.canvasMode === 'MEASURE' ? 1 : 0;
  s.setCanvasMode('VIEW');
  const v2 = s.canvasMode === 'VIEW' ? 1 : 0;
  return [
    qassert('MODE-01', 'modeSetCorrectly', v1, 1, 0, 'bool'),
    qassert('MODE-01', 'modeResetCorrectly', v2, 1, 0, 'bool'),
  ];
});
defTest('MODE-02', 'MODE', 'Mode switch clears measurePts (count → 0)', () => {
  const s = S();
  // Seed measure points
  s.setCanvasMode('MEASURE');
  s.addMeasurePt({ x: 0, y: 0, z: 0, clone: () => ({ x: 0, y: 0, z: 0 }), distanceTo: () => 0 });
  s.addMeasurePt({ x: 100, y: 0, z: 0, clone: () => ({ x: 100, y: 0, z: 0 }), distanceTo: () => 100 });
  const before = s.measurePts.length;
  // ACT — switch away
  s.setCanvasMode('BREAK');
  const after = s.measurePts.length;
  return [
    qassert('MODE-02', 'measurePtsBefore', before, 2, 0, 'count'),
    // After fix: should be 0. Before fix: will be 2 (FAIL expected until WI applied)
    qassert('MODE-02', 'measurePtsAfter', after, 0, 0, 'count'),
  ];
});
defTest('MODE-03', 'MODE', 'All 8 modes activate without error', () => {
  const s = S();
  const modes = ['VIEW', 'CONNECT', 'STRETCH', 'BREAK', 'MEASURE',
                  'INSERT_SUPPORT', 'MARQUEE_SELECT', 'MARQUEE_ZOOM'];
  let errorCount = 0;
  modes.forEach(m => {
    try { s.setCanvasMode(m); } catch (e) { errorCount++; }
  });
  s.setCanvasMode('VIEW');
  return [
    qassert('MODE-03', 'modesTestedCount', modes.length, 8, 0, 'count'),
    qassert('MODE-03', 'errorCount', errorCount, 0, 0, 'count'),
  ];
});
defTest('MODE-04', 'MODE', 'Mode switch latency per op under 1ms', () => {
  const s = S();
  const modes = ['CONNECT', 'STRETCH', 'BREAK', 'VIEW'];
  const { elapsed } = qperf('MODE-04', 'modeSwitchMs', () => {
    for (let i = 0; i < 400; i++) s.setCanvasMode(modes[i % 4]);
  });
  return [
    qassert('MODE-04', 'perSwitchMs', elapsed / 400, 0, 1.0, 'ms'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: HIDE — Hide/Isolate/Unhide element visibility
// ════════════════════════════════════════════════════════════
defTest('HIDE-01', 'HIDE', 'hideSelected increments hiddenElementIds by selection count', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 5) return [qassert('HIDE-01', 'rowCount', rows.length, 5, 0)];
  s.setHiddenElementIds([]);
  s.setMultiSelect([rows[0]._rowIndex, rows[1]._rowIndex]);
  s.setSelected(rows[0]._rowIndex);
  const hiddenBefore = s.hiddenElementIds.length;
  s.hideSelected();
  const hiddenAfter = s.hiddenElementIds.length;
  return [
    qassert('HIDE-01', 'hiddenBefore', hiddenBefore, 0, 0, 'count'),
    qassert('HIDE-01', 'hiddenAfter', hiddenAfter, 2, 0, 'count'),
    qassert('HIDE-01', 'delta', hiddenAfter - hiddenBefore, 2, 0, 'count'),
  ];
});
defTest('HIDE-02', 'HIDE', 'isolateSelected hides all EXCEPT selected', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 5) return [qassert('HIDE-02', 'rowCount', rows.length, 5, 0)];
  s.setHiddenElementIds([]);
  s.setMultiSelect([rows[0]._rowIndex, rows[1]._rowIndex]);
  s.isolateSelected();
  const totalRows = rows.length;
  const hiddenCount = s.hiddenElementIds.length;
  const visibleCount = totalRows - hiddenCount;
  return [
    qassert('HIDE-02', 'totalRows', totalRows, totalRows, 0, 'count'),
    qassert('HIDE-02', 'visibleCount', visibleCount, 2, 0, 'count'),
    qassert('HIDE-02', 'hiddenCount', hiddenCount, totalRows - 2, 0, 'count'),
  ];
});
defTest('HIDE-03', 'HIDE', 'unhideAll sets hiddenElementIds to zero', () => {
  const s = S();
  s.setHiddenElementIds([1, 2, 3, 4, 5]);
  s.unhideAll();
  return [
    qassert('HIDE-03', 'hiddenAfterUnhide', s.hiddenElementIds.length, 0, 0, 'count'),
  ];
});
defTest('HIDE-04', 'HIDE', 'getPipes excludes hidden rows', () => {
  const s = S();
  const allPipes = s.dataTable.filter(r => (r.type || '').toUpperCase() === 'PIPE');
  if (allPipes.length < 2) return [qassert('HIDE-04', 'pipeCount', allPipes.length, 2, 0)];
  s.setHiddenElementIds([allPipes[0]._rowIndex]);
  const visiblePipes = s.getPipes();
  const expectedVisible = allPipes.length - 1;
  s.setHiddenElementIds([]); // cleanup
  return [
    qassert('HIDE-04', 'visiblePipes', visiblePipes.length, expectedVisible, 0, 'count'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: DELETE — Element deletion and dataTable integrity
// ════════════════════════════════════════════════════════════
defTest('DEL-01', 'DELETE', 'deleteElements reduces dataTable.length by exact count', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 3) return [qassert('DEL-01', 'rowCount', rows.length, 3, 0)];
  const before = rows.length;
  const toDelete = [rows[0]._rowIndex, rows[1]._rowIndex];
  s.pushHistory('TEST-DEL-01');
  s.deleteElements(toDelete);
  const after = s.dataTable.length;
  // Restore
  s.undo();
  return [
    qassert('DEL-01', 'lengthBefore', before, before, 0, 'count'),
    qassert('DEL-01', 'lengthAfter', after, before - 2, 0, 'count'),
    qassert('DEL-01', 'delta', before - after, 2, 0, 'count'),
  ];
});
defTest('DEL-02', 'DELETE', 'After delete, _rowIndex re-indexed 1..N contiguous', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 5) return [qassert('DEL-02', 'rowCount', rows.length, 5, 0)];
  s.pushHistory('TEST-DEL-02');
  s.deleteElements([rows[2]._rowIndex]); // delete middle
  const newRows = s.dataTable;
  let contiguousErrors = 0;
  newRows.forEach((r, i) => {
    if (r._rowIndex !== i + 1) contiguousErrors++;
  });
  s.undo(); // restore
  return [
    qassert('DEL-02', 'contiguousErrors', contiguousErrors, 0, 0, 'count'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: UNDO — History stack correctness
// ════════════════════════════════════════════════════════════
defTest('UND-01', 'UNDO', 'pushHistory increases history depth by 1', () => {
  const s = S();
  const before = s.history.length;
  s.pushHistory('TEST-UND-01');
  const after = s.history.length;
  return [
    qassert('UND-01', 'historyDelta', after - before, 1, 0, 'count'),
  ];
});
defTest('UND-02', 'UNDO', 'Undo restores exact row count after delete', () => {
  const s = S();
  const rows = s.dataTable;
  if (rows.length < 3) return [qassert('UND-02', 'rowCount', rows.length, 3, 0)];
  const originalLen = rows.length;
  s.pushHistory('TEST-UND-02');
  s.deleteElements([rows[0]._rowIndex]);
  const afterDelete = s.dataTable.length;
  s.undo();
  const afterUndo = s.dataTable.length;
  return [
    qassert('UND-02', 'afterDelete', afterDelete, originalLen - 1, 0, 'count'),
    qassert('UND-02', 'afterUndo', afterUndo, originalLen, 0, 'count'),
  ];
});
defTest('UND-03', 'UNDO', 'History capped at 20 entries', () => {
  const s = S();
  for (let i = 0; i < 25; i++) s.pushHistory(`CAP-${i}`);
  return [
    qassert('UND-03', 'historyLength', s.history.length, 20, 0, 'count'),
  ];
});
defTest('UND-04', 'UNDO', 'Undo performance for 500 rows under 30ms', () => {
  const s = S();
  // Ensure we have a history entry
  s.pushHistory('PERF-UND-04');
  s.pushHistory('PERF-UND-04b');
  const { elapsed } = qperf('UND-04', 'undoMs', () => { s.undo(); });
  return [
    qassert('UND-04', 'undoLatencyMs', elapsed, 0, 30, 'ms'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: TRANSLUCENT — Translucent mode independence
// ════════════════════════════════════════════════════════════
defTest('TRN-01', 'TRANSLUCENT', 'translucentMode toggles between 0 and 1', () => {
  const s = S();
  s.setTranslucentMode(false);
  const v0 = s.translucentMode ? 1 : 0;
  s.setTranslucentMode(true);
  const v1 = s.translucentMode ? 1 : 0;
  s.setTranslucentMode(false); // cleanup
  return [
    qassert('TRN-01', 'offValue', v0, 0, 0, 'bool'),
    qassert('TRN-01', 'onValue', v1, 1, 0, 'bool'),
  ];
});
defTest('TRN-02', 'TRANSLUCENT', 'showRowLabels does NOT change translucentMode', () => {
  const s = S();
  s.setTranslucentMode(false);
  s.setShowRowLabels(true);
  const translucent = s.translucentMode ? 1 : 0;
  s.setShowRowLabels(false); // cleanup
  return [
    qassert('TRN-02', 'translucentAfterLabels', translucent, 0, 0, 'bool'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: COLORMODE — Color mode value integrity
// ════════════════════════════════════════════════════════════
defTest('CLR-01', 'COLORMODE', 'setColorMode persists exact string', () => {
  const s = S();
  const modes = ['TYPE', 'SPOOL', 'PIPELINE_REF', 'CA1', 'CA5', ''];
  let matchCount = 0;
  modes.forEach(m => {
    s.setColorMode(m);
    if (s.colorMode === m) matchCount++;
  });
  s.setColorMode('TYPE'); // cleanup
  return [
    qassert('CLR-01', 'matchCount', matchCount, modes.length, 0, 'count'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: TOPOLOGY — getPipes / getImmutables count integrity
// ════════════════════════════════════════════════════════════
defTest('TOPO-01', 'TOPOLOGY', 'getPipes + getImmutables = total non-hidden rows', () => {
  const s = S();
  s.setHiddenElementIds([]);
  const pipes = s.getPipes().length;
  const immutables = s.getImmutables().length;
  const total = s.dataTable.length;
  return [
    qassert('TOPO-01', 'pipes+immutables', pipes + immutables, total, 0, 'count'),
  ];
});
defTest('TOPO-02', 'TOPOLOGY', 'All getPipes results have type PIPE', () => {
  const s = S();
  s.setHiddenElementIds([]);
  const pipes = s.getPipes();
  let nonPipeCount = 0;
  pipes.forEach(p => { if ((p.type || '').toUpperCase() !== 'PIPE') nonPipeCount++; });
  return [
    qassert('TOPO-02', 'nonPipeInGetPipes', nonPipeCount, 0, 0, 'count'),
  ];
});
defTest('TOPO-03', 'TOPOLOGY', 'No getImmutables result has type PIPE', () => {
  const s = S();
  s.setHiddenElementIds([]);
  const imm = s.getImmutables();
  let pipeCount = 0;
  imm.forEach(p => { if ((p.type || '').toUpperCase() === 'PIPE') pipeCount++; });
  return [
    qassert('TOPO-03', 'pipeInGetImmutables', pipeCount, 0, 0, 'count'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: CONTEXT — Context menu state
// ════════════════════════════════════════════════════════════
defTest('CTX-01', 'CONTEXT', 'setContextMenu stores exact coordinates', () => {
  const s = S();
  s.setContextMenu({ x: 123.5, y: 456.7, rowIndex: 42 });
  const cm = s.contextMenu;
  const results = [
    qassert('CTX-01', 'x', cm.x, 123.5, 0.01, 'px'),
    qassert('CTX-01', 'y', cm.y, 456.7, 0.01, 'px'),
    qassert('CTX-01', 'rowIndex', cm.rowIndex, 42, 0, 'rowIndex'),
  ];
  s.closeContextMenu();
  return results;
});
defTest('CTX-02', 'CONTEXT', 'closeContextMenu sets to null (0)', () => {
  const s = S();
  s.setContextMenu({ x: 0, y: 0, rowIndex: 1 });
  s.closeContextMenu();
  return [
    qassert('CTX-02', 'isNull', s.contextMenu === null ? 1 : 0, 1, 0, 'bool'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: MEASURE — Measure point accumulation
// ════════════════════════════════════════════════════════════
defTest('MEA-01', 'MEASURE', 'addMeasurePt accumulates to 2 then resets on 3rd', () => {
  const s = S();
  s.clearMeasure();
  const pt = { x: 0, y: 0, z: 0 };
  s.addMeasurePt(pt);
  const after1 = s.measurePts.length;
  s.addMeasurePt(pt);
  const after2 = s.measurePts.length;
  s.addMeasurePt(pt); // 3rd click resets to 1
  const after3 = s.measurePts.length;
  s.clearMeasure();
  return [
    qassert('MEA-01', 'after1Click', after1, 1, 0, 'count'),
    qassert('MEA-01', 'after2Clicks', after2, 2, 0, 'count'),
    qassert('MEA-01', 'after3Clicks', after3, 1, 0, 'count'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: THEME — Theme application integrity
// ════════════════════════════════════════════════════════════
defTest('THM-01', 'THEME', 'Component colors object has exactly 8 keys', () => {
  const s = S();
  const keyCount = Object.keys(s.appSettings.componentColors).length;
  return [
    qassert('THM-01', 'colorKeyCount', keyCount, 8, 0, 'count'),
  ];
});
defTest('THM-02', 'THEME', 'All color values are valid 7-char hex strings', () => {
  const s = S();
  const colors = Object.values(s.appSettings.componentColors);
  let invalidCount = 0;
  colors.forEach(c => {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) invalidCount++;
  });
  return [
    qassert('THM-02', 'invalidHexColors', invalidCount, 0, 0, 'count'),
  ];
});
// ════════════════════════════════════════════════════════════
// SUITE: PERF — Bulk operation benchmarks
// ════════════════════════════════════════════════════════════
defTest('PERF-01', 'PERF', 'setDataTable for 500 rows under 10ms', () => {
  const s = S();
  const fakeRows = Array.from({ length: 500 }, (_, i) => ({
    _rowIndex: i + 1, type: 'PIPE', bore: 100,
    ep1: { x: i * 100, y: 0, z: 0 },
    ep2: { x: (i + 1) * 100, y: 0, z: 0 },
  }));
  const originalTable = s.dataTable;
  const { elapsed } = qperf('PERF-01', 'setDataTable500', () => {
    s.setDataTable(fakeRows);
  });
  s.setDataTable(originalTable); // restore
  return [
    qassert('PERF-01', 'latencyMs', elapsed, 0, 10, 'ms'),
  ];
});
defTest('PERF-02', 'PERF', 'getPipes filter on 1000 rows under 5ms', () => {
  const s = S();
  const fakeRows = Array.from({ length: 1000 }, (_, i) => ({
    _rowIndex: i + 1, type: i % 3 === 0 ? 'VALVE' : 'PIPE', bore: 100,
    ep1: { x: i * 100, y: 0, z: 0 },
    ep2: { x: (i + 1) * 100, y: 0, z: 0 },
  }));
  const originalTable = s.dataTable;
  s.setDataTable(fakeRows);
  s.setHiddenElementIds([]);
  const { elapsed, result } = qperf('PERF-02', 'getPipes1000', () => s.getPipes());
  const pipeCount = result.length;
  s.setDataTable(originalTable); // restore
  // 1000 rows, every 3rd is VALVE, so ~667 pipes
  return [
    qassert('PERF-02', 'filterLatencyMs', elapsed, 0, 5, 'ms'),
    qassert('PERF-02', 'pipeCount', pipeCount, 667, 1, 'count'),
  ];
});
defTest('PERF-03', 'PERF', 'Multi-select 100 elements under 5ms', () => {
  const s = S();
  const ids = Array.from({ length: 100 }, (_, i) => i + 1);
  const { elapsed } = qperf('PERF-03', 'multiSelect100', () => {
    s.setMultiSelect(ids);
  });
  s.clearMultiSelect();
  return [
    qassert('PERF-03', 'latencyMs', elapsed, 0, 5, 'ms'),
  ];
});
// ─── RUNNER ──────────────────────────────────────────────────
function printResults(results) {
  const flat = results.flat();
  const passed = flat.filter(r => r.pass).length;
  const failed = flat.filter(r => !r.pass).length;
  const total = flat.length;
  console.log('\n' + '═'.repeat(80));
  console.log(`  QUANTITATIVE TEST RESULTS: ${passed}/${total} PASS, ${failed} FAIL`);
  console.log('═'.repeat(80));
  // Group by testId
  const grouped = {};
  flat.forEach(r => {
    if (!grouped[r.testId]) grouped[r.testId] = [];
    grouped[r.testId].push(r);
  });
  Object.entries(grouped).forEach(([testId, asserts]) => {
    const allPass = asserts.every(a => a.pass);
    console.log(`\n${allPass ? '✅' : '❌'} ${testId}`);
    asserts.forEach(a => {
      const status = a.pass ? '  ✅' : '  ❌';
      const detail = `${a.metric}: actual=${a.actual} expected=${a.expected} ±${a.tolerance}${a.unit} Δ=${a.delta.toFixed(4)}`;
      console.log(`${status} ${detail}`);
    });
  });
  console.log('\n' + '─'.repeat(80));
  console.log(`  SUMMARY: ${passed} passed, ${failed} failed, ${total} assertions`);
  console.log('─'.repeat(80));
  return { passed, failed, total, results: flat };
}
export function runAll() {
  console.log('[QT] Running all tests...');
  const results = TESTS.map(t => {
    try {
      const r = t.fn();
      return r.map(a => ({ ...a, suite: t.suite, testName: t.name }));
    } catch (e) {
      console.error(`[QT] ${t.id} THREW:`, e);
      return [{ testId: t.id, metric: 'EXCEPTION', actual: 1, expected: 0,
                delta: 1, tolerance: 0, unit: 'error', pass: false,
                verdict: '❌ EXCEPTION', suite: t.suite, testName: t.name }];
    }
  });
  return printResults(results);
}
export function runSuite(suite) {
  const tests = TESTS.filter(t => t.suite === suite);
  console.log(`[QT] Running suite "${suite}" (${tests.length} tests)...`);
  const results = tests.map(t => {
    try { return t.fn(); } catch (e) {
      return [{ testId: t.id, metric: 'EXCEPTION', actual: 1, expected: 0,
                delta: 1, tolerance: 0, unit: 'error', pass: false, verdict: '❌ EXCEPTION' }];
    }
  });
  return printResults(results);
}
export function runOne(id) {
  const t = TESTS.find(t => t.id === id);
  if (!t) { console.error(`[QT] Test ${id} not found`); return; }
  try { return printResults([t.fn()]); } catch (e) {
    console.error(`[QT] ${id} THREW:`, e);
  }
}
export function getLog() { return [...LOG]; }
export function exportLog() {
  const blob = new Blob([JSON.stringify(LOG, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `qt_log_${Date.now()}.json`; a.click();
}
// Auto-attach to window for console access
if (typeof window !== 'undefined') {
  window.__QT__ = { runAll, runSuite, runOne, getLog, exportLog, LOG, TESTS };
  console.log('[QT] Quantitative Test Harness loaded. Run: __QT__.runAll()');
}
