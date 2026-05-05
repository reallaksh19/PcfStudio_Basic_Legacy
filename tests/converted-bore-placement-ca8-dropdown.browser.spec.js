import { expect, test } from '@playwright/test';

const HEADERS = [
  'CSV Seq No', 'Sequence', 'RefNo', 'Component', 'Start X', 'Start Y', 'Start Z', 'DN (Bore)',
  'Len_Calc',
  'Axis 1', 'Grp L1', 'Axis 2', 'Grp L2', 'Axis 3', 'Grp L3',
  'Prev(SeqNo)', 'Next(SeqNo)', 'Prev(mm)', 'Next(mm)', 'Prev', 'Next', 'Prev(Gap)', 'Next(Gap)',
  'Prev(Target)', 'Next(Target)', 'Prev(EP1)', 'Next(EP2)',
  'Line No. (Derived)',
  'P1 (ATTR1)', 'T1 (ATTR2)', 'Ins Thk (ATTR5)', 'Ins Den (ATTR6)', 'Density (ATTR9)', 'HP (ATTR10)',
  'Piping Class', 'Rating', 'Rigid Type', 'Weight (ATTR8)', 'Material (ATTR3)', 'Wall Thk (ATTR4)', 'Corr (ATTR7)',
  'Support_GUID'
];

function makeRow({ component = 'VALVE', bore = '100', len = '200', rating = '150', rigidType = 'VALVE', ca8 = '0' } = {}) {
  const row = Array(HEADERS.length).fill('');
  row[HEADERS.indexOf('CSV Seq No')] = '1';
  row[HEADERS.indexOf('Sequence')] = '1';
  row[HEADERS.indexOf('RefNo')] = 'V-001';
  row[HEADERS.indexOf('Component')] = component;
  row[HEADERS.indexOf('DN (Bore)')] = bore;
  row[HEADERS.indexOf('Len_Calc')] = len;
  row[HEADERS.indexOf('Rating')] = rating;
  row[HEADERS.indexOf('Rigid Type')] = rigidType;
  row[HEADERS.indexOf('Weight (ATTR8)')] = ca8;
  return row;
}

test('Linelist Converted Bore control renders below Line No Derived attribute section', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { dataManager } = await import('/js/services/data-manager.js');
    const { initConvertedBoreTools } = await import('/js/ui/converted-bore-tools.js');

    const shell = document.createElement('div');
    shell.id = 'converted-bore-placement-test-shell';
    shell.innerHTML = `
      <section id="linelist-mapping-section">Mapping section</section>
      <section id="linelist-attr-section">Line No. Derived</section>
    `;
    document.body.appendChild(shell);

    dataManager.linelistData = [{ 'Line No. Derived': 'L-001', 'Nominal Pipe size': '273.1' }];
    initConvertedBoreTools();

    const tool = document.getElementById('converted-bore-tools-linelist');
    return {
      exists: Boolean(tool),
      previousId: tool?.previousElementSibling?.id || '',
      placement: tool?.dataset?.placement || '',
    };
  });

  expect(result.exists).toBe(true);
  expect(result.previousId).toBe('linelist-attr-section');
  expect(result.placement).toBe('below-line-no-derived');
});

test('CA8 valve cell shows dropdown when DN + rating + length has multiple weight matches', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async ({ headers, row }) => {
    const { dataManager } = await import('/js/services/data-manager.js');
    const { TableRenderer } = await import('/js/ui/table/TableRenderer.js');

    dataManager.weightData = [
      { 'Converted Bore': '100', Rating: '150', 'RF-F/F': '200', TypeDesc: 'BALL VALVE REDUCED BORE', 'RF/RTJ KG': '11.5' },
      { 'Converted Bore': '100', Rating: '150', 'RF-F/F': '200', TypeDesc: 'GATE VALVE', 'RF/RTJ KG': '14.2' },
    ];

    const host = document.createElement('div');
    host.id = 'ca8-dropdown-test-host';
    document.body.appendChild(host);

    const renderer = new TableRenderer(host, headers);
    const edits = [];
    renderer.render([{ data: row, isPoint: false }], (rowIdx, colIdx, value) => edits.push({ rowIdx, colIdx, value }));

    const select = host.querySelector('td[data-col="37"] select.ca8-valve-weight-select');
    if (select) {
      select.value = '14.2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return {
      exists: Boolean(select),
      options: select ? Array.from(select.options).map(option => option.textContent) : [],
      valueAfterChange: row[37],
      edits,
    };
  }, { headers: HEADERS, row: makeRow() });

  expect(result.exists).toBe(true);
  expect(result.options.length).toBe(3);
  expect(result.options.join('\n')).toContain('BALL VALVE REDUCED BORE');
  expect(result.options.join('\n')).toContain('GATE VALVE');
  expect(result.valueAfterChange).toBe('14.2');
  expect(result.edits).toEqual([{ rowIdx: 0, colIdx: 37, value: '14.2' }]);
});
