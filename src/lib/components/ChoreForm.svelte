<script lang="ts">
	import { enhance } from '$app/forms';
	import { MONTH_LABELS, WEEKDAY_LABELS } from '$lib/choreText';

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
		assigneeId: number | null;
	}

	let {
		people,
		initial,
		message,
		submitLabel = 'Save chore',
		action = ''
	}: {
		people: Person[];
		initial: Initial;
		message?: string;
		submitLabel?: string;
		action?: string;
	} = $props();

	// svelte-ignore state_referenced_locally -- form fields intentionally start from the initial values
	let frequency = $state(initial.frequency);
</script>

<form method="POST" {action} use:enhance class="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
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

	<div class="grid gap-4 sm:grid-cols-3">
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
			<span class="mb-1 block text-sm font-medium text-slate-700">Allowance ($)</span>
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

	<label class="block">
		<span class="mb-1 block text-sm font-medium text-slate-700">Who does it?</span>
		<select name="assigneeId" required class="w-full rounded-lg border border-slate-300 px-3 py-2">
			{#each people as person (person.id)}
				<option value={person.id} selected={initial.assigneeId === person.id}>
					{person.name}
					{person.role === 'kid' ? '(kid)' : ''}
				</option>
			{/each}
		</select>
	</label>

	<label class="flex items-center gap-2">
		<input
			type="checkbox"
			name="requiresVerification"
			checked={initial.requiresVerification}
			class="h-4 w-4"
		/>
		<span class="text-sm text-slate-700">An adult must verify before it counts (and pays)</span>
	</label>

	{#if message}
		<p class="text-sm font-medium text-red-600">{message}</p>
	{/if}

	<button class="w-full rounded-xl bg-slate-800 py-3 font-semibold text-white shadow sm:w-auto sm:px-8">
		{submitLabel}
	</button>
</form>
