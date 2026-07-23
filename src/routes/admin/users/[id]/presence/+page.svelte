<script lang="ts">
	import { enhance } from '$app/forms';
	import { MONTH_LABELS } from '$lib/choreText';
	import { describePresenceRule, WEEKDAY_FULL } from '$lib/presenceText';
	import { submit } from '$lib/submit';

	let { data, form } = $props();

	const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const weekdayLabels = $derived(
		data.weekStart === 'monday' ? WEEKDAYS_MON : ['Sun', ...WEEKDAYS_MON.slice(0, 6)]
	);
	const firstWeekday = $derived(
		(new Date(Date.UTC(data.year, data.month - 1, 1)).getUTCDay() + 6) % 7
	);
	const leadingBlanks = $derived(
		data.weekStart === 'monday' ? firstWeekday : (firstWeekday + 1) % 7
	);

	// Context menu state (right-click on a day)
	let menu = $state<null | { x: number; y: number; day: (typeof data.days)[number] }>(null);

	let toggleForm = $state<HTMLFormElement>();
	let resetForm = $state<HTMLFormElement>();
	let ruleForm = $state<HTMLFormElement>();
	let actionDate = $state('');
	let rule = $state({ kind: 'weekly', isHome: 'false', weekday: 0, anchorDate: '', dayOfMonth: 1 });

	function weekdayOf(date: string): number {
		const [y, m, d] = date.split('-').map(Number);
		return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
	}
	function dayNumOf(date: string): number {
		return Number(date.slice(8, 10));
	}

	function clickDay(day: (typeof data.days)[number]) {
		menu = null;
		actionDate = day.date;
		toggleForm?.requestSubmit();
	}

	function openMenu(event: MouseEvent, day: (typeof data.days)[number]) {
		event.preventDefault();
		menu = { x: event.clientX, y: event.clientY, day };
	}

	function submitReset(date: string) {
		menu = null;
		actionDate = date;
		resetForm?.requestSubmit();
	}

	function submitRule(kind: 'weekly' | 'biweekly' | 'monthly', isHome: boolean, date: string) {
		menu = null;
		rule = {
			kind,
			isHome: String(isHome),
			weekday: weekdayOf(date),
			anchorDate: date,
			dayOfMonth: dayNumOf(date)
		};
		// Let the bound inputs update before submitting.
		queueMicrotask(() => ruleForm?.requestSubmit());
	}
</script>

<svelte:window onclick={() => (menu = null)} />

<svelte:head>
	<title>Days at home — {data.person.name}</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4 pb-16">
	<div>
		<a href="/admin/users" class="text-sm text-slate-500 hover:text-slate-800">← People</a>
		<div class="mt-1 flex items-center gap-3">
			<span
				class="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white"
				style="background: {data.person.avatarColor}"
			>
				{data.person.name.slice(0, 1).toUpperCase()}
			</span>
			<h1 class="text-2xl font-bold text-slate-800">{data.person.name} — days at home</h1>
		</div>
		<p class="mt-2 text-sm text-slate-500">
			Tap a day to flip it. Right-click / long-press (or use the pattern form below) for
			repeating schedules. No chores are assigned on away days — rotations skip to whoever's home.
		</p>
	</div>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{form.message}</p>
	{/if}

	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold text-slate-800">{MONTH_LABELS[data.month - 1]} {data.year}</h2>
		<div class="flex gap-2">
			<a href="?month={data.prev}" class="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm">←</a>
			<a href="?" class="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm">Today</a>
			<a href="?month={data.next}" class="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm">→</a>
		</div>
	</div>

	<div class="grid grid-cols-7 gap-1.5">
		{#each weekdayLabels as label}
			<div class="py-1 text-center text-xs font-semibold tracking-wide text-slate-400 uppercase">{label}</div>
		{/each}
		{#each Array(leadingBlanks) as _}
			<div></div>
		{/each}
		{#each data.days as day (day.date)}
			<button
				type="button"
				onclick={() => clickDay(day)}
				oncontextmenu={(e) => openMenu(e, day)}
				class="relative flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition sm:h-16
					{day.home
					? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
					: 'border-slate-300 bg-slate-200 text-slate-500 hover:bg-slate-300'}
					{day.date === data.today ? 'ring-2 ring-slate-800' : ''}"
				title="{day.date}: {day.home ? 'home' : 'away'}{day.override ? ' (day override)' : ''} — click to flip, right-click for patterns"
			>
				<span>{dayNumOf(day.date)}</span>
				<span class="text-[10px] font-normal">{day.home ? '🏠' : '✈️'}</span>
				{#if day.override}
					<span class="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" title="single-day override"></span>
				{/if}
			</button>
		{/each}
	</div>

	<p class="flex flex-wrap gap-x-4 text-xs text-slate-500">
		<span>🏠 home</span><span>✈️ away</span>
		<span><span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span>day override (beats patterns)</span>
	</p>

	<section class="rounded-2xl bg-white p-5 shadow-sm">
		<h2 class="text-sm font-semibold tracking-wide text-slate-500 uppercase">Repeating patterns</h2>
		{#if data.rules.length === 0}
			<p class="mt-2 text-sm text-slate-400">None — {data.person.name} is home every day unless a day is clicked off.</p>
		{:else}
			<ul class="mt-2 divide-y divide-slate-100">
				{#each data.rules as r (r.id)}
					<li class="flex items-center gap-2 py-2 text-sm">
						<span class="flex-1 text-slate-700">{describePresenceRule(r)}</span>
						<form method="POST" action="?/deleteRule" use:enhance={submit()}>
							<input type="hidden" name="ruleId" value={r.id} />
							<button class="text-xs font-medium text-red-500 hover:text-red-700">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-xs text-slate-400">Newer patterns win when they overlap.</p>
		{/if}

		<form method="POST" action="?/addRule" use:enhance={submit()} class="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
			<label class="block">
				<span class="mb-1 block text-xs font-medium text-slate-500">Mark as</span>
				<select name="isHome" class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
					<option value="false">Away</option>
					<option value="true">Home</option>
				</select>
			</label>
			<label class="block">
				<span class="mb-1 block text-xs font-medium text-slate-500">Repeat</span>
				<select name="kind" bind:value={rule.kind} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
					<option value="weekly">Every week</option>
					<option value="biweekly">Every other week</option>
					<option value="monthly">Day of month</option>
				</select>
			</label>
			{#if rule.kind === 'weekly' || rule.kind === 'biweekly'}
				<label class="block">
					<span class="mb-1 block text-xs font-medium text-slate-500">Weekday</span>
					<select name="weekday" class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
						{#each WEEKDAY_FULL as label, i}
							<option value={i}>{label}</option>
						{/each}
					</select>
				</label>
			{/if}
			{#if rule.kind === 'biweekly'}
				<label class="block">
					<span class="mb-1 block text-xs font-medium text-slate-500">Starting from</span>
					<input name="anchorDate" type="date" value={data.today} class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
				</label>
			{/if}
			{#if rule.kind === 'monthly'}
				<label class="block">
					<span class="mb-1 block text-xs font-medium text-slate-500">Day</span>
					<input name="dayOfMonth" type="number" min="1" max="31" value="1" class="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
				</label>
			{/if}
			<button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Add pattern</button>
		</form>
	</section>

	<!-- hidden forms driven by day clicks / context menu -->
	<form bind:this={toggleForm} method="POST" action="?/toggleDay" use:enhance={submit()} class="hidden">
		<input type="hidden" name="date" value={actionDate} />
	</form>
	<form bind:this={resetForm} method="POST" action="?/resetDay" use:enhance={submit()} class="hidden">
		<input type="hidden" name="date" value={actionDate} />
	</form>
	<form bind:this={ruleForm} method="POST" action="?/addRule" use:enhance={submit()} class="hidden">
		<input type="hidden" name="kind" value={rule.kind} />
		<input type="hidden" name="isHome" value={rule.isHome} />
		<input type="hidden" name="weekday" value={rule.weekday} />
		<input type="hidden" name="anchorDate" value={rule.anchorDate} />
		<input type="hidden" name="dayOfMonth" value={rule.dayOfMonth} />
	</form>

	{#if menu}
		{@const d = menu.day}
		{@const wd = WEEKDAY_FULL[weekdayOf(d.date)]}
		{@const dom = dayNumOf(d.date)}
		{@const target = d.home ? 'Away' : 'Home'}
		<div
			class="fixed z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
			style="left: min({menu.x}px, calc(100vw - 16.5rem)); top: min({menu.y}px, calc(100dvh - 15rem))"
		>
			<p class="px-3 py-1.5 text-xs font-semibold text-slate-400">{d.date} — {d.home ? 'home' : 'away'}</p>
			<button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onclick={() => clickDay(d)}>
				{target} just this day
			</button>
			{#if d.override}
				<button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onclick={() => submitReset(d.date)}>
					Reset this day to pattern
				</button>
			{/if}
			<hr class="my-1 border-slate-100" />
			<button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onclick={() => submitRule('weekly', !d.home, d.date)}>
				{target} every {wd}
			</button>
			<button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onclick={() => submitRule('biweekly', !d.home, d.date)}>
				{target} every other {wd} (starting here)
			</button>
			<button type="button" class="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onclick={() => submitRule('monthly', !d.home, d.date)}>
				{target} on the {dom}{dom === 1 || dom === 21 || dom === 31 ? 'st' : dom === 2 || dom === 22 ? 'nd' : dom === 3 || dom === 23 ? 'rd' : 'th'} of each month
			</button>
		</div>
	{/if}
</main>
