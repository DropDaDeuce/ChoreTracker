<script lang="ts">
	let {
		value = $bindable(''),
		name,
		options,
		allowNone = false
	}: {
		value?: string;
		name: string;
		options: string[];
		allowNone?: boolean;
	} = $props();

	// Free-typed emoji (Win+. / phone keyboard) still works via the small box.
	let custom = $state('');

	function pick(icon: string) {
		value = icon;
		custom = '';
	}
</script>

<div class="flex flex-wrap items-center gap-1.5">
	<input type="hidden" {name} {value} />
	{#if allowNone}
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-medium {value === ''
				? 'border-slate-800 bg-slate-800 text-white'
				: 'border-slate-300 text-slate-400 hover:border-slate-500'}"
			onclick={() => pick('')}
			aria-label="No icon"
		>
			none
		</button>
	{/if}
	{#each options as icon (icon)}
		<button
			type="button"
			class="flex h-9 w-9 items-center justify-center rounded-lg border text-lg {value === icon
				? 'border-slate-800 bg-slate-100 ring-1 ring-slate-800'
				: 'border-slate-300 hover:border-slate-500'}"
			onclick={() => pick(icon)}
			aria-label="Icon {icon}"
			aria-pressed={value === icon}
		>
			{icon}
		</button>
	{/each}
	<input
		class="h-9 w-14 rounded-lg border border-slate-300 px-1 text-center text-lg {value !== '' &&
		!options.includes(value)
			? 'border-slate-800 ring-1 ring-slate-800'
			: ''}"
		placeholder="✏️"
		maxlength="16"
		bind:value={custom}
		oninput={() => {
			if (custom.trim()) value = custom.trim();
		}}
		aria-label="Type your own emoji"
		title="Type any emoji (Windows: Win + period)"
	/>
</div>
