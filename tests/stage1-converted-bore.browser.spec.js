import { expect, test } from '@playwright/test';

const RAW_PIPE_CSV = [
  'Sequence,Type,RefNo,Point,Bore,O/D,East,North,Up',
  '1,PIPE,P-OD-273,1,273.1,273.1,0,0,0',
  '2,PIPE,P-OD-273,2,273.1,273.1,1000,0,0',
].join('\n');

const RAW_TEE_CSV = [
  'Sequence,Type,RefNo,Point,Bore,O/D,East,North,Up',
  '1,TEE,T-OD-273,0,273.1,273.1,500,0,0',
  '2,TEE,T-OD-273,1,273.1,273.1,0,0,0',
  '3,TEE,T-OD-273,2,273.1,273.1,1000,0,0',
  '4,TEE,T-OD-273,3,273.05,273.05,500,500,0',
].join('\n');

test.describe('Stage 1 Converted Bore parsing', () => {
  test('converts pipe BORE OD 273.1 to DN250 before 2D component output', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async ({ csv }) => {
      const { runStage1 } = await import('/js/ray-concept/rc-stage1-parser.js');
      const logs = [];
      const out = runStage1(csv, (stage, event, ref, data) => logs.push({ stage, event, ref, data }));
      return { component: out.components[0], csvText: out.csvText, logs };
    }, { csv: RAW_PIPE_CSV });

    expect(result.component.type).toBe('PIPE');
    expect(result.component.bore).toBe(250);
    expect(result.component.rawBore).toBe('273.1');
    expect(result.component.boreConversion.status).toBe('od-to-dn');
    expect(result.csvText).toContain('250.0000');
    expect(result.logs.some(l => l.event === 'component-built' && l.data?.boreConversionStatus === 'od-to-dn')).toBe(true);
  });

  test('converts TEE header and branch BORE OD variants to DN250', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async ({ csv }) => {
      const { runStage1 } = await import('/js/ray-concept/rc-stage1-parser.js');
      const logs = [];
      const out = runStage1(csv, (stage, event, ref, data) => logs.push({ stage, event, ref, data }));
      return { component: out.components[0], csvText: out.csvText, logs };
    }, { csv: RAW_TEE_CSV });

    expect(result.component.type).toBe('TEE');
    expect(result.component.bore).toBe(250);
    expect(result.component.branchBore).toBe(250);
    expect(result.component.boreConversion.status).toBe('od-to-dn');
    expect(result.component.branchBoreConversion.status).toBe('od-to-dn');
    expect(result.csvText).toContain('250.0000');
    expect(result.logs.some(l => l.event === 'component-built' && l.data?.branchBoreConversionStatus === 'od-to-dn')).toBe(true);
  });
});
