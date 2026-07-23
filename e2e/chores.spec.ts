import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('mark done celebrates, moves to awaiting, and undo brings it back', async ({ page }) => {
	await login(page, 'Sam', '1111');

	const card = page.locator('li', { hasText: 'Empty the dishwasher' }).first();
	await card.getByRole('button', { name: 'Done ✓' }).click();

	await expect(page.getByText('Sent for a thumbs-up!')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Waiting for a thumbs-up' })).toBeVisible();

	await page.getByRole('button', { name: 'Undo' }).first().click();
	await expect(page.getByRole('heading', { name: 'Waiting for a thumbs-up' })).not.toBeVisible();
	await expect(
		page.locator('li', { hasText: 'Empty the dishwasher' }).getByRole('button', { name: 'Done ✓' })
	).toBeVisible();
});
