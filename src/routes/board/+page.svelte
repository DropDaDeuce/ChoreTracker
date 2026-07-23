<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import PinPad from '$lib/components/PinPad.svelte';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	// Who the PIN overlay is for (kiosk fast-switch).
	// svelte-ignore state_referenced_locally -- reopens the pad after a wrong PIN
	let switching = $state<{ id: number; name: string; avatarColor: string } | null>(
		form?.userId ? (data.people.find((p) => p.id === form.userId) ?? null) : null
	);
	let pin = $state('');

	let now = $state(new Date());

	// Wall-tablet duties: tick the clock and refresh the data — but never
	// while someone is mid-PIN (a refresh would eat their taps).
	$effect(() => {
		const clock = setInterval(() => (now = new Date()), 30_000);
		const refresh = setInterval(() => {
			if (!switching) invalidateAll();
		}, 60_000);
		return () => {
			clearInterval(clock);
			clearInterval(refresh);
		};
	});

	function openSwitch(person: { id: number; name: string; avatarColor: string }) {
		switching = { id: person.id, name: person.name, avatarColor: person.avatarColor };
		pin = '';
	}

	const DATE_FMT = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
	const TIME_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
</script>

<svelte:head>
	<title>Family board — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 p-4 pb-10 sm:p-6">
	<div class="flex flex-wrap items-end justify-between gap-2">
		<div>
			<h1 class="text-3xl font-bold text-slate-800">🏠 Family board</h1>
			<p class="mt-1 text-lg text-slate-500">{DATE_FMT.format(now)}</p>
		</div>
		<div class="text-right">
			<p class="text-3xl font-bold text-slate-700">{TIME_FMT.format(now)}</p>
			<div class="mt-0.5 flex items-center justify-end gap-3 text-sm">
				{#if data.me.kiosk}
					<span class="font-medium text-slate-400">🔒 locked — tap a face to log in</span>
				{:else}
					<!-- Leaving ALWAYS costs a PIN — a parked tablet must never
					     hand out the opener's profile. -->
					<button
						type="button"
						class="text-slate-400 underline decoration-slate-300 hover:text-slate-600"
						onclick={() => openSwitch({ id: data.me.id, name: data.me.name, avatarColor: data.me.avatarColor })}
					>
						exit board
					</button>
					<form method="POST" action="?/lock" use:enhance={submit()}>
						<button
							class="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 active:bg-slate-300"
							title="Wall-tablet mode: after locking, leaving the board always needs a PIN — even by URL."
						>
							🔒 Lock
						</button>
					</form>
				{/if}
			</div>
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each data.people as person (person.id)}
			{@const doneCount = person.awaiting.length + person.completed.length}
			{@const total = doneCount + person.open.length}
			<button
				type="button"
				class="rounded-3xl bg-white p-5 text-left shadow-sm transition active:scale-[0.99] {person.away
					? 'opacity-60'
					: ''}"
				onclick={() => openSwitch(person)}
			>
				<div class="flex items-center gap-3">
					<span
						class="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold text-white"
						style="background: {person.avatarColor}"
					>
						{person.name.slice(0, 1).toUpperCase()}
					</span>
					<div class="min-w-0 flex-1">
						<p class="truncate text-xl font-bold text-slate-800">{person.name}</p>
						<p class="flex flex-wrap gap-x-2 text-sm text-slate-500">
							{#if person.away}
								<span class="font-semibold text-sky-600">✈️ away today</span>
							{:else if total === 0}
								<span>nothing due today</span>
							{:else if doneCount === total}
								<span class="font-semibold text-emerald-700">all done! 🎉</span>
							{:else}
								<span>{doneCount} of {total} done</span>
							{/if}
							{#if person.streak >= 2}
								<span class="font-semibold text-orange-600">🔥 {person.streak}</span>
							{/if}
						</p>
					</div>
				</div>

				{#if total > 0 && !person.away}
					<div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
						<div
							class="h-full rounded-full bg-emerald-500 transition-all duration-500"
							style="width: {Math.round((doneCount / total) * 100)}%"
						></div>
					</div>
				{/if}

				{#if person.open.length + person.awaiting.length + person.completed.length > 0}
					<ul class="mt-3 space-y-1.5 text-[15px]">
						{#each person.open as item (item.id)}
							<li class="flex items-center gap-2 text-slate-700">
								<span class="w-6 shrink-0 text-center">{item.icon || '▢'}</span>
								<span class="min-w-0 flex-1 truncate">{item.title}</span>
								{#if item.overdue}
									<span class="shrink-0 text-xs font-semibold text-red-500">overdue</span>
								{/if}
							</li>
						{/each}
						{#each person.awaiting as item (item.id)}
							<li class="flex items-center gap-2 text-slate-400">
								<span class="w-6 shrink-0 text-center">⏳</span>
								<span class="min-w-0 flex-1 truncate">{item.title}</span>
							</li>
						{/each}
						{#each person.completed as item (item.id)}
							<li class="flex items-center gap-2 text-slate-400 line-through decoration-emerald-500/60">
								<span class="w-6 shrink-0 text-center no-underline">✅</span>
								<span class="min-w-0 flex-1 truncate">{item.title}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</button>
		{/each}
	</div>

	<p class="text-center text-xs text-slate-400">
		Tap your face to log in and mark things done. The board refreshes itself.
		{#if !data.me.kiosk}
			Parking this on a wall tablet? Tap 🔒 Lock so leaving always needs a PIN.
		{/if}
	</p>
</main>

{#if switching}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
		role="dialog"
		aria-label="Enter PIN for {switching.name}"
	>
		<div class="w-full max-w-xs rounded-3xl bg-white p-6 shadow-xl">
			<p class="mb-4 text-center">
				<span
					class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-white"
					style="background: {switching.avatarColor}"
				>
					{switching.name.slice(0, 1).toUpperCase()}
				</span>
				<span class="font-semibold text-slate-800">Hi {switching.name} — enter your PIN</span>
			</p>
			<form method="POST" action="?/switch" use:enhance={submit()}>
				<input type="hidden" name="userId" value={switching.id} />
				<input type="hidden" name="pin" value={pin} />
				<PinPad bind:value={pin} />
				{#if form?.message && form.userId === switching.id}
					<p class="mt-3 text-center text-sm font-medium text-red-600">{form.message}</p>
				{/if}
				<button
					class="mt-5 w-full rounded-xl bg-slate-800 py-3 font-semibold text-white shadow disabled:opacity-40"
					disabled={pin.length < 4}
				>
					Let's go
				</button>
				<button
					type="button"
					class="mt-2 w-full py-2 text-sm text-slate-500 hover:text-slate-800"
					onclick={() => (switching = null)}
				>
					Cancel
				</button>
			</form>
		</div>
	</div>
{/if}
