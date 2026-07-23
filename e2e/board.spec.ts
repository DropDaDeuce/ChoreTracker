import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('kiosk: tap a face, enter their PIN, land in their dashboard', async ({ page }) => {
	await login(page, 'Alex', '1234');
	await page.goto('/board');

	await expect(page.getByRole('heading', { name: /Family board/ })).toBeVisible();
	// Kiosk mode: no app chrome around the board.
	await expect(page.getByRole('link', { name: 'Today', exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: /Sam/ }).click();
	await expect(page.getByText('Hi Sam — enter your PIN')).toBeVisible();
	for (const digit of '1111') {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.getByRole('button', { name: "Let's go" }).click();

	await page.waitForURL('**/dashboard');
	// The session is genuinely Sam's now: kids only see their own earnings.
	await page.goto('/earnings');
	await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Riley' })).toHaveCount(0);
});

test('exiting the board requires the opener to re-enter their PIN', async ({ page }) => {
	await login(page, 'Alex', '1234');
	await page.goto('/board');

	await page.getByRole('button', { name: 'exit board' }).click();
	await expect(page.getByText('Hi Alex — enter your PIN')).toBeVisible();
	for (const digit of '1234') {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.getByRole('button', { name: "Let's go" }).click();
	await page.waitForURL('**/dashboard');
});

test('locked board bounces URL escapes back to the board', async ({ page }) => {
	await login(page, 'Alex', '1234');
	await page.goto('/board');

	await page.getByRole('button', { name: '🔒 Lock' }).click();
	await expect(page.getByText(/locked — tap a face/)).toBeVisible();

	// The kid-types-a-URL attack: straight back to the board.
	await page.goto('/dashboard');
	await page.waitForURL('**/board');
	await expect(page.getByRole('heading', { name: /Family board/ })).toBeVisible();

	// PIN is the only way out.
	await page.getByRole('button', { name: /Alex/ }).click();
	for (const digit of '1234') {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.getByRole('button', { name: "Let's go" }).click();
	await page.waitForURL('**/dashboard');
});
