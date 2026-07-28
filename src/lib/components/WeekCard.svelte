<script lang="ts">
	import { formatCents } from '$lib/money';

	/**
	 * One person's allowance week: what's banked, what's still winnable, and
	 * what's already gone.
	 *
	 * PRIVACY: this only ever renders the viewer's own week. The "full week"
	 * figure is shown as a bare number of days — never attributed to whoever
	 * set it, and never alongside anyone else's ceiling.
	 */
	interface Week {
		weekStart: string;
		weekEnd: string;
		fullWeekDays: number;
		daysWorked: number;
		ceilingCents: number;
		earnedCents: number;
		pendingCents: number;
		lostCents: number;
		bonusCents: number;
		pendingBonusCents: number;
		totalCents: number;
	}

	let {
		week,
		currency = '$',
		settled = false
	}: { week: Week; currency?: string; settled?: boolean } = $props();

	const pct = (cents: number) =>
		week.ceilingCents > 0 ? Math.min(100, (cents / week.ceilingCents) * 100) : 0;

	const earnedPct = $derived(pct(week.earnedCents));
	const pendingPct = $derived(pct(week.pendingCents));
</script>

<section class="rounded-2xl bg-white p-5 shadow-sm">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="font-semibold text-slate-800">
			{settled ? 'Last week' : 'This week'}
		</h2>
		<span class="text-xs text-slate-400">{week.weekStart} → {week.weekEnd}</span>
	</div>

	{#if week.ceilingCents === 0 && week.bonusCents === 0}
		<p class="mt-2 text-sm text-slate-500">
			{#if week.daysWorked === 0}
				No chores this week — nothing to earn, nothing to miss.
			{:else}
				No allowance is set up yet.
			{/if}
		</p>
	{:else}
		<p class="mt-2">
			<span class="text-3xl font-bold text-emerald-700">
				{formatCents(week.totalCents, currency)}
			</span>
			<span class="text-sm text-slate-500">
				{settled ? 'earned' : 'so far'} of {formatCents(week.ceilingCents, currency)}
			</span>
		</p>

		<div class="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-200">
			<div
				class="h-full bg-emerald-500 transition-all duration-500"
				style="width: {earnedPct}%"
			></div>
			<div
				class="h-full bg-emerald-200 transition-all duration-500"
				style="width: {pendingPct}%"
			></div>
		</div>

		<dl class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
			<div>
				<dt class="inline text-slate-500">Banked</dt>
				<dd class="inline font-semibold text-emerald-700">
					{formatCents(week.earnedCents, currency)}
				</dd>
			</div>
			{#if week.pendingCents > 0}
				<div>
					<dt class="inline text-slate-500">Still on the table</dt>
					<dd class="inline font-semibold text-slate-700">
						{formatCents(week.pendingCents, currency)}
					</dd>
				</div>
			{/if}
			{#if week.lostCents > 0}
				<div>
					<dt class="inline text-slate-500">Missed</dt>
					<dd class="inline font-semibold text-red-600">
						{formatCents(week.lostCents, currency)}
					</dd>
				</div>
			{/if}
			{#if week.bonusCents > 0}
				<div>
					<dt class="inline text-slate-500">Bonus 🎁</dt>
					<dd class="inline font-semibold text-violet-700">
						+{formatCents(week.bonusCents, currency)}
					</dd>
				</div>
			{/if}
		</dl>

		<p class="mt-3 text-xs text-slate-400">
			{week.daysWorked} of {week.fullWeekDays} chore days this week.
			{#if week.daysWorked < week.fullWeekDays}
				Days you weren't here don't count against you — they just aren't part of the pot.
			{/if}
			{#if !settled && week.pendingBonusCents > 0}
				Bonus work waiting to be checked: +{formatCents(week.pendingBonusCents, currency)}.
			{/if}
		</p>
	{/if}
</section>
