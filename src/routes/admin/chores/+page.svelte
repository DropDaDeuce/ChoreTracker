<script lang="ts">
	import { describeRecurrence } from '$lib/choreText';
	import { formatCents } from '$lib/money';

	let { data } = $props();
</script>

<svelte:head>
	<title>Chores — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4 pb-16">
	<div class="flex items-center justify-between pt-4">
		<h1 class="text-2xl font-bold text-slate-800">Chores</h1>
		<a href="/admin/chores/new" class="rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-white shadow">
			+ New chore
		</a>
	</div>

	{#if data.chores.length === 0}
		<p class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
			No chores yet — create the first one!
		</p>
	{:else}
		<ul class="space-y-3">
			{#each data.chores as chore (chore.id)}
				<li>
					<a
						href="/admin/chores/{chore.id}"
						class="block rounded-2xl bg-white p-4 shadow-sm transition hover:shadow {chore.isActive
							? ''
							: 'opacity-50'}"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-semibold text-slate-800">{chore.title}</span>
							{#if !chore.isActive}
								<span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
									paused
								</span>
							{/if}
						</div>
						<p class="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
							<span>{describeRecurrence(chore)}</span>
							<span>👤 {chore.assigneeNames.join(' → ') || 'unassigned'}</span>
							{#if chore.allowanceCents > 0}<span>💰 {formatCents(chore.allowanceCents)}</span>{/if}
							{#if chore.points > 0}<span>⭐ {chore.points}</span>{/if}
							{#if !chore.requiresVerification}<span>auto-approves</span>{/if}
						</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
