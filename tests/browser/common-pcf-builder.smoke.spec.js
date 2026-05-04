import { test, expect } from '@playwright/test';

const syntheticFixture = {
  components: [
    {
      type: 'PIPE',
      refNo: 'P001',
      ca97: 'P001',
      ca98: '1',
      seqNo: 1,
      bore: 100,
      ep1: { x: 0, y: 0, z: 0 },
      ep2: { x: 1000, y: 0, z: 0 },
    },
  ],
  injectedPipes: [],
  pipelineRef: 'SMOKE-LINE-001',
  cfg: {
    decimalPrecision: 4,
    windowsLineEndings: true,
    messageSquareEnabled: true,
    commonBuilderRunLegacyDiff: false,
    supportMapping: { guidPrefix: 'UCI:', fallbackName: 'CA150' },
  },
};

test('Common PCF Builder emits and certifies in browser', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await expect.poll(async () => page.evaluate(() => typeof import === 'function').catch(() => true)).toBeTruthy();

  const result = await page.evaluate(async (fixture) => {
    localStorage.setItem('pcfStudio.engineMode', 'common');

    const builder = await import('/js/pcf-engine/common-pcf-builder.js');
    const cert = await import('/js/pcf-engine/certification-runner.js');

    const run = builder.buildCommonPcf({
      components: fixture.components,
      injectedPipes: fixture.injectedPipes,
      pipelineRef: fixture.pipelineRef,
      cfg: fixture.cfg,
      logFn: () => {},
      legacyEmitter: null,
    });

    const certification = cert.runCommonPcfCertification({
      rows: run.model.blocks,
      pcfText: run.pcfText,
      diff: run.diff,
      meta: run.meta,
      emitResult: run.emitResult,
    }, {
      requireLegacyCommonDiff: false,
      output: { decimalPrecision: 4, requireCrlf: true },
    });

    return {
      meta: run.meta,
      pcfText: run.pcfText,
      certification,
      lastRunMeta: window.__COMMON_PCF_BUILDER_LAST_RUN__?.meta || null,
      helperType: typeof window.printLastCommonPcfCertification,
    };
  }, syntheticFixture);

  expect(result.meta.emittedBy).toBe('pcf-model-emitter');
  expect(result.meta.phase).toBe('phase4g-smart-preprocessed-common-emitter');
  expect(result.meta.blockCount).toBeGreaterThan(0);
  expect(result.pcfText).toContain('PIPE');
  expect(result.pcfText).toContain('END-POINT');
  expect(result.lastRunMeta?.emittedBy).toBe('pcf-model-emitter');
  expect(result.helperType).toBe('function');
  expect(result.certification.status).toBe('PASS');
  expect(result.certification.summary.commonPathOk).toBe(true);
  expect(result.certification.summary.validatorErrors).toBe(0);

  expect(consoleErrors).toEqual([]);
});
