import { expect, test } from '@playwright/test';

test('test arena opens with a debug HUD and no console errors', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Test Arena (Build 1)' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    await expect(page.locator('#hud-health-text')).toContainText('Health 100 / 100');
    await expect(page.locator('#hud-debug-text')).toContainText('greybox placeholder');
    // Movement: holding W must move the player forward (z falls from 6.0).
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    await expect(page.locator('#hud-debug-text')).not.toContainText('z 6.0');
    // Combat: a mouse click fires the rifle straight ahead at target-1.
    await expect(page.locator('#hud-weapon-text')).toContainText('Assault Rifle · 30 / 120');
    await page.mouse.click(640, 360);
    await expect(page.locator('#hud-weapon-text')).toContainText('Assault Rifle · 29 / 120');
    await expect(page.locator('#hud-event-log')).toContainText('Hit target-1 for 25');
    // Keyboard, not a mouse click: pointer lock keeps the mouse on the
    // canvas, so HUD buttons cannot be reached while playing.
    await page.keyboard.press('KeyH');
    await expect(page.locator('#hud-health-text')).toContainText('Health 90 / 100');
    expect(errors).toEqual([]);
});
