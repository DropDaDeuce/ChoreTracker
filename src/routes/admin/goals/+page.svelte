<script lang="ts">
	import { enhance } from '$app/forms';
	import GoalCard from '$lib/components/GoalCard.svelte';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	let scope = $state<'user' | 'family'>('user');
</script>

<svelte:head>
	<title>Goals — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<div class="pt-4">
		<h1 class="text-2xl font-bold text-slate-800">Point goals 🎯</h1>
		<p class="mt-1 text-sm text-slate-500">
			A target to aim at, for one kid or the whole family. Goals count stars from verified
			chores and pay no money — the reward is whatever you promise here.
		</p>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	{#if data.goals.length > 0}
		<section class="space-y-2">
			{#each data.goals as goal (goal.id)}
				<div class="flex items-start gap-2">
					<div class="min-w-0 flex-1">
						<GoalCard {goal} />
					</div>
					<form method="POST" action="?/delete" use:enhance={submit()}>
						<input type="hidden" name="goalId" value={goal.id} />
						<button
							class="h-10 w-10 rounded-lg text-slate-400 hover:text-red-600 active:bg-red-50"
							aria-label="Delete goal"
						>
							✕
						</button>
					</form>
				</div>
			{/each}
		</section>
	{:else}
		<p class="rounded-2xl bg-white p-6 text-center text-slate-500 shadow-sm">
			No goals yet. Try "20 stars this week → movie night".
		</p>
	{/if}

	<form
		method="POST"
		action="?/create"
		use:enhance={submit()}
		class="space-y-4 rounded-2xl bg-white p-6 shadow-sm"
	>
		<h2 class="font-semibold text-slate-800">New goal</h2>

		<fieldset>
			<legend class="mb-2 text-sm font-medium text-slate-700">Who's it for?</legend>
			<div class="flex flex-wrap gap-2">
				<label class="cursor-pointer">
					<input type="radio" name="scope" value="user" bind:group={scope} class="peer sr-only" />
					<span
						class="block rounded-full border border-slate-300 px-4 py-1.5 text-sm peer-checked:border-slate-800 peer-checked:bg-slate-800 peer-checked:text-white"
					>
						One person
					</span>
				</label>
				<label class="cursor-pointer">
					<input type="radio" name="scope" value="family" bind:group={scope} class="peer sr-only" />
					<span
						class="block rounded-full border border-slate-300 px-4 py-1.5 text-sm peer-checked:border-slate-800 peer-checked:bg-slate-800 peer-checked:text-white"
					>
						Whole family
					</span>
				</label>
			</div>
		</fieldset>

		{#if scope === 'user'}
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Person</span>
				<select name="userId" class="w-full rounded-lg border border-slate-300 px-3 py-2">
					{#each data.kids as kid (kid.id)}
						<option value={kid.id}>{kid.name}</option>
					{/each}
				</select>
			</label>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Every</span>
				<select name="period" class="w-full rounded-lg border border-slate-300 px-3 py-2">
					<option value="weekly">Week</option>
					<option value="daily">Day</option>
				</select>
			</label>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Target ⭐</span>
				<input
					name="targetPoints"
					type="number"
					min="1"
					max="10000"
					value="20"
					required
					class="w-full rounded-lg border border-slate-300 px-3 py-2"
				/>
			</label>
		</div>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Reward (optional)</span>
			<input
				name="rewardNote"
				maxlength="200"
				placeholder="e.g. Movie night"
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
			<span class="mt-1 block text-xs text-slate-400">
				Shown to them as they get closer. Not money — the allowance handles that.
			</span>
		</label>

		<button class="rounded-xl bg-slate-800 px-8 py-3 font-semibold text-white shadow">
			Add goal
		</button>
	</form>
</main>
