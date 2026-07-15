<script lang="ts">
	import ChoreForm from '$lib/components/ChoreForm.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>New chore — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<div class="pt-4">
		<a href="/admin/chores" class="text-sm text-slate-500 hover:text-slate-800">← All chores</a>
		<h1 class="mt-1 text-2xl font-bold text-slate-800">New chore</h1>
	</div>

	<ChoreForm
		people={data.people}
		message={form?.message}
		submitLabel="Create chore"
		currency={data.currency}
		initial={{
			title: '',
			description: '',
			frequency: 'daily',
			interval: 1,
			weekdays: [],
			dayOfMonth: 1,
			monthOfYear: 1,
			startDate: data.today,
			points: 0,
			allowanceDollars: 0,
			requiresVerification: true,
			graceDays: 0,
			assignmentType: 'fixed',
			assigneeIds: data.people[0] ? [data.people[0].id] : []
		}}
	/>
</main>
