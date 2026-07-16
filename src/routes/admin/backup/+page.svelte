<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head>
	<title>Backup — ChoreTracker</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-4 pb-16">
	<h1 class="pt-4 text-2xl font-bold text-slate-800">Backup & restore</h1>

	<section class="rounded-2xl bg-white p-6 shadow-sm">
		<h2 class="font-semibold text-slate-800">Download a backup</h2>
		<p class="mt-1 text-sm text-slate-500">
			One zip with the whole household: every person, chore, history entry, and proof photo.
			Safe to run while the app is in use. Keep a copy somewhere off this machine!
		</p>
		<a
			href="/admin/backup/download"
			class="mt-4 inline-block rounded-xl bg-slate-800 px-6 py-2.5 font-semibold text-white shadow"
		>
			⬇ Download backup
		</a>
	</section>

	<section class="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm">
		<h2 class="font-semibold text-red-700">Restore from a backup</h2>
		<p class="mt-1 text-sm text-slate-500">
			Replaces <strong>everything</strong> with the backup's contents. The current data is
			snapshotted next to the database file first (<code class="rounded bg-slate-100 px-1">.pre-restore</code>),
			just in case. Everyone may need to log in again afterwards.
		</p>
		<form
			method="POST"
			action="?/restore"
			enctype="multipart/form-data"
			use:enhance
			class="mt-4 space-y-4"
		>
			<input
				type="file"
				name="backup"
				accept=".zip,.db"
				required
				class="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-4 file:py-2 file:text-sm file:font-semibold"
			/>
			<label class="flex items-center gap-2 text-sm text-slate-700">
				<input type="checkbox" name="confirm" class="h-4 w-4" />
				I understand this replaces all current data.
			</label>

			{#if form?.message && !form?.success}
				<p class="text-sm font-medium text-red-600">{form.message}</p>
			{/if}
			{#if form?.success}
				<p class="text-sm font-medium text-emerald-700">✓ {form.message}</p>
			{/if}

			<button class="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white shadow">
				Restore
			</button>
		</form>
	</section>
</main>
