<script lang="ts">
	let { data } = $props();

	const medals = ['🥇', '🥈', '🥉'];
</script>

<svelte:head>
	<title>Leaderboard — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-3xl space-y-6 p-4 pb-16">
	<div class="pt-4">
		<h1 class="text-2xl font-bold text-slate-800">Leaderboard</h1>
		<p class="text-sm text-slate-500">Points this week (since {data.weekFrom})</p>
	</div>

	{#if data.board.every((p) => p.allTime === 0)}
		<p class="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
			No points yet — do some chores and get them verified! ⭐
		</p>
	{/if}

	<ul class="space-y-3">
		{#each data.board as person, i (person.id)}
			<li class="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
				<span class="w-8 text-center text-2xl">
					{medals[i] ?? `${i + 1}.`}
				</span>
				<span
					class="flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white"
					style="background: {person.avatarColor}"
				>
					{person.name.slice(0, 1).toUpperCase()}
				</span>
				<div class="min-w-0 flex-1">
					<p class="font-semibold text-slate-800">{person.name}</p>
					{#if person.streak >= 2}
						<p class="text-xs font-medium text-orange-600">🔥 {person.streak}-day streak</p>
					{/if}
				</div>
				<div class="flex gap-4 text-center">
					<div>
						<p class="text-lg font-bold text-slate-800">{person.week}</p>
						<p class="text-[10px] tracking-wide text-slate-400 uppercase">week</p>
					</div>
					<div>
						<p class="text-lg font-bold text-slate-600">{person.month}</p>
						<p class="text-[10px] tracking-wide text-slate-400 uppercase">month</p>
					</div>
					<div>
						<p class="text-lg font-bold text-slate-500">{person.allTime}</p>
						<p class="text-[10px] tracking-wide text-slate-400 uppercase">total</p>
					</div>
				</div>
			</li>
		{/each}
	</ul>
</main>
