<script lang="ts">
	import { enhance } from '$app/forms';
	import WeekCard from '$lib/components/WeekCard.svelte';
	import { formatCents } from '$lib/money';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	// Paying out is irreversible (append-only ledger) — ask before we write it.
	let confirmingId = $state<number | null>(null);

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
					<p class="text-2xl font-bold text-emerald-700">{formatCents(person.balance, data.currency)}</p>
					<p class="text-xs text-slate-400">
						{formatCents(person.periodEarned, data.currency)} earned
						{person.periodSince ? `since payout on ${person.periodSince}` : 'all time'}
						· <a href="/earnings/export?person={person.id}" class="underline hover:text-slate-600">
							export CSV
						</a>
					</p>
				</div>
				{#if data.isAdult && person.balance > 0}
					<form
						method="POST"
						action="?/payout"
						use:enhance={submit(() => (confirmingId = null))}
						class="flex items-center gap-2 {confirmingId === person.id
							? 'rounded-xl bg-emerald-50 p-2'
							: ''}"
					>
						<input type="hidden" name="kidId" value={person.id} />
						{#if confirmingId === person.id}
							<span class="text-xs font-medium text-emerald-900">
								Hand over {formatCents(person.balance, data.currency)}?
							</span>
							<button class="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
								Yes, paid ✓
							</button>
							<button
								type="button"
								class="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
								onclick={() => (confirmingId = null)}
							>
								Cancel
							</button>
						{:else}
							<!-- With JS the first click only arms the confirm; without JS it submits. -->
							<button
								class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
								onclick={(e) => {
									e.preventDefault();
									confirmingId = person.id;
								}}
							>
								Pay out {formatCents(person.balance, data.currency)}
							</button>
						{/if}
					</form>
				{/if}
			</div>

			{#if data.isAdult}
				<details class="mt-3">
					<summary class="inline-flex cursor-pointer items-center rounded-lg px-2 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">
						± Bonus / penalty
					</summary>
					<form
						method="POST"
						action="?/adjust"
						use:enhance={submit()}
						class="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3"
					>
						<input type="hidden" name="kidId" value={person.id} />
						<label class="block">
							<span class="mb-1 block text-xs font-medium text-slate-500">Type</span>
							<select name="type" class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
								<option value="bonus">Bonus (+)</option>
								<option value="penalty">Penalty (−)</option>
							</select>
						</label>
						<label class="block">
							<span class="mb-1 block text-xs font-medium text-slate-500">Amount ({data.currency})</span>
							<input
								name="amount"
								type="number"
								min="0.01"
								max="1000"
								step="0.01"
								required
								class="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
							/>
						</label>
						<label class="block flex-1">
							<span class="mb-1 block text-xs font-medium text-slate-500">Reason</span>
							<input
								name="note"
								maxlength="200"
								placeholder="e.g. Helped wash the car"
								class="w-full min-w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
							/>
						</label>
						<button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
							Apply
						</button>
					</form>
				</details>
			{/if}

			{#if person.week}
				<div class="mt-4">
					<WeekCard week={person.week} currency={data.currency} settled={person.weekSettled} />
				</div>
				{#if data.canSettle && !person.weekSettled && person.week.totalCents > 0}
					<form method="POST" action="?/settle" use:enhance={submit()} class="mt-2">
						<input type="hidden" name="kidId" value={person.id} />
						<button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
							Close & pay this week
						</button>
						<span class="ml-2 text-xs text-slate-400">
							Otherwise it pays itself out automatically.
						</span>
					</form>
				{/if}
			{/if}

			{#if person.pastWeeks.length > 0}
				<h3 class="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
					Past weeks
				</h3>
				<ul class="divide-y divide-slate-100 text-sm">
					{#each person.pastWeeks as past (past.id)}
						<li class="flex items-center gap-2 py-2">
							<span class="flex-1 text-slate-700">
								Week of {past.weekStart}
								<span class="text-xs text-slate-400">
									· {past.daysWorked} of {past.fullWeekDays} days
								</span>
							</span>
							<span class="text-xs text-slate-400">
								{Math.round(past.earnedBasisPoints / 100)}%
							</span>
							<span class="font-semibold text-emerald-700">
								{formatCents(past.cents, data.currency)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

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
							{#if item.payoutCents === null}
								<!-- Its share of the week is only fixed once the week is paid. -->
								<span class="text-xs text-slate-400">this week</span>
							{:else}
								<span
									class="font-semibold {item.payoutCents === 0
										? 'text-slate-400'
										: 'text-emerald-700'}"
								>
									{formatCents(item.payoutCents, data.currency)}
								</span>
							{/if}
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
								{formatCents(entry.amountCents, data.currency)}
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
