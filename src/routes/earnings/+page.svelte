<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCents } from '$lib/money';

	let { data, form } = $props();

	const typeLabels: Record<string, string> = {
		earning: 'Earned',
		bonus: 'Bonus',
		penalty: 'Penalty',
		payout: 'Paid out'
	};
</script>

<svelte:head>
	<title>Earnings — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-8 p-4 pb-16">
	<div class="pt-4">
		<h1 class="text-2xl font-bold text-slate-800">Earnings</h1>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	{#if data.people.length === 0}
		<p class="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
			No kids yet — add them under People.
		</p>
	{/if}

	{#each data.people as person (person.id)}
		<section class="rounded-2xl bg-white p-5 shadow-sm">
			<div class="flex flex-wrap items-center gap-3">
				<span
					class="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white"
					style="background: {person.avatarColor}"
				>
					{person.name.slice(0, 1).toUpperCase()}
				</span>
				<div class="flex-1">
					<h2 class="font-semibold text-slate-800">{person.name}</h2>
					<p class="text-2xl font-bold text-emerald-700">{formatCents(person.balance)}</p>
				</div>
				{#if data.isAdult && person.balance > 0}
					<form method="POST" action="?/payout" use:enhance>
						<input type="hidden" name="kidId" value={person.id} />
						<button class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
							Pay out {formatCents(person.balance)}
						</button>
					</form>
				{/if}
			</div>

			{#if person.recentChores.length > 0}
				<h3 class="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
					Recent chores
				</h3>
				<ul class="divide-y divide-slate-100 text-sm">
					{#each person.recentChores as item}
						<li class="flex items-center gap-2 py-2">
							<span class="flex-1 text-slate-700">{item.title} ({item.dueDate})</span>
							{#if item.reminderCount > 0}
								<span class="text-xs text-amber-600">🔔 {item.reminderCount}</span>
							{/if}
							<span
								class="font-semibold {item.payoutCents === 0 ? 'text-slate-400' : 'text-emerald-700'}"
							>
								{formatCents(item.payoutCents ?? 0)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if person.ledger.length > 0}
				<h3 class="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
					History
				</h3>
				<ul class="divide-y divide-slate-100 text-sm">
					{#each person.ledger as entry (entry.id)}
						<li class="flex items-center gap-2 py-2">
							<div class="min-w-0 flex-1">
								<span class="text-slate-700">{typeLabels[entry.type] ?? entry.type}</span>
								{#if entry.note}<span class="ml-1 text-xs text-slate-400">— {entry.note}</span>{/if}
							</div>
							<span class="font-semibold {entry.amountCents < 0 ? 'text-slate-500' : 'text-emerald-700'}">
								{formatCents(entry.amountCents)}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-4 text-sm text-slate-400">Nothing earned yet — go do some chores!</p>
			{/if}
		</section>
	{/each}
</main>
