<script lang="ts">
	import { MONTH_LABELS } from '$lib/choreText';

	let { data } = $props();

	const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const weekdayLabels = $derived(
		data.weekStart === 'monday' ? WEEKDAYS_MON : ['Sun', ...WEEKDAYS_MON.slice(0, 6)]
	);

	// 0 = Monday … 6 = Sunday for the 1st of the month (Zeller-free via Date.UTC).
	const firstWeekday = $derived((new Date(Date.UTC(data.year, data.month - 1, 1)).getUTCDay() + 6) % 7);
	const leadingBlanks = $derived(
		data.weekStart === 'monday' ? firstWeekday : (firstWeekday + 1) % 7
	);

	function dateOf(day: number): string {
		return `${data.monthParam}-${String(day).padStart(2, '0')}`;
	}

	function weekdayShort(day: number): string {
		return WEEKDAYS_MON[(firstWeekday + day - 1) % 7];
	}

	const statusIcon: Record<string, string> = {
		verified: '✅',
		done: '⏳',
		missed: '😿'
	};
</script>

<svelte:head>
	<title>Calendar — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-5xl space-y-4 p-4 pb-16">
	<div class="flex items-center justify-between pt-4">
		<h1 class="text-2xl font-bold text-slate-800">
			{MONTH_LABELS[data.month - 1]}
			{data.year}
		</h1>
		<div class="flex gap-2">
			<a href="/calendar?month={data.prev}" class="flex min-w-11 items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm active:bg-slate-100">←</a>
			<a href="/calendar" class="flex items-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm active:bg-slate-100">Today</a>
			<a href="/calendar?month={data.next}" class="flex min-w-11 items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm active:bg-slate-100">→</a>
		</div>
	</div>

	<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
		{#each data.people as person}
			<span class="flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-full" style="background: {person.color}"></span>
				{person.name}
			</span>
		{/each}
		<span class="flex items-center gap-1.5">
			<span class="h-2.5 w-2.5 rounded-full bg-slate-300"></span>
			rotation (turn not decided yet)
		</span>
	</div>

	<!-- Phones: agenda list — only days that have something (today always shows). -->
	<div class="space-y-2 sm:hidden">
		{#each Array(data.daysInMonth) as _, i}
			{@const date = dateOf(i + 1)}
			{@const dayEntries = data.entries[date] ?? []}
			{#if dayEntries.length > 0 || date === data.today}
				<div
					class="rounded-xl border p-3 {date === data.today
						? 'border-slate-800 bg-white'
						: 'border-slate-200 bg-white/70'}"
				>
					<p
						class="text-xs font-semibold tracking-wide uppercase {date === data.today
							? 'text-slate-800'
							: 'text-slate-400'}"
					>
						{weekdayShort(i + 1)}
						{i + 1}{date === data.today ? ' · today' : ''}
					</p>
					{#if dayEntries.length === 0}
						<p class="mt-1 text-sm text-slate-400">Nothing due.</p>
					{:else}
						<ul class="mt-1.5 space-y-1">
							{#each dayEntries as entry}
								<li
									class="flex items-center gap-2 text-sm {entry.status === 'planned'
										? 'opacity-60'
										: ''}"
								>
									<span
										class="h-2.5 w-2.5 shrink-0 rounded-full"
										style="background: {entry.color ?? '#cbd5e1'}"
									></span>
									<span class="min-w-0 flex-1 truncate text-slate-700 {entry.mine ? 'font-semibold' : ''}">
										{statusIcon[entry.status] ?? ''}{entry.title}
									</span>
									<span class="shrink-0 text-xs text-slate-400">
										{entry.personName ?? 'rotation'}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		{/each}
	</div>

	<!-- Tablet/desktop: month grid. -->
	<div class="hidden overflow-x-auto sm:block">
		<div class="grid min-w-[40rem] grid-cols-7 gap-1">
			{#each weekdayLabels as label}
				<div class="px-1 py-1 text-center text-xs font-semibold tracking-wide text-slate-400 uppercase">
					{label}
				</div>
			{/each}

			{#each Array(leadingBlanks) as _}
				<div></div>
			{/each}

			{#each Array(data.daysInMonth) as _, i}
				{@const date = dateOf(i + 1)}
				{@const dayEntries = data.entries[date] ?? []}
				<div
					class="min-h-24 rounded-lg border p-1.5 {date === data.today
						? 'border-slate-800 bg-white'
						: 'border-slate-200 bg-white/70'}"
				>
					<p class="text-xs font-semibold {date === data.today ? 'text-slate-800' : 'text-slate-400'}">
						{i + 1}
					</p>
					<ul class="mt-1 space-y-0.5">
						{#each dayEntries as entry}
							<li
								class="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight {entry.mine
									? 'bg-slate-100 font-semibold'
									: ''} {entry.status === 'planned' ? 'opacity-60' : ''}"
								title="{entry.title}{entry.personName ? ` — ${entry.personName}` : ' — rotation'}"
							>
								<span
									class="h-2 w-2 shrink-0 rounded-full"
									style="background: {entry.color ?? '#cbd5e1'}"
								></span>
								<span class="truncate text-slate-700">
									{statusIcon[entry.status] ?? ''}{entry.title}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</div>
</main>
