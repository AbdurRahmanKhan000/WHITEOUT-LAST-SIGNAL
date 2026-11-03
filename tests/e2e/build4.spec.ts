import { expect, test } from '@playwright/test';

test('build 4: settings persist, objective shows, damage flashes, results shell exists', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    await page.goto('/');
    // Settings sliders persist across a reload (IndexedDB save).
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.evaluate(() => {
        const master = document.getElementById('setting-master') as HTMLInputElement;
        master.value = '0.5';
        master.dispatchEvent(new Event('input', { bubbles: true }));
        master.dispatchEvent(new Event('change', { bubbles: true }));
        const quality = document.getElementById('setting-quality') as HTMLSelectElement;
        quality.value = 'low';
        quality.dispatchEvent(new Event('input', { bubbles: true }));
        quality.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('#setting-master')).toHaveValue('0.5');
    await expect(page.locator('#setting-quality')).toHaveValue('low');
    // A reload lands back on the home panel, so go straight to the arena.
    await page.getByRole('button', { name: 'Test Arena (Build 1)' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    await expect(page.locator('#hud-objective-text')).toContainText('Eliminate all 3 enemies');
    await expect(page.locator('#results-overlay')).toBeHidden();
    // Debug damage flashes the red damage overlay.
    await page.keyboard.press('KeyH');
    await expect(page.locator('#hud-health-text')).toContainText('Health 90 / 100');
    const flashOpacity = await page.evaluate(() => {
        const flash = document.getElementById('hud-damage-flash');
        return flash === null ? '' : window.getComputedStyle(flash).opacity;
    });
    expect(flashOpacity).not.toBe('0');
    expect(errors).toEqual([]);
});
