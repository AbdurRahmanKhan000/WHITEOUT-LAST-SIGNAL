import { expect, test } from '@playwright/test';

test('enemies patrol the arena and engage a player who walks toward them', async ({ page }) => {
    // The WebGL test environment can render as slowly as ~4 fps, so one
    // second of wall clock is far less than one second of game time
    // (game time is also capped by the 0.05 s delta clamp). Measured
    // here: detection to first hit is ~5 s of game time but ~27 s of
    // wall time, with run-to-run variance. The assertions below are
    // unchanged in strength — an enemy must reach Chase or Attack AND
    // land a hit — but the health timeout is 60 s to give that measured
    // timing a 2x margin. Do not shorten it without re-running this
    // spec three times in a row.
    test.setTimeout(180_000);
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
    // Wait for the first HUD update before pressing keys, exactly as the
    // arena spec does: it guarantees the arena is fully entered (and any
    // entry-click mouse movement has settled) before input starts.
    await expect(page.locator('#hud-debug-text')).toContainText('greybox placeholder');
    // All three enemies spawn in Patrol; the HUD text is the spawn proof.
    await expect(page.locator('#hud-enemy-text')).toContainText('Enemies 3', { timeout: 15_000 });
    await expect(page.locator('#hud-enemy-text')).toContainText('Patrol 3', { timeout: 15_000 });
    // Walk south from the spawn (0, 6) toward the enemy at (0, -14).
    // The enemy faces the arena centre, so the approaching player enters
    // its field of view well before the walk ends. The hold is 10 s of
    // wall clock, not 2.5 s: at ~4 fps here, 2.5 s of wall clock is only
    // ~0.4 s of game time, so the player barely moves and the first hit
    // then depends on the enemy's long way around the centre crate —
    // which varied run to run past a 60 s window. A 10 s hold walks the
    // player to within the enemy's attack range of the crate face, so
    // the first hit depends only on the short chase. The assertions
    // below are unchanged.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(10_000);
    await page.keyboard.up('KeyW');
    // Auto-waiting: the enemy must switch from Patrol to Chase or Attack,
    // and at least one enemy shot must land on the player.
    await expect(page.locator('#hud-enemy-text')).toContainText(/Chase|Attack/, { timeout: 30_000 });
    await expect(page.locator('#hud-health-text')).not.toContainText('Health 100 / 100', { timeout: 60_000 });
    expect(errors).toEqual([]);
});
