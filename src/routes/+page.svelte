<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>ChoreTracker</title>
</svelte:head>

<main class="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-100 p-6">
	<div class="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
		<h1 class="text-3xl font-bold text-slate-800">🧹 ChoreTracker</h1>
		<p class="mt-2 text-slate-600">
			Self-hosted household chores, rotations, and kids' allowance.
		</p>

		<div class="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
			<p class="font-semibold">Phase 0 skeleton is up ✅</p>
			<ul class="mt-2 list-inside list-disc space-y-1">
				<li>SvelteKit + Tailwind rendering this page</li>
				<li>SQLite connected via Drizzle (settings rows: {data.settingsCount})</li>
				<li>Migrations applied on boot</li>
			</ul>
		</div>

		<p class="mt-6 text-xs text-slate-400">
			See <code class="rounded bg-slate-100 px-1">docs/PLAN.md</code> for the roadmap.
		</p>
	</div>
</main>
