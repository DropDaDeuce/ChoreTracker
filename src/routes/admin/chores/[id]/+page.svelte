<script lang="ts">
	import { enhance } from '$app/forms';
	import ChoreForm from '$lib/components/ChoreForm.svelte';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	let confirmingDelete = $state(false);

	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) => i).filter((i) => data.chore.weekdayMask & (1 << i))
	);
</script>

<svelte:head>
	<title>{data.chore.title} — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<div class="flex items-end justify-between pt-4">
		<div>
			<a href="/admin/chores" class="text-sm text-slate-500 hover:text-slate-800">← All chores</a>
			<h1 class="mt-1 text-2xl font-bold text-slate-800">{data.chore.title}</h1>
		</div>
		<form method="POST" action="?/toggleActive" use:enhance={submit()}>
			<button
				class="rounded-xl px-4 py-2 text-sm font-semibold {data.chore.isActive
					? 'bg-slate-200 text-slate-700'
					: 'bg-emerald-600 text-white'}"
			>
				{data.chore.isActive ? 'Pause chore' : 'Resume chore'}
			</button>
		</form>
	</div>

	{#if !data.chore.isActive}
		<p class="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
			This chore is paused — no new occurrences are being scheduled.
		</p>
	{/if}

	<ChoreForm
		people={data.people}
		rooms={data.rooms}
		message={form?.message}
		submitLabel="Save changes"
		action="?/save"
		currency={data.currency}
		initial={{
			title: data.chore.title,
			description: data.chore.description,
			roomId: data.chore.roomId,
			icon: data.chore.icon,
			frequency: data.chore.frequency,
			interval: data.chore.interval,
			weekdays,
			dayOfMonth: data.chore.dayOfMonth,
			monthOfYear: data.chore.monthOfYear,
			startDate: data.chore.startDate,
			points: data.chore.points,
			allowanceDollars: data.chore.allowanceCents / 100,
			requiresVerification: data.chore.requiresVerification,
			requiresPhoto: data.chore.requiresPhoto,
			graceDays: data.chore.graceDays,
			assignmentType: data.chore.assignmentType,
			assigneeIds: data.assigneeIds
		}}
	/>

	<section class="rounded-2xl border border-red-100 bg-red-50/50 p-5">
		<h2 class="text-sm font-semibold text-red-800">Remove this chore</h2>
		<p class="mt-1 text-sm text-slate-600">
			{#if data.verifiedCount > 0}
				Deleting also removes its {data.verifiedCount} completed
				entr{data.verifiedCount === 1 ? 'y' : 'ies'} (and their points).
				<span class="font-medium">Money already earned stays in the ledger.</span>
				Prefer "Pause chore" above if you just want it off the schedule.
			{:else}
				It hasn't been completed yet, so nothing else is lost.
			{/if}
		</p>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if confirmingDelete}
				<form method="POST" action="?/delete" use:enhance={submit()}>
					<button class="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white">
						Yes, delete "{data.chore.title}"
					</button>
				</form>
				<button
					type="button"
					class="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
					onclick={() => (confirmingDelete = false)}
				>
					Cancel
				</button>
			{:else}
				<button
					type="button"
					class="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 shadow-sm"
					onclick={() => (confirmingDelete = true)}
				>
					Delete chore…
				</button>
			{/if}
		</div>
	</section>
</main>
