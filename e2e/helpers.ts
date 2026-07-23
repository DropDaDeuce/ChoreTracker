import type { Page } from '@playwright/test';

/** Log in through the real profile picker + PIN pad (digit taps, not fills). */
export async function login(page: Page, name: string, pin: string) {
	await page.goto('/');
	await page.getByRole('button', { name }).click();
	for (const digit of pin) {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.getByRole('button', { name: "Let's go" }).click();
	await page.waitForURL('**/dashboard');
}

/** YYYY-MM for the month after the current one (always fully un-materialized). */
export function nextMonthParam(): string {
	const now = new Date();
	const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
	return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}
