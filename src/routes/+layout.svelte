<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { data, children } = $props();

	const links = $derived(
		data.user
			? [
					{ href: '/dashboard', label: 'Today' },
					{ href: '/chores', label: 'My chores' },
					{ href: '/calendar', label: 'Calendar' },
					{ href: '/earnings', label: 'Earnings' },
					{ href: '/leaderboard', label: 'Stars' },
					...(data.user.role === 'adult'
						? [
								{ href: '/verify', label: 'Verify' },
								{ href: '/admin/chores', label: 'Chores' },
								{ href: '/admin/users', label: 'People' },
								{ href: '/admin/settings', label: 'Settings' }
							]
						: [])
				]
			: []
	);

	let navEl = $state<HTMLElement>();

	// Keep the active pill visible when the nav strip scrolls horizontally on phones.
	$effect(() => {
		page.url.pathname;
		navEl
			?.querySelector('[data-active]')
			?.scrollIntoView({ inline: 'center', block: 'nearest' });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-slate-100">
	{#if data.user}
		<header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
			<div class="mx-auto max-w-3xl px-4">
				<div class="flex items-center justify-between py-2">
					<a href="/dashboard" class="text-lg font-bold text-slate-800">🧹 ChoreTracker</a>
					<form method="POST" action="/logout" class="flex items-center gap-2">
						<span
							class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
							style="background: {data.user.avatarColor}"
						>
							{data.user.name.slice(0, 1).toUpperCase()}
						</span>
						<button class="text-sm font-medium text-slate-500 hover:text-slate-800">Log out</button>
					</form>
				</div>
				<nav
					bind:this={navEl}
					class="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-2 text-sm sm:mx-0 sm:flex-wrap sm:px-0"
				>
					{#each links as link}
						<a
							href={link.href}
							data-active={page.url.pathname.startsWith(link.href) ? '' : undefined}
							class="shrink-0 rounded-full px-3 py-1.5 font-medium whitespace-nowrap {page.url.pathname.startsWith(
								link.href
							)
								? 'bg-slate-800 text-white'
								: 'text-slate-600 hover:bg-slate-100'}"
						>
							{link.label}
						</a>
					{/each}
				</nav>
			</div>
		</header>
	{/if}

	{@render children()}
</div>
