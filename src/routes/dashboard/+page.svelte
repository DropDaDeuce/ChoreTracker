<script lang="ts">
	import { enhance } from '$app/forms';
	import Celebration, { type CelebrationData } from '$lib/components/Celebration.svelte';
	import NotificationSetup from '$lib/components/NotificationSetup.svelte';
	import { formatCents } from '$lib/money';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	let celebration = $state<CelebrationData | null>(null);

	// Which open chore is showing the "who takes it?" swap row.
	let swappingId = $state<number | null>(null);

	function celebrateDone(row: (typeof data.open)[number]) {
		if (row.chore.requiresVerification) {
			celebration = { emoji: '⏳', title: 'Sent for a thumbs-up!' };
			return;
		}
		const sub =
			row.payoutPreview > 0
				? `+${formatCents(row.payoutPreview, data.currency)}`
				: row.chore.points > 0
					? `+${row.chore.points} ⭐`
					: undefined;
		celebration = { title: 'Done — nice work!', sub };
	}

	const doneCount = $derived(data.awaiting.length + data.completedToday.length);
	const totalToday = $derived(doneCount + data.open.length);
</script>

<svelte:head>
	<title>Today — ChoreTracker</title>
</svelte:head>

<Celebration {celebration} ondone={() => (celebration = null)} />

<main class="mx-auto max-w-3xl space-y-8 p-4 pb-16">
	<div class="space-y-3 pt-4">
		<div class="flex flex-wrap items-end justify-between gap-2">
			<div>
				<h1 class="text-2xl font-bold text-slate-800">Today</h1>
				<p class="text-sm text-slate-500">{data.today}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<a
					href="/board"
					class="rounded-full bg-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600"
				>
					📺 Board
				</a>
				{#if data.streak >= 2}
					<span class="rounded-full bg-orange-100 px-4 py-1.5 text-sm font-semibold text-orange-700">
						🔥 {data.streak}-day streak
					</span>
				{/if}
				{#if data.balance > 0 || data.user?.role === 'kid'}
					<a
						href="/earnings"
						class="rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-semibold text-emerald-800"
					>
						💰 {formatCents(data.balance, data.currency)}
					</a>
				{/if}
				{#if data.verifyQueueCount > 0}
					<a
						href="/verify"
						class="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-semibold text-amber-800"
					>
						{data.verifyQueueCount} to verify
					</a>
				{/if}
			</div>
		</div>

		{#if totalToday > 0}
			<div>
				<div class="flex items-center justify-between text-xs font-medium text-slate-500">
					<span>
						{#if doneCount === totalToday}
							All {totalToday} done — amazing! 🎉
						{:else}
							{doneCount} of {totalToday} done
						{/if}
					</span>
				</div>
				<div class="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200">
					<div
						class="h-full rounded-full bg-emerald-500 transition-all duration-500"
						style="width: {totalToday === 0 ? 0 : Math.round((doneCount / totalToday) * 100)}%"
					></div>
				</div>
			</div>
		{/if}
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	{#if data.awayToday}
		<p class="rounded-2xl bg-sky-50 p-4 text-sm font-medium text-sky-800">
			✈️ You're marked as away today — no chores are assigned to you.
		</p>
	{/if}

	<section>
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">My chores</h2>
		{#if data.open.length === 0}
			<p class="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
				All done — nothing due right now! 🎉
			</p>
		{:else}
			<ul class="space-y-3">
				{#each data.open as row (row.instance.id)}
					{@const { instance, chore, room, payoutPreview } = row}
					<li class="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
						<div class="min-w-40 flex-1">
							<p class="font-semibold text-slate-800">
								{#if chore.icon}<span class="mr-1">{chore.icon}</span>{/if}{chore.title}
							</p>
							<p class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
								{#if room}
									<span class="font-medium text-slate-400">{room.icon} {room.name}</span>
								{/if}
								{#if instance.dueDate < data.today}
									<span class="font-semibold text-red-600">Overdue — was due {instance.dueDate}</span>
								{:else}
									<span>Due today</span>
								{/if}
								{#if chore.allowanceCents > 0}
									{#if payoutPreview < chore.allowanceCents}
										<span class="font-semibold text-amber-600">
											💰 now pays {formatCents(payoutPreview, data.currency)}
											<s class="text-slate-400">{formatCents(chore.allowanceCents, data.currency)}</s>
										</span>
									{:else}
										<span>💰 {formatCents(chore.allowanceCents, data.currency)}</span>
									{/if}
								{/if}
								{#if chore.points > 0}<span>⭐ {chore.points}</span>{/if}
								{#if instance.reminderCount > 0}
									<span class="font-semibold text-amber-600">
										🔔 {instance.reminderCount} reminder{instance.reminderCount > 1 ? 's' : ''}
									</span>
								{/if}
							</p>
							{#if instance.note && instance.verifiedBy}
								<p class="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
									↩ Sent back: {instance.note}
								</p>
							{/if}
						</div>
						<form
							method="POST"
							action="?/markDone"
							enctype="multipart/form-data"
							use:enhance={submit(() => celebrateDone(row))}
							class="flex flex-col items-end gap-2"
						>
							<input type="hidden" name="instanceId" value={instance.id} />
							{#if chore.requiresPhoto}
								<label class="text-right">
									<span class="mb-1 block text-[11px] font-medium text-slate-500">📷 photo proof</span>
									<input
										type="file"
										name="photo"
										accept="image/*"
										capture="environment"
										required
										class="w-36 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-200 file:px-2 file:py-1.5 file:text-xs file:font-semibold"
									/>
								</label>
							{/if}
							<button
								class="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow active:bg-emerald-700"
							>
								Done ✓
							</button>
							{#if data.swapPeople.length > 0 && !data.swaps.outgoing.some((s) => s.swap.instanceId === instance.id)}
								<button
									type="button"
									class="rounded-xl bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 active:bg-violet-100"
									onclick={() => (swappingId = swappingId === instance.id ? null : instance.id)}
								>
									↔ Swap
								</button>
							{/if}
						</form>
						{#if swappingId === instance.id}
							<div class="flex w-full flex-wrap items-center gap-2 rounded-xl bg-violet-50 p-3">
								<span class="text-sm font-medium text-violet-900">Who takes it?</span>
								{#each data.swapPeople as person (person.id)}
									<form method="POST" action="?/requestSwap" use:enhance={submit(() => (swappingId = null))}>
										<input type="hidden" name="instanceId" value={instance.id} />
										<input type="hidden" name="toUserId" value={person.id} />
										<button class="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white active:bg-violet-700">
											{person.name}
										</button>
									</form>
								{/each}
								<button
									type="button"
									class="px-2 py-2 text-sm font-medium text-slate-500"
									onclick={() => (swappingId = null)}
								>
									Cancel
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.swaps.incoming.length > 0}
		<section>
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
				Swap requests for you
			</h2>
			<ul class="space-y-3">
				{#each data.swaps.incoming as { swap, choreTitle, dueDate, fromName } (swap.id)}
					<li class="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-violet-200 bg-white p-4 shadow-sm">
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-slate-800">🔁 {fromName} asks: can you take this?</p>
							<p class="text-sm text-slate-500">{choreTitle} — due {dueDate}</p>
						</div>
						<form method="POST" action="?/acceptSwap" use:enhance={submit()}>
							<input type="hidden" name="swapId" value={swap.id} />
							<button class="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white">
								I'll take it
							</button>
						</form>
						<form method="POST" action="?/declineSwap" use:enhance={submit()}>
							<input type="hidden" name="swapId" value={swap.id} />
							<button class="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-600">
								Can't
							</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.awaiting.length > 0}
		<section>
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
				Waiting for a thumbs-up
			</h2>
			<ul class="space-y-2">
				{#each data.awaiting as { instance, chore } (instance.id)}
					<li class="flex items-center gap-3 rounded-xl bg-white/70 p-3 text-sm shadow-sm">
						<span class="text-amber-500">⏳</span>
						<span class="flex-1 text-slate-700">{chore.title} ({instance.dueDate})</span>
						<span class="text-xs text-slate-400">awaiting verification</span>
						<form method="POST" action="?/undo" use:enhance={submit()}>
							<input type="hidden" name="instanceId" value={instance.id} />
							<button class="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-600 active:bg-slate-200">Undo</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.completedToday.length > 0}
		<section>
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
				Completed today
			</h2>
			<ul class="space-y-2">
				{#each data.completedToday as { instance, chore, canUndo } (instance.id)}
					<li class="flex items-center gap-3 rounded-xl bg-white/70 p-3 text-sm shadow-sm">
						<span class="text-emerald-500">✅</span>
						<span class="flex-1 text-slate-700">{chore.title}</span>
						{#if (instance.payoutCents ?? 0) > 0}
							<span class="text-xs font-semibold text-emerald-700">
								+{formatCents(instance.payoutCents ?? 0, data.currency)}
							</span>
						{/if}
						{#if canUndo}
							<form method="POST" action="?/undo" use:enhance={submit()}>
								<input type="hidden" name="instanceId" value={instance.id} />
								<button class="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-600 active:bg-slate-200">Undo</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.swaps.outgoing.length > 0}
		<section>
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
				Your swap requests
			</h2>
			<ul class="space-y-2">
				{#each data.swaps.outgoing as { swap, choreTitle, dueDate, toName } (swap.id)}
					<li class="flex items-center gap-3 rounded-xl bg-white/70 p-3 text-sm shadow-sm">
						<span>🔁</span>
						<span class="flex-1 text-slate-700">
							Asked {toName} to take {choreTitle} ({dueDate})
						</span>
						<form method="POST" action="?/cancelSwap" use:enhance={submit()}>
							<input type="hidden" name="swapId" value={swap.id} />
							<button class="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-600 active:bg-slate-200">Cancel</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.missed.length > 0}
		<section>
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
				Missed recently
			</h2>
			<ul class="space-y-2">
				{#each data.missed as { instance, chore } (instance.id)}
					<li class="flex items-center gap-3 rounded-xl bg-red-50/70 p-3 text-sm">
						<span>😿</span>
						<span class="flex-1 text-slate-600">{chore.title}</span>
						<span class="text-xs text-red-400">missed {instance.dueDate}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.upcoming.length > 0}
		<section>
			<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">Coming up</h2>
			<ul class="space-y-2">
				{#each data.upcoming as { instance, chore } (instance.id)}
					<li class="flex items-center gap-3 rounded-xl bg-white/70 p-3 text-sm shadow-sm">
						<span class="w-24 shrink-0 text-xs font-medium text-slate-400">{instance.dueDate}</span>
						<span class="flex-1 text-slate-700">{chore.title}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<NotificationSetup vapidPublicKey={data.vapidPublicKey} />
</main>
