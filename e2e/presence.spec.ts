import { expect, test } from '@playwright/test';
import { login, nextMonthParam } from './helpers';

// REGRESSION (18d7916): the day buttons drive a shared hidden form, and a
// reactivity race made every click submit the PREVIOUS click's date. Only a
// real browser can catch this — the HTTP smoke posts dates directly.
test('clicking two different days toggles BOTH days, not the previous one', async ({ page }) => {
	await login(page, 'Alex', '1234');
	await page.goto(`/admin/users/2/presence?month=${nextMonthParam()}`);

	await page.getByRole('button', { name: '10 🏠' }).click();
	await expect(page.getByRole('button', { name: '10 ✈️' })).toBeVisible();

	await page.getByRole('button', { name: '11 🏠' }).click();
	await expect(page.getByRole('button', { name: '11 ✈️' })).toBeVisible();
	// The first day must STILL be away — the old bug re-toggled it instead.
	await expect(page.getByRole('button', { name: '10 ✈️' })).toBeVisible();
});

test('toggling a day twice leaves it home with no override pin', async ({ page }) => {
	await login(page, 'Alex', '1234');
	const month = nextMonthParam();
	await page.goto(`/admin/users/2/presence?month=${month}`);

	await page.getByRole('button', { name: '20 🏠' }).click();
	await expect(page.getByRole('button', { name: '20 ✈️' })).toBeVisible();
	await page.getByRole('button', { name: '20 ✈️' }).click();

	const day = page.getByRole('button', { name: '20 🏠' });
	await expect(day).toBeVisible();
	// Self-cleaning override: the title must not mark a lingering day override.
	await expect(day).not.toHaveAttribute('title', /day override/);
});

test('weekday chips + preset add a whole-week away pattern', async ({ page }) => {
	await login(page, 'Alex', '1234');
	await page.goto('/admin/users/3/presence');

	await page.getByRole('button', { name: 'Every day', exact: true }).click();
	await page.getByRole('button', { name: 'Add pattern' }).click();

	await expect(page.getByText('Away every day')).toBeVisible();
	// Clean up so other tests see Riley home.
	await page.getByRole('button', { name: 'Remove' }).click();
	await expect(page.getByText('Away every day')).not.toBeVisible();
});
