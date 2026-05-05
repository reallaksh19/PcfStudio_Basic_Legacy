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

test('Master Match Diagnostics export buttons produce CSV and JSON downloads', async ({ page }) => {
  await page.goto('/');
  await seedDiagnosticsFixture(page);

  await page.evaluate(async () => {
    const diag = await import('/js/ui/master-match-diagnostics-panel.js');
    diag.renderMasterMatchDiagnostics();
  });

  const csvDownload = page.waitForEvent('download');
  await page.locator('#master-match-diagnostics-export-csv').click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toMatch(/^master-match-diagnostics-.*\.csv$/);

  const jsonDownload = page.waitForEvent('download');
  await page.locator('#master-match-diagnostics-export-json').click();
  const json = await jsonDownload;
  expect(json.suggestedFilename()).toMatch(/^master-match-diagnostics-.*\.json$/);

  const helperExists = await page.evaluate(() => typeof window.__EXPORT_MASTER_MATCH_DIAGNOSTICS__ === 'function');
  expect(helperExists).toBe(true);
});
