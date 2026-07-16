<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Settings — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<h1 class="pt-4 text-2xl font-bold text-slate-800">Settings</h1>

	<form method="POST" use:enhance class="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Currency symbol</span>
				<input
					name="currencySymbol"
					required
					maxlength="4"
					value={data.settings.currencySymbol}
					class="w-full rounded-lg border border-slate-300 px-3 py-2"
				/>
			</label>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-slate-700">Week starts on</span>
				<select name="weekStart" class="w-full rounded-lg border border-slate-300 px-3 py-2">
					<option value="monday" selected={data.settings.weekStart === 'monday'}>Monday</option>
					<option value="sunday" selected={data.settings.weekStart === 'sunday'}>Sunday</option>
				</select>
			</label>
		</div>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">
				Reminder penalty (% taken off after exactly one reminder)
			</span>
			<input
				name="reminderPenaltyPercent"
				type="number"
				min="0"
				max="100"
				value={data.settings.reminderPenaltyPercent}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
			<span class="mt-1 block text-xs text-slate-400">
				Two or more reminders always pay nothing.
			</span>
		</label>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">
				Undo window for auto-approved chores (minutes)
			</span>
			<input
				name="undoWindowMinutes"
				type="number"
				min="0"
				max="1440"
				value={data.settings.undoWindowMinutes}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
		</label>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-slate-700">
				Nightly backups to keep (0 = off)
			</span>
			<input
				name="backupKeepCount"
				type="number"
				min="0"
				max="365"
				value={data.settings.backupKeepCount}
				class="w-full rounded-lg border border-slate-300 px-3 py-2"
			/>
			<span class="mt-1 block text-xs text-slate-400">
				Written automatically each night to <code class="rounded bg-slate-100 px-1">data/backups</code>.
			</span>
		</label>

		{#if form?.message}
			<p class="text-sm font-medium text-red-600">{form.message}</p>
		{/if}
		{#if form?.success}
			<p class="text-sm font-medium text-emerald-700">Saved ✓</p>
		{/if}

		<button class="rounded-xl bg-slate-800 px-8 py-3 font-semibold text-white shadow">
			Save settings
		</button>
	</form>

	<a
		href="/admin/backup"
		class="block rounded-2xl bg-white p-5 shadow-sm transition hover:shadow"
	>
		<p class="font-semibold text-slate-800">💾 Backup & restore</p>
		<p class="mt-0.5 text-sm text-slate-500">
			Download the whole household as one file, or restore from an earlier backup.
		</p>
	</a>
</main>
