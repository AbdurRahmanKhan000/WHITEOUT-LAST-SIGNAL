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
    // Combat: firing straight ahead at target-1. Fire with down/up, not
    // mouse.click: in pointer lock a click's mouse move would rotate the
    // aim, and the rifle's random spread means one shot at the board's
    // edge is not guaranteed to hit — so fire until a hit is logged.
    await expect(page.locator('#hud-weapon-text')).toContainText('Assault Rifle · 30 / 120');
    let hit = false;
    for (let attempt = 0; attempt < 10 && !hit; attempt += 1) {
        await page.mouse.down();
        await page.mouse.up();
        await page.waitForTimeout(300);
        hit = (await page.locator('#hud-event-log').innerText()).includes('Hit target-1 for 25');
    }
    expect(hit).toBe(true);
    await expect(page.locator('#hud-weapon-text')).toContainText(/Assault Rifle · [12][0-9] \/ 120/);
    // Keyboard, not a mouse click: pointer lock keeps the mouse on the
    // canvas, so HUD buttons cannot be reached while playing.
    await page.keyboard.press('KeyH');
    await expect(page.locator('#hud-health-text')).toContainText('Health 90 / 100');
    expect(errors).toEqual([]);
});
