<script lang="ts">
	/**
	 * A point goal's progress. Goals are pure carrot: raw points, a promised
	 * reward in words, and a bar that fills. No money appears here by design.
	 */
	interface Goal {
		id: number;
		scope: 'user' | 'family';
		personName: string | null;
		period: 'daily' | 'weekly';
		targetPoints: number;
		rewardNote: string;
		points: number;
		percent: number;
		met: boolean;
	}

	let { goal, compact = false }: { goal: Goal; compact?: boolean } = $props();

	const label = $derived(
		goal.scope === 'family'
			? `Family ${goal.period} goal`
			: `${goal.personName ? goal.personName + "'s" : 'Your'} ${goal.period} goal`
	);
</script>

<div class="rounded-xl {goal.met ? 'bg-amber-50' : 'bg-slate-50'} {compact ? 'p-3' : 'p-4'}">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3">
		<p class="text-sm font-semibold {goal.met ? 'text-amber-900' : 'text-slate-700'}">
			{goal.met ? '🏆' : goal.scope === 'family' ? '👨‍👩‍👧' : '🎯'}
			{label}
		</p>
		<p class="text-sm font-bold {goal.met ? 'text-amber-700' : 'text-slate-600'}">
			{goal.points} / {goal.targetPoints} ⭐
		</p>
	</div>

	<div class="mt-2 h-2.5 overflow-hidden rounded-full bg-white">
		<div
			class="h-full rounded-full transition-all duration-500 {goal.met
				? 'bg-amber-400'
				: 'bg-slate-400'}"
			style="width: {goal.percent}%"
		></div>
	</div>

	{#if goal.rewardNote}
		<p class="mt-2 text-xs {goal.met ? 'font-semibold text-amber-800' : 'text-slate-500'}">
			{goal.met ? 'Earned:' : 'Reward:'}
			{goal.rewardNote}
		</p>
	{:else if goal.met}
		<p class="mt-2 text-xs font-semibold text-amber-800">Goal smashed!</p>
	{/if}
</div>
