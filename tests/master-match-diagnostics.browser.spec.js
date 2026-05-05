import { expect, test } from '@playwright/test';

test('Master Match Diagnostics exposes Converted Bore based CA3/CA4/CA7 match', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
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
    const rows = diag.buildMasterMatchDiagnostics();
    return rows[0];
  });

  expect(result.rawBore).toBe('273.1');
  expect(result.convertedBore).toBe('250');
  expect(result.matched).toBe('YES');
  expect(result.matchedSize).toBe('250');
  expect(result.ca3).toBe('A106-B');
  expect(result.ca4).toBe('9.27');
  expect(result.ca7).toBe('1.5');
  expect(result.matchSource).toBe('converted-bore');
});
