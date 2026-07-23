import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('add a preset room, then stock it from the chore library', async ({ page }) => {
	await login(page, 'Alex', '1234');
	await page.goto('/admin/chores');

	// Garage is not in the demo seed, so this exercises a genuinely new room.
	await page.getByRole('button', { name: '+ Add room' }).click();
	await page.getByRole('button', { name: 'Garage' }).click();
	const garage = page.locator('section', { hasText: 'Garage' }).first();
	await expect(garage.getByText('Nothing here yet')).toBeVisible();

	await garage.getByRole('link', { name: '+ Add chore' }).click();
	await expect(page.getByRole('heading', { name: /Add chores/ })).toBeVisible();

	await page.getByRole('checkbox', { name: /Sweep the garage/ }).check();
	await page.getByRole('button', { name: /Add 1 chore/ }).click();

	await page.waitForURL('**/admin/chores');
	const stocked = page.locator('section', { hasText: 'Garage' }).first();
	await expect(stocked.getByText('Sweep the garage')).toBeVisible();
	await expect(stocked.getByText('unassigned').first()).toBeVisible();
});
