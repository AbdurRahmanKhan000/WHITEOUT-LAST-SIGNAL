import { expect, test } from '@playwright/test';

test('boot shows the main menu shell with no console errors', async ({ page }) => {
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
    await expect(page.getByRole('heading', { name: /WHITEOUT/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Campaign' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await expect(page.getByRole('heading', { name: /WHITEOUT/ })).toBeVisible();
    expect(errors).toEqual([]);
});
