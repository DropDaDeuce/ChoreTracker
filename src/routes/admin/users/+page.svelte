<script lang="ts">
	import { enhance } from '$app/forms';
	import { AVATAR_COLORS } from '$lib/colors';

	let { data, form } = $props();

	let resettingId = $state<number | null>(null);
</script>

<svelte:head>
	<title>People — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-8 p-4 pb-16">
	<h1 class="pt-4 text-2xl font-bold text-slate-800">People</h1>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	<section>
		<ul class="space-y-3">
			{#each data.people as person (person.id)}
				<li class="rounded-2xl bg-white p-4 shadow-sm {person.isActive ? '' : 'opacity-60'}">
					<div class="flex flex-wrap items-center gap-3">
						<span
							class="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white"
							style="background: {person.avatarColor}"
						>
							{person.name.slice(0, 1).toUpperCase()}
						</span>
						<div class="flex-1">
							<p class="font-semibold text-slate-800">
								{person.name}
								{#if person.id === data.myId}<span class="text-xs text-slate-400">(you)</span>{/if}
							</p>
							<p class="text-xs text-slate-500">
								{person.role === 'adult' ? '🧑 Adult' : '🧒 Kid'}
								{#if !person.isActive}· inactive{/if}
							</p>
						</div>
						<button
							type="button"
							class="text-sm font-medium text-slate-500 hover:text-slate-800"
							onclick={() => (resettingId = resettingId === person.id ? null : person.id)}
						>
							Reset PIN
						</button>
						<form method="POST" action="?/toggleActive" use:enhance>
							<input type="hidden" name="userId" value={person.id} />
							<button class="text-sm font-medium {person.isActive ? 'text-red-500 hover:text-red-700' : 'text-emerald-600 hover:text-emerald-800'}">
								{person.isActive ? 'Deactivate' : 'Reactivate'}
							</button>
						</form>
					</div>

					{#if resettingId === person.id}
						<form
							method="POST"
							action="?/resetPin"
							use:enhance={() =>
								async ({ update }) => {
									resettingId = null;
									await update();
								}}
							class="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3"
						>
							<input type="hidden" name="userId" value={person.id} />
							<label class="flex-1">
								<span class="mb-1 block text-xs font-medium text-slate-500">
									New PIN for {person.name} (4–6 digits)
								</span>
								<input
									name="pin"
									type="password"
									inputmode="numeric"
									pattern={'\\d{4,6}'}
									required
									class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
								/>
							</label>
							<button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
								Save
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2 class="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">
			Add a family member
		</h2>
		<form method="POST" action="?/add" use:enhance class="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="mb-1 block text-sm font-medium text-slate-700">Name</span>
					<input name="name" required maxlength="50" class="w-full rounded-lg border border-slate-300 px-3 py-2" />
				</label>
				<label class="block">
					<span class="mb-1 block text-sm font-medium text-slate-700">Role</span>
					<select name="role" class="w-full rounded-lg border border-slate-300 px-3 py-2">
						<option value="kid">Kid</option>
						<option value="adult">Adult</option>
					</select>
				</label>
			</div>
			<label class="block sm:max-w-xs">
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
			<fieldset>
				<legend class="mb-2 text-sm font-medium text-slate-700">Color</legend>
				<div class="flex flex-wrap gap-2">
					{#each AVATAR_COLORS as color, i}
						<label class="cursor-pointer">
							<input type="radio" name="avatarColor" value={color} checked={i === 0} class="peer sr-only" />
							<span
								class="block h-8 w-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-800"
								style="background: {color}"
							></span>
						</label>
					{/each}
				</div>
			</fieldset>
			<button class="rounded-xl bg-slate-800 px-6 py-2.5 font-semibold text-white shadow">
				Add person
			</button>
		</form>
	</section>
</main>
