/** Format cents as a currency string, e.g. 1250 -> "$12.50". */
export function formatCents(cents: number, symbol = '$'): string {
	const sign = cents < 0 ? '-' : '';
	const abs = Math.abs(cents);
	return `${sign}${symbol}${(abs / 100).toFixed(2)}`;
}
