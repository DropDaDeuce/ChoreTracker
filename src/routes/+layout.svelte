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
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="min-h-screen bg-slate-100">
	{#if data.user}
		<header class="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
			<div class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
				<a href="/dashboard" class="text-lg font-bold text-slate-800">🧹 ChoreTracker</a>
				<nav class="flex flex-1 flex-wrap items-center gap-1 text-sm">
					{#each links as link}
						<a
							href={link.href}
							class="rounded-full px-3 py-1.5 font-medium {page.url.pathname.startsWith(link.href)
								? 'bg-slate-800 text-white'
								: 'text-slate-600 hover:bg-slate-100'}"
						>
							{link.label}
						</a>
					{/each}
				</nav>
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
		</header>
	{/if}

	{@render children()}
</div>
