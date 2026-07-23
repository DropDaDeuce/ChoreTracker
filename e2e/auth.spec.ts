import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('kid logs in through the PIN pad and lands on Today', async ({ page }) => {
	await login(page, 'Sam', '1111');
	await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'My chores' })).toBeVisible();
});

test('wrong PIN is rejected and stays on the picker', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sam' }).click();
	for (const digit of '9999') {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.getByRole('button', { name: "Let's go" }).click();
	await expect(page.locator('p.text-red-600')).toBeVisible();
	await expect(page).toHaveURL('/');
});
