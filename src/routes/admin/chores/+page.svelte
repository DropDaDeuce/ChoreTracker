<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROOM_PRESETS } from '$lib/choreLibrary';
	import { describeRecurrence } from '$lib/choreText';
	import IconPicker from '$lib/components/IconPicker.svelte';
	import { formatCents } from '$lib/money';
	import { submit } from '$lib/submit';

	const ROOM_ICONS = [
		'🏠', '🍳', '🛁', '🛏️', '🛋️', '🍽️', '🧺', '🚪', '🧸', '💻',
		'🚗', '🌱', '🐾', '🎮', '📚', '🏋️', '🎨', '🎹', '🔧', '❄️'
	];

	let { data, form } = $props();

	let addingRoom = $state(false);
	let customName = $state('');
	let customIcon = $state('🏠');
	let deletingRoomId = $state<number | null>(null);

	// Rooms whose preset is already added are dimmed but stay clickable
	// (two bedrooms is normal — the name is editable after picking).
	const usedIcons = $derived(new Set(data.rooms.map((r) => r.icon)));

	interface RoomGroup {
		id: number | null;
		name: string;
		icon: string;
		chores: typeof data.chores;
	}
	const groups = $derived.by((): RoomGroup[] => {
		const list: RoomGroup[] = data.rooms.map((room) => ({
			id: room.id,
			name: room.name,
			icon: room.icon,
			chores: data.chores.filter((c) => c.roomId === room.id)
		}));
		const general = data.chores.filter((c) => c.roomId === null);
		if (general.length > 0 || data.rooms.length === 0) {
			list.push({ id: null, name: 'General', icon: '🏠', chores: general });
		}
		return list;
	});

	const steps = $derived([
		{ done: data.gettingStarted.hasFamily, label: 'Add your family', href: '/admin/users' },
		{ done: data.gettingStarted.hasRooms, label: 'Add the rooms of your house', href: null },
		{ done: data.gettingStarted.hasChores, label: 'Pick chores from the library', href: null },
		{ done: data.gettingStarted.hasAssigned, label: 'Assign chores to people', href: '/admin/users' }
	]);
</script>

<svelte:head>
	<title>House — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4 pb-16">
	<div class="flex items-center justify-between pt-4">
		<h1 class="text-2xl font-bold text-slate-800">The house</h1>
		<button
			type="button"
			class="rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-white shadow"
			onclick={() => (addingRoom = !addingRoom)}
		>
			+ Add room
		</button>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	{#if data.showGettingStarted}
		<section class="rounded-2xl border-2 border-dashed border-slate-300 bg-white/60 p-5">
			<h2 class="font-semibold text-slate-800">Get your house set up</h2>
			<ul class="mt-3 space-y-2 text-sm">
				{#each steps as step}
					<li class="flex items-center gap-2.5 {step.done ? 'text-slate-400 line-through' : 'text-slate-700'}">
						<span class="flex h-5 w-5 items-center justify-center rounded-full text-xs {step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}">
							{step.done ? '✓' : '•'}
						</span>
						{#if step.href && !step.done}
							<a href={step.href} class="underline decoration-slate-300 hover:text-slate-900">{step.label}</a>
						{:else}
							{step.label}
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if addingRoom}
		<section class="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
			<h2 class="font-semibold text-slate-800">Add a room</h2>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each ROOM_PRESETS as preset (preset.key)}
					<form method="POST" action="?/addRoom" use:enhance={submit(() => (addingRoom = false))}>
						<input type="hidden" name="name" value={preset.name} />
						<input type="hidden" name="icon" value={preset.icon} />
						<button
							class="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50 {usedIcons.has(preset.icon) ? 'opacity-40' : ''}"
						>
							<span class="text-lg">{preset.icon}</span>
							{preset.name}
						</button>
					</form>
				{/each}
			</div>
			<form
				method="POST"
				action="?/addRoom"
				use:enhance={submit(() => {
					addingRoom = false;
					customName = '';
					customIcon = '🏠';
				})}
				class="space-y-3 border-t border-slate-100 pt-4"
			>
				<div>
					<span class="mb-1.5 block text-xs font-medium text-slate-500">Pick an icon</span>
					<IconPicker name="icon" bind:value={customIcon} options={ROOM_ICONS} />
				</div>
				<div class="flex flex-wrap items-end gap-2">
					<label class="block flex-1">
						<span class="mb-1 block text-xs font-medium text-slate-500">Your own room name</span>
						<input name="name" bind:value={customName} required maxlength="50" placeholder="e.g. Alex's bedroom" class="w-full min-w-36 rounded-lg border border-slate-300 px-3 py-2" />
					</label>
					<button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
						Add {customIcon} {customName || 'room'}
					</button>
				</div>
			</form>
			<p class="text-xs text-slate-400">
				Tip: add a preset twice and rename it — "Bedroom" works fine as "Alex's bedroom" and "Sam's bedroom".
			</p>
		</section>
	{/if}

	{#each groups as group (group.id ?? 'general')}
		<section class="rounded-2xl bg-white p-4 shadow-sm">
			<div class="flex flex-wrap items-center gap-2">
				<h2 class="flex items-center gap-2 text-lg font-bold text-slate-800">
					<span>{group.icon}</span>
					{group.name}
				</h2>
				<span class="text-xs text-slate-400">
					{group.chores.length} chore{group.chores.length === 1 ? '' : 's'}
				</span>
				{#if group.chores.some((c) => c.assigneeNames.length === 0)}
					<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
						{group.chores.filter((c) => c.assigneeNames.length === 0).length} unassigned
					</span>
				{/if}
				<span class="flex-1"></span>
				<a
					href="/admin/chores/new{group.id !== null ? `?room=${group.id}` : ''}"
					class="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 active:bg-slate-200"
				>
					+ Add chore
				</a>
				{#if group.id !== null && group.chores.length === 0}
					{#if deletingRoomId === group.id}
						<form method="POST" action="?/deleteRoom" use:enhance={submit(() => (deletingRoomId = null))}>
							<input type="hidden" name="roomId" value={group.id} />
							<button class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">
								Really remove?
							</button>
						</form>
					{:else}
						<button
							type="button"
							class="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-600 active:bg-red-50"
							onclick={() => (deletingRoomId = group.id)}
						>
							Remove room
						</button>
					{/if}
				{/if}
			</div>

			{#if group.chores.length === 0}
				<p class="mt-3 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">
					Nothing here yet — add chores from the library.
				</p>
			{:else}
				<ul class="mt-3 space-y-2">
					{#each group.chores as chore (chore.id)}
						<li>
							<a
								href="/admin/chores/{chore.id}"
								class="block rounded-xl border border-slate-100 bg-white p-3 transition hover:border-slate-300 {chore.isActive ? '' : 'opacity-50'}"
							>
								<div class="flex flex-wrap items-center gap-2">
									{#if chore.icon}<span>{chore.icon}</span>{/if}
									<span class="font-semibold text-slate-800">{chore.title}</span>
									{#if !chore.isActive}
										<span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">paused</span>
									{/if}
									{#if chore.assigneeNames.length === 0}
										<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">unassigned</span>
									{/if}
								</div>
								<p class="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
									<span>{describeRecurrence(chore)}</span>
									{#if chore.assigneeNames.length > 0}
										<!-- "→" reads as turn order; "+" as all at once. -->
										<span>
											👤 {chore.assigneeNames.join(
												chore.assignmentType === 'rotating' ? ' → ' : ' + '
											)}
											{#if chore.assignmentType === 'everyone'}(each){/if}
										</span>
									{/if}
									{#if chore.points > 0}<span>⭐ {chore.points}</span>{/if}
									{#if chore.isBonus}
										<span class="font-semibold text-violet-600">🎁 bonus</span>
									{/if}
									{#if !chore.requiresVerification}<span>auto-approves</span>{/if}
								</p>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/each}
</main>
