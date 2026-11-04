import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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

async function seed(page: Page, unlockedLevel: number): Promise<void> {
    await page.addInitScript((save) => {
        window.localStorage.setItem('whiteout-last-signal-save-v1', save);
    }, SEEDED_SAVE(unlockedLevel));
}

test('build 7: Level 21 is unlockable after 20, 22 stays locked, no level is "Coming in"', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    await seed(page, 21);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await expect(page.locator('#campaign-list')).toBeVisible();
    await expect(
        page.locator('.level-card', { hasText: '21. Dead District' }).getByRole('button', { name: 'Play' })
    ).toBeEnabled();
    await expect(page.locator('.level-card', { hasText: '22. Rooftop Corridor' })).toContainText(
        'Locked — complete level 21 first'
    );
    await expect(page.locator('#campaign-list')).not.toContainText('Coming in');
    expect(errors).toEqual([]);
});

test('build 7: frontier 31 shows the campaign-complete banner and Level 30 playable', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    // A seeded frontier of 31 is exactly what completing Level 30
    // saves; reloading with it must still show campaign complete,
    // not reset the campaign.
    await seed(page, 31);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await expect(page.locator('.campaign-complete-banner')).toContainText('Campaign complete');
    await expect(
        page.locator('.level-card', { hasText: '30. Last Signal' }).getByRole('button', { name: 'Play' })
    ).toBeEnabled();
    await expect(page.locator('#campaign-list')).not.toContainText('Coming in');
    expect(errors).toEqual([]);
});

test('build 7: Level 30 briefing and deploy start the final mission', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });
    await seed(page, 30);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page.locator('.level-card', { hasText: '30. Last Signal' }).getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('#briefing-title')).toContainText('Last Signal');
    await expect(page.locator('#briefing-objectives')).toContainText('final commander');
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    await expect(page.locator('#hud-objective-text')).toContainText('final guard');
    expect(errors).toEqual([]);
});

test('build 7: Level 23 defend phase appears after terminal activation', async ({ page }) => {
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
    await seed(page, 23);
    await page.goto('/');
    await page.getByRole('button', { name: 'Campaign' }).click();
    await page
        .locator('.level-card', { hasText: '23. Transit Lockdown' })
        .getByRole('button', { name: 'Play' })
        .click();
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.locator('#arena-hud')).toBeVisible();
    // Level 23 spawns inside the terminal zone, like Level 13's
    // generator: standing still dwells 3 s of game time, which is
    // slow wall-clock time on this VM's software rendering. The
    // defend hold label is the phase-change signal.
    await expect
        .poll(async () => page.locator('#hud-objective-text').innerText(), { timeout: 180_000 })
        .toContain('Defend the terminal');
    expect(errors).toEqual([]);
});
