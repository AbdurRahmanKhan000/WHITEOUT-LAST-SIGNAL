import { expect, test } from '@playwright/test';

const SEEDED_SAVE = (unlockedLevel: number): string =>
    JSON.stringify({
        schemaVersion: 1,
        unlockedLevel,
        bestResults: {},
        settings: {
            audio: { master: 0.8, music: 0.6, sfx: 0.8, muted: false },
            sensitivity: 1,
            quality: 'medium'
        }
    });

test('build 6: Level 11 is unlockable after 10, 12 stays locked, 21 stays locked (playable since Build 7)', async ({
    page
}) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    // Seed a save whose frontier is Level 11 (as if Level 10 was just
    // completed) instead of playing through Level 10 in this test —
    // a full combat completion is a multi-minute run on this VM.
    await page.addInitScript((save) => {
        window.localStorage.setItem('whiteout-last-signal-save-v1', save);
    }, SEEDED_SAVE(11));
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await expect(page.locator('#campaign-list')).toBeVisible();
    await expect(
        page.locator('.level-card', { hasText: '11. Frozen Entry' }).getByRole('button', { name: 'Play' })
    ).toBeEnabled();
    await expect(page.locator('.level-card', { hasText: '12. Whiteout Patrol' })).toContainText(
        'Locked — complete level 11 first'
    );
    await expect(page.locator('.level-card', { hasText: '21. Dead District' })).toContainText(
        'Locked — complete level 11 first'
    );
    expect(errors).toEqual([]);
});

test('build 6: Level 20 is unlockable at the frontier, 21 still locked', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    await page.addInitScript((save) => {
        window.localStorage.setItem('whiteout-last-signal-save-v1', save);
    }, SEEDED_SAVE(20));
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await expect(
        page.locator('.level-card', { hasText: '20. Underground Exit' }).getByRole('button', { name: 'Play' })
    ).toBeEnabled();
    await expect(page.locator('.level-card', { hasText: '21. Dead District' })).toContainText(
        'Locked — complete level 20 first'
    );
    expect(errors).toEqual([]);
});

test('build 6: Level 11 briefing and deploy start the mission', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    await page.addInitScript((save) => {
        window.localStorage.setItem('whiteout-last-signal-save-v1', save);
    }, SEEDED_SAVE(11));
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page.locator('.level-card', { hasText: '11. Frozen Entry' }).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('#briefing-title')).toContainText('Frozen Entry');
    await expect(page.locator('#briefing-objectives')).toContainText('entry checkpoint');
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    await expect(page.locator('#hud-objective-text')).toContainText('entry checkpoint');
    expect(errors).toEqual([]);
});

test('build 6: Level 13 defend phase appears after generator activation', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    test.setTimeout(300_000);
    await page.addInitScript((save) => {
        window.localStorage.setItem('whiteout-last-signal-save-v1', save);
    }, SEEDED_SAVE(13));
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page.locator('.level-card', { hasText: '13. Cold Storage' }).getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    // Level 13 spawns on the generator zone edge, so activation needs
    // no walking: standing still dwells 3 s of game time, which is
    // slow wall-clock time on this VM's software rendering. The
    // defend hold label is the phase-change signal.
    await expect
        .poll(async () => page.locator('#hud-objective-text').innerText(), { timeout: 180_000 })
        .toContain('Defend the generator room');
    expect(errors).toEqual([]);
});
