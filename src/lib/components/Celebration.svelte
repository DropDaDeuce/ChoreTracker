<script module lang="ts">
	export interface CelebrationData {
		title: string;
		sub?: string;
		emoji?: string;
	}
</script>

<script lang="ts">
	let {
		celebration,
		ondone
	}: { celebration: CelebrationData | null; ondone: () => void } = $props();

	$effect(() => {
		if (!celebration) return;
		const timer = setTimeout(ondone, 2200);
		return () => clearTimeout(timer);
	});

	const PIECES = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];
</script>

{#if celebration}
	<div
		class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
		role="status"
		aria-live="polite"
	>
		<div class="confetti" aria-hidden="true">
			{#each PIECES as color, i}
				<span style="--c: {color}; --i: {i}"></span>
				<span class="alt" style="--c: {color}; --i: {i}"></span>
			{/each}
		</div>
		<div class="pop rounded-3xl bg-white/95 px-8 py-6 text-center shadow-xl">
			<p class="text-4xl">{celebration.emoji ?? '🎉'}</p>
			<p class="mt-2 text-lg font-bold text-slate-800">{celebration.title}</p>
			{#if celebration.sub}
				<p class="mt-0.5 text-base font-semibold text-emerald-700">{celebration.sub}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.pop {
		animation: pop-in 0.35s cubic-bezier(0.2, 1.4, 0.4, 1) both;
	}
	@keyframes pop-in {
		from {
			transform: scale(0.6);
			opacity: 0;
		}
	}

	.confetti {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.confetti span {
		position: absolute;
		top: -3vh;
		left: calc(4% + var(--i) * 16%);
		width: 0.6rem;
		height: 0.9rem;
		background: var(--c);
		border-radius: 2px;
		animation: fall 1.9s ease-in calc(var(--i) * 0.09s) both;
	}
	.confetti span.alt {
		left: calc(12% + var(--i) * 16%);
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		animation-duration: 2.1s;
		animation-delay: calc(0.25s + var(--i) * 0.07s);
	}
	@keyframes fall {
		to {
			transform: translateY(105vh) rotate(540deg);
			opacity: 0.7;
		}
	}
</style>
