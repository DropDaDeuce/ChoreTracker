<script lang="ts">
	import { enhance } from '$app/forms';
	import { AVATAR_COLORS } from '$lib/colors';
	import { submit } from '$lib/submit';

	let { form } = $props();
</script>

<svelte:head>
	<title>ChoreTracker — welcome!</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
	<h1 class="text-3xl font-bold text-slate-800">Welcome! 👋</h1>
	<p class="mt-2 mb-8 text-slate-600">
		Let's set up the first adult account. You'll add the rest of the family afterwards.
	</p>

	<form method="POST" use:enhance={submit()} class="space-y-5 rounded-2xl bg-white p-6 shadow">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Your name</span>
			<input
				name="name"
				required
				maxlength="50"
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
				placeholder="e.g. Jamie"
			/>
		</label>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">PIN (4–6 digits)</span>
			<input
				name="pin"
				type="password"
				inputmode="numeric"
				pattern={'\\d{4,6}'}
				required
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">Confirm PIN</span>
			<input
				name="pinConfirm"
				type="password"
				inputmode="numeric"
				pattern={'\\d{4,6}'}
				required
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>

		<fieldset>
			<legend class="mb-2 text-sm font-medium text-slate-700">Pick your color</legend>
			<div class="flex flex-wrap gap-2">
				{#each AVATAR_COLORS as color, i}
					<label class="cursor-pointer">
						<input
							type="radio"
							name="avatarColor"
							value={color}
							checked={i === 6}
							class="peer sr-only"
						/>
						<span
							class="block h-9 w-9 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-800"
							style="background: {color}"
						></span>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if form?.message}
			<p class="text-sm font-medium text-red-600">{form.message}</p>
		{/if}

		<button class="w-full rounded-xl bg-slate-800 py-3 font-semibold text-white shadow">
			Create my account
		</button>
	</form>
</main>
