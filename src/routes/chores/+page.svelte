<script lang="ts">
	import { describeRecurrence } from '$lib/choreText';
	import { formatCents } from '$lib/money';

	let { data } = $props();

	const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
	const LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

	let tab = $state<(typeof FREQUENCIES)[number]>('daily');

	const counts = $derived(
		Object.fromEntries(
			FREQUENCIES.map((f) => [f, data.myChores.filter((c) => c.frequency === f).length])
		)
	);
	const visible = $derived(data.myChores.filter((c) => c.frequency === tab));
</script>

<svelte:head>
	<title>My chores — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4 pb-16">
	<h1 class="pt-4 text-2xl font-bold text-slate-800">My chores</h1>

	<div class="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm">
		{#each FREQUENCIES as f}
			<button
				type="button"
				class="flex-1 rounded-full px-3 py-2 text-sm font-medium {tab === f
					? 'bg-slate-800 text-white'
					: 'text-slate-600 hover:bg-slate-100'}"
				onclick={() => (tab = f)}
			>
				{LABELS[f]}
				{#if counts[f] > 0}<span class="ml-1 text-xs opacity-70">({counts[f]})</span>{/if}
			</button>
		{/each}
	</div>

	{#if visible.length === 0}
		<p class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
			No {LABELS[tab].toLowerCase()} chores for you. 🎈
		</p>
	{:else}
		<ul class="space-y-3">
			{#each visible as chore (chore.id)}
				<li class="rounded-2xl bg-white p-4 shadow-sm">
					<p class="font-semibold text-slate-800">
						{#if chore.icon}<span class="mr-1">{chore.icon}</span>{/if}{chore.title}
					</p>
					{#if chore.description}
						<p class="mt-0.5 text-sm text-slate-500">{chore.description}</p>
					{/if}
					<p class="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
						{#if chore.roomLabel}<span class="font-medium text-slate-400">{chore.roomLabel}</span>{/if}
						<span>{describeRecurrence(chore)}</span>
						{#if chore.points > 0}<span>⭐ {chore.points}</span>{/if}
						{#if chore.isBonus}
							<span class="font-semibold text-violet-600">🎁 bonus</span>
						{/if}
					</p>
					{#if chore.nextDueDate}
						<p class="mt-2 text-sm">
							{#if chore.assignmentType === 'rotating' && !chore.nextIsMine}
								<span class="text-slate-500">
									Next turn: <span class="font-medium">{chore.nextAssigneeName}</span> on {chore.nextDueDate}
								</span>
							{:else}
								<span class="font-medium text-emerald-700">Your next one: {chore.nextDueDate}</span>
							{/if}
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
