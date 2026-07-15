<script lang="ts">
	let { value = $bindable(''), maxLength = 6 }: { value?: string; maxLength?: number } = $props();

	function press(digit: string) {
		if (value.length < maxLength) value += digit;
	}
	function backspace() {
		value = value.slice(0, -1);
	}
</script>

<div class="mx-auto w-full max-w-[16rem] select-none">
	<div class="mb-4 flex h-8 items-center justify-center gap-3" aria-label="PIN entry">
		{#each Array(maxLength) as _, i}
			<span
				class="h-3.5 w-3.5 rounded-full transition-colors {i < value.length
					? 'bg-slate-800'
					: 'bg-slate-300'}"
			></span>
		{/each}
	</div>
	<div class="grid grid-cols-3 gap-2">
		{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as digit}
			<button
				type="button"
				class="rounded-xl bg-white py-4 text-xl font-semibold text-slate-800 shadow active:bg-slate-200"
				onclick={() => press(digit)}
			>
				{digit}
			</button>
		{/each}
		<button
			type="button"
			class="rounded-xl py-4 text-sm font-medium text-slate-500 active:bg-slate-200"
			onclick={() => (value = '')}
		>
			Clear
		</button>
		<button
			type="button"
			class="rounded-xl bg-white py-4 text-xl font-semibold text-slate-800 shadow active:bg-slate-200"
			onclick={() => press('0')}
		>
			0
		</button>
		<button
			type="button"
			class="rounded-xl py-4 text-xl text-slate-500 active:bg-slate-200"
			onclick={backspace}
			aria-label="Backspace"
		>
			⌫
		</button>
	</div>
</div>
