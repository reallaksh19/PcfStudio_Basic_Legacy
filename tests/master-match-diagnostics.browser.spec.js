import { expect, test } from '@playwright/test';

async function seedDiagnosticsFixture(page) {
  return page.evaluate(async () => {
    const { dataManager } = await import('/js/services/data-manager.js');
    const { ensureConvertedBoreRows } = await import('/js/services/bore-converter.js');
    const compat = await import('/js/services/piping-class-converted-bore-compat.js');
    const diag = await import('/js/ui/master-match-diagnostics-panel.js');

    dataManager.linelistData = ensureConvertedBoreRows([
      {
        'REF NO.': 'T-001',
        'Piping Class': 'A1',
        'BORE': '273.1',
        'OD': '273.1',
      }
    ], { type: 'linelist', sourceColumn: 'BORE' }).rows;

    dataManager.pipingClassMaster = ensureConvertedBoreRows([
      {
        'Piping Class': 'A1',
        'Size': '250',
        'CA3': 'A106-B',
        'CA4': '9.27',
        'CA7': '1.5',
      }
    ], { type: 'pipingclass', sourceColumn: 'Size' }).rows;

    compat.installPipingClassConvertedBoreCompat();
    diag.initMasterMatchDiagnosticsPanel();
    return diag.buildMasterMatchDiagnostics()[0];
  });
}

test('Master Match Diagnostics exposes Converted Bore based CA3/CA4/CA7 match', async ({ page }) => {
  await page.goto('/');
  const result = await seedDiagnosticsFixture(page);

  expect(result.rawBore).toBe('273.1');
  expect(result.convertedBore).toBe('250');
  expect(result.matched).toBe('YES');
  expect(result.matchedSize).toBe('250');
  expect(result.ca3).toBe('A106-B');
  expect(result.ca4).toBe('9.27');
  expect(result.ca7).toBe('1.5');
  expect(result.matchSource).toBe('converted-bore');
});

test('Master Match Diagnostics export UI and helper produce CSV and JSON payloads', async ({ page }) => {
  await page.goto('/');
  await seedDiagnosticsFixture(page);

  const exportResult = await page.evaluate(async () => {
    const diag = await import('/js/ui/master-match-diagnostics-panel.js');
    const renderedRows = diag.renderMasterMatchDiagnostics();
    const csvButton = document.querySelector('#master-match-diagnostics-export-csv');
    const jsonButton = document.querySelector('#master-match-diagnostics-export-json');
    const csvRows = diag.exportMasterMatchDiagnostics('csv');
    const jsonRows = diag.exportMasterMatchDiagnostics('json');

    return {
      renderedCount: renderedRows.length,
      csvButtonPresent: Boolean(csvButton),
      jsonButtonPresent: Boolean(jsonButton),
      csvCount: csvRows.length,
      jsonCount: jsonRows.length,
      first: csvRows[0],
      helper: typeof window.__EXPORT_MASTER_MATCH_DIAGNOSTICS__,
    };
  });

  expect(exportResult.renderedCount).toBeGreaterThan(0);
  expect(exportResult.csvButtonPresent).toBe(true);
  expect(exportResult.jsonButtonPresent).toBe(true);
  expect(exportResult.csvCount).toBeGreaterThan(0);
  expect(exportResult.jsonCount).toBeGreaterThan(0);
  expect(exportResult.first.convertedBore).toBe('250');
  expect(exportResult.first.matched).toBe('YES');
  expect(exportResult.first.ca3).toBe('A106-B');
  expect(exportResult.first.ca4).toBe('9.27');
  expect(exportResult.first.ca7).toBe('1.5');
  expect(exportResult.helper).toBe('function');
});
