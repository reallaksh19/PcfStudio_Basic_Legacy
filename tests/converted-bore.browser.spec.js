import { expect, test } from '@playwright/test';

const CASES = [
  { raw: '273.1', sourceColumn: 'OD', expected: '250', status: 'od-to-dn' },
  { raw: '273.05', sourceColumn: 'OD', expected: '250', status: 'od-to-dn' },
  { raw: '273', sourceColumn: 'OD', expected: '250', status: 'od-to-dn' },
  { raw: '1/2"', sourceColumn: 'NPS', expected: '15', status: 'nps-to-dn' },
  { raw: '3/4"', sourceColumn: 'NPS', expected: '20', status: 'nps-to-dn' },
  { raw: '1 1/2"', sourceColumn: 'NPS', expected: '40', status: 'nps-to-dn' },
  { raw: '1-1/2"', sourceColumn: 'NPS', expected: '40', status: 'nps-to-dn' },
  { raw: '1½"', sourceColumn: 'NPS', expected: '40', status: 'nps-to-dn' },
  { raw: '4/6"', sourceColumn: 'NPS', expected: '100/150', status: 'range' },
  { raw: 'NULL', sourceColumn: 'BORE', expected: '', status: 'blank' },
  { raw: '', sourceColumn: 'BORE', expected: '', status: 'blank' },
];

test.describe('Converted Bore canonical conversion', () => {
  test('converts OD/NPS/DN/range/null edge cases consistently', async ({ page }) => {
    await page.goto('/');

    const results = await page.evaluate(async ({ cases }) => {
      const mod = await import('/js/services/bore-converter.js');
      return cases.map((c) => {
        const actual = mod.convertBoreValue(c.raw, { sourceColumn: c.sourceColumn });
        return {
          raw: c.raw,
          sourceColumn: c.sourceColumn,
          expected: c.expected,
          expectedStatus: c.status,
          actual: actual.convertedBore,
          status: actual.status,
          boreMm: actual.boreMm,
          boreRangeMm: actual.boreRangeMm || null,
        };
      });
    }, { cases: CASES });

    for (const r of results) {
      expect(r.actual, `${r.raw} from ${r.sourceColumn}`).toBe(r.expected);
      expect(r.status, `${r.raw} status`).toBe(r.expectedStatus);
    }
  });

  test('adds Converted Bore columns and preserves conversion status on rows', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const mod = await import('/js/services/bore-converter.js');
      return mod.ensureConvertedBoreRows([
        { Size: '273.1' },
        { Size: '1/2"' },
        { Size: '4/6"' },
        { Size: 'NULL' },
      ], { type: 'pipingclass', sourceColumn: 'Size' });
    });

    expect(result.sourceColumn).toBe('Size');
    expect(result.converted).toBe(3);
    expect(result.unresolved).toBe(1);
    expect(result.rows.map((r) => r['Converted Bore'])).toEqual(['250', '15', '100/150', '']);
    expect(result.rows.map((r) => r['_Converted Bore Status'])).toEqual(['od-to-dn', 'nps-to-dn', 'range', 'blank']);
  });
});
