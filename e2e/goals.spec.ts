import { expect, test } from '@playwright/test';
import { login } from './helpers';

/**
 * The goal celebration is client-driven: an effect notices a goal has been
 * crossed and posts `?/claimGoals`, which records it and hands back what to
 * celebrate. The HTTP smoke can't see any of that — it never runs the effect.
 */
test('crossing a goal celebrates once, and not again on reload', async ({ page }) => {
	// A one-star daily goal so a single verified chore trips it.
	await login(page, 'Alex', '1234');
	await page.goto('/admin/goals');
	// The radio itself is sr-only behind a styled label — click what a person clicks.
	await page.locator('label', { hasText: 'One person' }).click();
	await page.selectOption('select[name="userId"]', { label: 'Sam' });
	await page.selectOption('select[name="period"]', 'daily');
	await page.getByLabel('Target ⭐').fill('1');
	await page.getByLabel('Reward (optional)').fill('Choose dessert');
	await page.getByRole('button', { name: 'Add goal' }).click();
	await expect(page.getByText('Choose dessert')).toBeVisible();

	// Sam finishes a chore; the adult approves it, which awards the points.
	await page.context().clearCookies();
	await login(page, 'Sam', '1111');
	await page
		.locator('li', { hasText: 'Empty the dishwasher' })
		.first()
		.getByRole('button', { name: 'Done ✓' })
		.click();
	await expect(page.getByRole('heading', { name: 'Waiting for a thumbs-up' })).toBeVisible();

	await page.context().clearCookies();
	await login(page, 'Alex', '1234');
	await page.goto('/verify');
	await page.getByRole('button', { name: 'Verify ✓' }).first().click();

	// Back on Sam's dashboard the goal is met, so the celebration fires.
	await page.context().clearCookies();
	await login(page, 'Sam', '1111');
	await expect(page.getByText('Goal smashed!')).toBeVisible();
	await expect(page.getByText('Choose dessert').first()).toBeVisible();

	// Reloading must NOT celebrate again — the achievement is already claimed.
	await page.reload();
	await expect(page.getByText('Goal smashed!')).not.toBeVisible();
	// …but the goal card itself stays, showing it as won.
	await expect(page.getByText('🏆').first()).toBeVisible();
});
