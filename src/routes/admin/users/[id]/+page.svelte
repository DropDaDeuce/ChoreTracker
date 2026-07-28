<script lang="ts">
	import { enhance } from '$app/forms';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	let assignId = $state<number | ''>('');
</script>

<svelte:head>
	<title>{data.person.name} — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<div class="pt-4">
		<a href="/admin/users" class="text-sm text-slate-500 hover:text-slate-800">← People</a>
		<div class="mt-2 flex items-center gap-3">
			<span
				class="flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white"
				style="background: {data.person.avatarColor}"
			>
				{data.person.name.slice(0, 1).toUpperCase()}
			</span>
			<div>
				<h1 class="text-2xl font-bold text-slate-800">{data.person.name}</h1>
				<p class="text-sm text-slate-500">
					{data.person.role === 'adult' ? '🧑 Adult' : '🧒 Kid'}
					{#if !data.person.isActive}· inactive{/if}
					· ~{data.perWeek} chore{data.perWeek === 1 ? '' : 's'}/week
					· <a href="/admin/users/{data.person.id}/presence" class="underline decoration-slate-300 hover:text-slate-800">days at home</a>
				</p>
			</div>
		</div>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	<section class="rounded-2xl bg-white p-5 shadow-sm">
		<h2 class="font-semibold text-slate-800">Their chores</h2>
		{#if data.theirChores.length === 0}
			<p class="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
				Nothing assigned yet.
			</p>
		{:else}
			<ul class="mt-3 space-y-2">
				{#each data.theirChores as chore (chore.id)}
					<li class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-3">
						<div class="min-w-0 flex-1">
							<a href="/admin/chores/{chore.id}" class="font-medium text-slate-800 hover:underline">
								{#if chore.icon}{chore.icon}{/if}
								{chore.title}
							</a>
							<p class="text-xs text-slate-400">
								{chore.roomLabel} · {chore.frequency}
								{#if chore.assignmentType === 'rotating'}
									· rotates: {chore.poolNames.join(' → ')}
								{:else if chore.assignmentType === 'everyone'}
									· everyone: {chore.poolNames.join(' + ')}
								{/if}
							</p>
						</div>
						<form method="POST" action="?/unassign" use:enhance={submit()}>
							<input type="hidden" name="choreId" value={chore.id} />
							<button class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 active:bg-red-50 active:text-red-600">
								{chore.assignmentType === 'rotating' ? 'Leave rotation' : 'Unassign'}

							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.available.length > 0}
			<form
				method="POST"
				action="?/assign"
				use:enhance={submit(() => (assignId = ''))}
				class="mt-4 flex items-end gap-2 border-t border-slate-100 pt-4"
			>
				<label class="block flex-1">
					<span class="mb-1 block text-xs font-medium text-slate-500">
						Assign a chore to {data.person.name}
					</span>
					<select name="choreId" bind:value={assignId} class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
						<option value="" disabled>Pick a chore…</option>
						{#each data.available.filter((c) => c.unassigned) as chore (chore.id)}
							<option value={chore.id}>
								{chore.icon} {chore.title} — {chore.roomLabel} (unassigned)
							</option>
						{/each}
						{#each data.available.filter((c) => !c.unassigned) as chore (chore.id)}
							<option value={chore.id}>
								{chore.icon} {chore.title} — {chore.roomLabel} ({chore.assignmentType === 'rotating'
									? `rotates: ${chore.poolNames.join(' → ')}`
									: chore.assignmentType === 'everyone'
										? `everyone: ${chore.poolNames.join(' + ')}`
										: `now: ${chore.poolNames[0] ?? '?'}`})
							</option>
						{/each}
					</select>
				</label>
				<button
					class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
					disabled={assignId === ''}
				>
					Assign
				</button>
			</form>
			<p class="mt-2 text-xs text-slate-400">
				Fixed chores switch to {data.person.name}; rotations add them to the end of the turn order.
			</p>
		{/if}
	</section>
</main>
