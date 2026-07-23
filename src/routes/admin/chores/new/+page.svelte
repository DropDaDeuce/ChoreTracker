<script lang="ts">
	import { enhance } from '$app/forms';
	import ChoreForm from '$lib/components/ChoreForm.svelte';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	let picked = $state<string[]>([]);
	let showCustom = $state(false);

	function toggle(title: string) {
		picked = picked.includes(title) ? picked.filter((t) => t !== title) : [...picked, title];
	}

	const FREQ_LABEL: Record<string, string> = {
		daily: 'daily',
		weekly: 'weekly',
		monthly: 'monthly',
		yearly: 'yearly'
	};
</script>

<svelte:head>
	<title>Add chores — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<div class="pt-4">
		<a href="/admin/chores" class="text-sm text-slate-500 hover:text-slate-800">← The house</a>
		<h1 class="mt-1 text-2xl font-bold text-slate-800">
			Add chores{data.room ? ` — ${data.room.icon} ${data.room.name}` : ''}
		</h1>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	<section class="rounded-2xl bg-white p-5 shadow-sm">
		<h2 class="font-semibold text-slate-800">From the library</h2>
		<p class="mt-0.5 text-sm text-slate-500">
			Tick what fits your place — they're added unassigned, so you can hand them out afterwards.
			Money stays at {data.currency}0 until you set it.
		</p>

		<form method="POST" action="?/library" use:enhance={submit(() => (picked = []))} class="mt-4">
			<input type="hidden" name="roomId" value={data.room?.id ?? ''} />
			<input type="hidden" name="presetKey" value={data.presetKey ?? 'general'} />
			<ul class="space-y-1.5">
				{#each data.templates as template (template.title)}
					<li>
						<label
							class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 {template.alreadyAdded
								? 'cursor-default border-slate-100 opacity-45'
								: picked.includes(template.title)
									? 'border-slate-800 bg-slate-50'
									: 'border-slate-200 hover:border-slate-400'}"
						>
							<input
								type="checkbox"
								name="titles"
								value={template.title}
								disabled={template.alreadyAdded}
								checked={picked.includes(template.title)}
								onchange={() => toggle(template.title)}
								class="h-4 w-4"
							/>
							<span class="text-lg">{template.icon}</span>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-slate-800">{template.title}</span>
								{#if template.description}
									<span class="block text-xs text-slate-400">{template.description}</span>
								{/if}
							</span>
							<span class="shrink-0 text-xs text-slate-400">
								{FREQ_LABEL[template.frequency]} · ⭐ {template.points}
								{#if template.alreadyAdded}· added ✓{/if}
							</span>
						</label>
					</li>
				{/each}
			</ul>
			<button
				class="mt-4 w-full rounded-xl bg-slate-800 py-3 font-semibold text-white shadow disabled:opacity-40 sm:w-auto sm:px-8"
				disabled={picked.length === 0}
			>
				Add {picked.length || ''} chore{picked.length === 1 ? '' : 's'}
			</button>
		</form>
	</section>

	<div class="text-center">
		<button
			type="button"
			class="text-sm font-medium text-slate-500 underline decoration-slate-300 hover:text-slate-800"
			onclick={() => (showCustom = !showCustom)}
		>
			{showCustom ? 'Hide the custom form' : '…or make your own chore'}
		</button>
	</div>

	{#if showCustom}
		<ChoreForm
			people={data.people}
			rooms={data.rooms}
			message={form?.message}
			submitLabel="Create chore"
			action="?/custom"
			currency={data.currency}
			initial={{
				title: '',
				description: '',
				roomId: data.room?.id ?? null,
				icon: '',
				frequency: 'daily',
				interval: 1,
				weekdays: [],
				dayOfMonth: 1,
				monthOfYear: 1,
				startDate: data.today,
				points: 0,
				allowanceDollars: 0,
				requiresVerification: true,
				requiresPhoto: false,
				graceDays: 0,
				assignmentType: 'fixed',
				assigneeIds: []
			}}
		/>
	{/if}
</main>
