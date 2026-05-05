import { expect, test } from '@playwright/test';
import fixture from './fixtures/converted-bore-master-match.fixture.json' assert { type: 'json' };

test('Converted Bore real fixture resolves OD 273 variants to DN250 master CA values', async ({ page }) => {
  await page.goto('/');

  const rows = await page.evaluate(async ({ fixture }) => {
    const { dataManager } = await import('/js/services/data-manager.js');
    const { ensureConvertedBoreRows } = await import('/js/services/bore-converter.js');
    const compat = await import('/js/services/piping-class-converted-bore-compat.js');
    const diag = await import('/js/ui/master-match-diagnostics-panel.js');

    dataManager.linelistData = ensureConvertedBoreRows(fixture.linelistRows, {
      type: 'linelist',
      sourceColumn: 'BORE',
    }).rows;
    dataManager.pipingClassMaster = ensureConvertedBoreRows(fixture.pipingClassRows, {
      type: 'pipingclass',
      sourceColumn: 'Size',
    }).rows;

    compat.installPipingClassConvertedBoreCompat();
    return diag.buildMasterMatchDiagnostics();
  }, { fixture });

  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.convertedBore, row.refNo).toBe(fixture.expected.convertedBore);
    expect(row.matched, row.refNo).toBe(fixture.expected.matched);
    expect(row.matchedSize, row.refNo).toBe(fixture.expected.matchedSize);
    expect(row.matchedClass, row.refNo).toBe(fixture.expected.matchedClass);
    expect(row.ca3, row.refNo).toBe(fixture.expected.ca3);
    expect(row.ca4, row.refNo).toBe(fixture.expected.ca4);
    expect(row.ca7, row.refNo).toBe(fixture.expected.ca7);
    expect(row.matchSource, row.refNo).toBe(fixture.expected.matchSource);
  }
});
