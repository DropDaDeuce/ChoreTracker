<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatCents } from '$lib/money';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Verify — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-8 p-4 pb-16">
	<div class="pt-4">
		<h1 class="text-2xl font-bold text-slate-800">Verify</h1>
		<p class="text-sm text-slate-500">
			Reminders reduce the payout: 1 reminder → −{data.penaltyPercent}%, 2+ → nothing.
		</p>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	<section>
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
			Waiting for verification
		</h2>
		{#if data.queue.length === 0}
			<p class="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
				Queue is empty — nice! ✨
			</p>
		{:else}
			<ul class="space-y-3">
				{#each data.queue as { instance, chore, assignee, payoutPreview } (instance.id)}
					<li class="rounded-2xl bg-white p-4 shadow-sm">
						<div class="flex items-start gap-3">
							<span
								class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
								style="background: {assignee.avatarColor}"
							>
								{assignee.name.slice(0, 1).toUpperCase()}
							</span>
							<div class="min-w-0 flex-1">
								<p class="font-semibold text-slate-800">{chore.title}</p>
								<p class="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
									<span>{assignee.name} · due {instance.dueDate}</span>
									{#if instance.reminderCount > 0}
										<span class="font-semibold text-amber-600">
											🔔 {instance.reminderCount} reminder{instance.reminderCount > 1 ? 's' : ''}
										</span>
									{/if}
									{#if chore.allowanceCents > 0}
										<span class="font-semibold {payoutPreview < chore.allowanceCents ? 'text-amber-600' : 'text-emerald-700'}">
											pays {formatCents(payoutPreview)}
											{#if payoutPreview < chore.allowanceCents}
												(of {formatCents(chore.allowanceCents)})
											{/if}
										</span>
									{/if}
								</p>
							</div>
						</div>
						<div class="mt-3 flex flex-wrap gap-2">
							<form method="POST" action="?/verify" use:enhance>
								<input type="hidden" name="instanceId" value={instance.id} />
								<button class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
									Verify ✓
								</button>
							</form>
							<form method="POST" action="?/reject" use:enhance>
								<input type="hidden" name="instanceId" value={instance.id} />
								<button class="rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700">
									Reject ↩
								</button>
							</form>
							<form method="POST" action="?/remind" use:enhance>
								<input type="hidden" name="instanceId" value={instance.id} />
								<button class="rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
									+1 reminder 🔔
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
			Still open today
		</h2>
		{#if data.stillOpen.length === 0}
			<p class="rounded-2xl bg-white/70 p-4 text-center text-sm text-slate-500">
				Nothing outstanding.
			</p>
		{:else}
			<ul class="space-y-2">
				{#each data.stillOpen as { instance, chore, assignee, payoutPreview } (instance.id)}
					<li class="flex items-center gap-3 rounded-xl bg-white/70 p-3 text-sm shadow-sm">
						<span
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
							style="background: {assignee.avatarColor}"
						>
							{assignee.name.slice(0, 1).toUpperCase()}
						</span>
						<div class="min-w-0 flex-1">
							<span class="text-slate-700">{chore.title}</span>
							<span class="ml-2 text-xs text-slate-400">
								{assignee.name} ·
								{instance.dueDate < data.today ? `overdue (${instance.dueDate})` : 'due today'}
								{#if instance.reminderCount > 0}
									· 🔔 {instance.reminderCount} → pays {formatCents(payoutPreview)}
								{/if}
							</span>
						</div>
						<form method="POST" action="?/remind" use:enhance>
							<input type="hidden" name="instanceId" value={instance.id} />
							<button class="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700">
								+1 🔔
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
