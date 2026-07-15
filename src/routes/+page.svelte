<script lang="ts">
	import { enhance } from '$app/forms';
	import PinPad from '$lib/components/PinPad.svelte';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally -- only seeds the initial selection after a failed login
	let selectedId = $state<number | null>(form?.userId ?? null);
	let pin = $state('');

	const selected = $derived(data.profiles.find((p) => p.id === selectedId) ?? null);

	function pick(id: number) {
		selectedId = id;
		pin = '';
	}
</script>

<svelte:head>
	<title>ChoreTracker — who's there?</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-6">
	<h1 class="mb-1 text-3xl font-bold text-slate-800">🧹 ChoreTracker</h1>

	{#if !selected}
		<p class="mb-8 text-slate-500">Who's there?</p>
		<div class="grid w-full grid-cols-2 gap-4 sm:grid-cols-3">
			{#each data.profiles as profile}
				<button
					type="button"
					class="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow transition hover:-translate-y-0.5 hover:shadow-md"
					onclick={() => pick(profile.id)}
				>
					<span
						class="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
						style="background: {profile.avatarColor}"
					>
						{profile.name.slice(0, 1).toUpperCase()}
					</span>
					<span class="font-semibold text-slate-800">{profile.name}</span>
				</button>
			{/each}
		</div>
	{:else}
		<p class="mb-6 text-slate-500">
			Hi <span class="font-semibold" style="color: {selected.avatarColor}">{selected.name}</span> —
			enter your PIN
		</p>

		<form method="POST" action="?/login" use:enhance class="w-full max-w-xs">
			<input type="hidden" name="userId" value={selected.id} />
			<input type="hidden" name="pin" value={pin} />
			<PinPad bind:value={pin} />

			{#if form?.message}
				<p class="mt-4 text-center text-sm font-medium text-red-600">{form.message}</p>
			{/if}

			<button
				class="mt-6 w-full rounded-xl bg-slate-800 py-3 font-semibold text-white shadow disabled:opacity-40"
				disabled={pin.length < 4}
			>
				Let's go
			</button>
			<button
				type="button"
				class="mt-3 w-full text-sm text-slate-500 hover:text-slate-800"
				onclick={() => (selectedId = null)}
			>
				← Not {selected.name}?
			</button>
		</form>
	{/if}
</main>
