import { expect, test } from '@playwright/test';

const BLOCKED_CONSOLE_PATTERNS = [
  /Cannot read properties of null \(reading 'useCallback'\)/i,
  /Invalid hook call/i,
  /Hooks can only be called inside/i,
  /Minified React error/i,
  /does not provide an export named/i,
  /Failed to resolve module specifier/i,
  /Import map/i,
];

function isBlockedMessage(text) {
  return BLOCKED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

test.describe('PCF Fixer browser mount', () => {
  test('opens PCF Fixer tab without duplicate-React hook crash', async ({ page }) => {
    const failures = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && isBlockedMessage(text)) {
        failures.push(`console.${msg.type()}: ${text}`);
      }
    });

    page.on('pageerror', (err) => {
      const text = err?.message || String(err);
      if (isBlockedMessage(text)) {
        failures.push(`pageerror: ${text}`);
      }
    });

    await page.goto('/');

    await expect(page.locator('#rtab-pcf-fixer')).toBeVisible();
    await page.locator('#rtab-pcf-fixer').click();

    const root = page.locator('#pcf-fixer-react-root');
    await expect(root).toBeVisible();

    await expect(root).toContainText(/Data Table|Core processor|3D Topology|Config|Output/i, {
      timeout: 30_000,
    });

    const storeExists = await page.evaluate(() => {
      return typeof window.useStore?.getState === 'function';
    });

    expect(storeExists).toBe(true);

    await page.waitForTimeout(1_000);

    expect(failures, failures.join('\n')).toEqual([]);
  });
});
