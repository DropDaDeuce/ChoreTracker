<script lang="ts">
	import { enhance } from '$app/forms';
	import { MONTH_LABELS, WEEKDAY_LABELS } from '$lib/choreText';
	import { submit } from '$lib/submit';

	interface Person {
		id: number;
		name: string;
		role: string;
	}

	interface Initial {
		title: string;
		description: string;
		frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
		interval: number;
		weekdays: number[];
		dayOfMonth: number | null;
		monthOfYear: number | null;
		startDate: string;
		points: number;
		allowanceDollars: number;
		requiresVerification: boolean;
		requiresPhoto: boolean;
		graceDays: number;
		assignmentType: 'fixed' | 'rotating';
		/** Ordered pool; for fixed assignment only the first entry is used. */
		assigneeIds: number[];
	}

	let {
		people,
		initial,
		message,
		submitLabel = 'Save chore',
		action = '',
		currency = '$'
	}: {
		people: Person[];
		initial: Initial;
		message?: string;
		submitLabel?: string;
		action?: string;
		currency?: string;
	} = $props();

	// svelte-ignore state_referenced_locally -- form fields intentionally start from the initial values
	let frequency = $state(initial.frequency);
	// svelte-ignore state_referenced_locally
	let assignmentType = $state(initial.assignmentType);
	// svelte-ignore state_referenced_locally
	let pool = $state<number[]>([...initial.assigneeIds]);
	// svelte-ignore state_referenced_locally
	let fixedId = $state<number | null>(initial.assigneeIds[0] ?? people[0]?.id ?? null);

	let addId = $state<number | ''>('');

	const available = $derived(people.filter((p) => !pool.includes(p.id)));

	function nameOf(id: number) {
		return people.find((p) => p.id === id)?.name ?? `#${id}`;
	}
	function addToPool() {
		if (addId !== '' && !pool.includes(addId)) pool = [...pool, addId];
		addId = '';
	}
	function removeFromPool(id: number) {
		pool = pool.filter((p) => p !== id);
	}
	function move(id: number, delta: -1 | 1) {
		const i = pool.indexOf(id);
		const j = i + delta;
		if (i < 0 || j < 0 || j >= pool.length) return;
		const next = [...pool];
		[next[i], next[j]] = [next[j], next[i]];
		pool = next;
	}
</script>

<form method="POST" {action} use:enhance={submit()} class="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
	<label class="block">
		<span class="mb-1 block text-sm font-medium text-slate-700">Title</span>
		<input
			name="title"
			required
			maxlength="100"
			value={initial.title}
			class="w-full rounded-lg border border-slate-300 px-3 py-2"
			placeholder="e.g. Empty the dishwasher"
		/>
	</label>

	<label class="block">
		<span class="mb-1 block text-sm font-medium text-slate-700">Notes (optional)</span>
		<textarea
			name="description"
			maxlength="500"
			rows="2"
			class="w-full rounded-lg border border-slate-300 px-3 py-2"
			placeholder="Anything the doer should know">{initial.description}</textarea>
	</label>

	<div class="grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">How often?</span>
			<select
				name="frequency"
				bind:value={frequency}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			>
				<option value="daily">Daily</option>
				<option value="weekly">Weekly</option>
				<option value="monthly">Monthly</option>
				<option value="yearly">Yearly</option>
			</select>
		</label>

		{#if frequency === 'daily'}
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Every N days</span>
				<input
					name="interval"
					type="number"
					min="1"
					max="365"
					value={initial.interval}
					class="w-full rounded-lg border border-slate-300 px-3 py-2"
				/>
			</label>
		{/if}

		{#if frequency === 'monthly' || frequency === 'yearly'}
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Day of month</span>
				<input
					name="dayOfMonth"
					type="number"
					min="1"
					max="31"
					value={initial.dayOfMonth ?? 1}
					class="w-full rounded-lg border border-slate-300 px-3 py-2"
				/>
			</label>
		{/if}

		{#if frequency === 'yearly'}
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Month</span>
				<select name="monthOfYear" class="w-full rounded-lg border border-slate-300 px-3 py-2">
					{#each MONTH_LABELS as label, i}
						<option value={i + 1} selected={initial.monthOfYear === i + 1}>{label}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	{#if frequency === 'weekly'}
		<fieldset>
			<legend class="mb-2 text-sm font-medium text-slate-700">On which days?</legend>
			<div class="flex flex-wrap gap-2">
				{#each WEEKDAY_LABELS as label, i}
					<label class="cursor-pointer">
						<input
							type="checkbox"
							name="weekdays"
							value={i}
							checked={initial.weekdays.includes(i)}
							class="peer sr-only"
						/>
						<span
							class="block rounded-full border border-slate-300 px-3 py-1.5 text-sm peer-checked:border-slate-800 peer-checked:bg-slate-800 peer-checked:text-white"
						>
							{label}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Starts on</span>
			<input
				name="startDate"
				type="date"
				required
				value={initial.startDate}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Grace days before "missed"</span>
			<input
				name="graceDays"
				type="number"
				min="0"
				max="30"
				value={initial.graceDays}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Allowance ({currency})</span>
			<input
				name="allowance"
				type="number"
				min="0"
				max="1000"
				step="0.01"
				value={initial.allowanceDollars}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Points</span>
			<input
				name="points"
				type="number"
				min="0"
				max="1000"
				value={initial.points}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>
	</div>

	<fieldset>
		<legend class="mb-2 text-sm font-medium text-slate-700">Who does it?</legend>
		<div class="mb-3 flex gap-2">
			<label class="cursor-pointer">
				<input type="radio" name="assignmentType" value="fixed" bind:group={assignmentType} class="peer sr-only" />
				<span class="block rounded-full border border-slate-300 px-4 py-1.5 text-sm peer-checked:border-slate-800 peer-checked:bg-slate-800 peer-checked:text-white">
					One person
				</span>
			</label>
			<label class="cursor-pointer">
				<input type="radio" name="assignmentType" value="rotating" bind:group={assignmentType} class="peer sr-only" />
				<span class="block rounded-full border border-slate-300 px-4 py-1.5 text-sm peer-checked:border-slate-800 peer-checked:bg-slate-800 peer-checked:text-white">
					Rotate turns
				</span>
			</label>
		</div>

		{#if assignmentType === 'fixed'}
			<select
				name="assigneeIds"
				required
				bind:value={fixedId}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			>
				{#each people as person (person.id)}
					<option value={person.id}>
						{person.name}
						{person.role === 'kid' ? '(kid)' : ''}
					</option>
				{/each}
			</select>
		{:else}
			{#each pool as id (id)}
				<input type="hidden" name="assigneeIds" value={id} />
			{/each}
			{#if pool.length === 0}
				<p class="mb-2 text-sm text-slate-400">Nobody in the rotation yet — add at least two.</p>
			{:else}
				<ul class="mb-3 space-y-1.5">
					{#each pool as id, i (id)}
						<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
							<span class="w-5 text-xs font-semibold text-slate-400">{i + 1}.</span>
							<span class="flex-1 font-medium text-slate-700">{nameOf(id)}</span>
							<button type="button" class="px-1.5 text-slate-400 hover:text-slate-800 disabled:opacity-30" onclick={() => move(id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
							<button type="button" class="px-1.5 text-slate-400 hover:text-slate-800 disabled:opacity-30" onclick={() => move(id, 1)} disabled={i === pool.length - 1} aria-label="Move down">↓</button>
							<button type="button" class="px-1.5 text-red-400 hover:text-red-600" onclick={() => removeFromPool(id)} aria-label="Remove">✕</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if available.length > 0}
				<div class="flex gap-2">
					<select bind:value={addId} class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
						<option value="" disabled>Add someone…</option>
						{#each available as person (person.id)}
							<option value={person.id}>{person.name} {person.role === 'kid' ? '(kid)' : ''}</option>
						{/each}
					</select>
					<button
						type="button"
						class="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
						onclick={addToPool}
						disabled={addId === ''}
					>
						Add
					</button>
				</div>
			{/if}
			<p class="mt-2 text-xs text-slate-400">
				Turns go in this order, one per occurrence.
			</p>
		{/if}
	</fieldset>

	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			name="requiresVerification"
			checked={initial.requiresVerification}
			class="h-4 w-4"
		/>
		<span class="text-sm text-slate-700">An adult must verify before it counts (and pays)</span>
	</label>

	<label class="flex items-center gap-2">
		<input type="checkbox" name="requiresPhoto" checked={initial.requiresPhoto} class="h-4 w-4" />
		<span class="text-sm text-slate-700">Require a photo as proof 📷</span>
	</label>

	{#if message}
		<p class="text-sm font-medium text-red-600">{message}</p>
	{/if}

	<button class="w-full rounded-xl bg-slate-800 py-3 font-semibold text-white shadow sm:w-auto sm:px-8">
		{submitLabel}
	</button>
</form>
