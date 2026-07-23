<script lang="ts">
	import { page } from '$app/state';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { data, children } = $props();

	interface NavLink {
		href: string;
		label: string;
		icon: string;
	}

	const KID_LINKS: NavLink[] = [
		{ href: '/dashboard', label: 'Today', icon: '☀️' },
		{ href: '/chores', label: 'My chores', icon: '🧹' },
		{ href: '/calendar', label: 'Calendar', icon: '📅' },
		{ href: '/earnings', label: 'Earnings', icon: '💰' },
		{ href: '/leaderboard', label: 'Stars', icon: '⭐' }
	];
	const ADULT_LINKS: NavLink[] = [
		{ href: '/verify', label: 'Verify', icon: '✅' },
		{ href: '/admin/chores', label: 'House', icon: '🏡' },
		{ href: '/admin/users', label: 'People', icon: '👪' },
		{ href: '/admin/settings', label: 'Settings', icon: '⚙️' }
	];

	const links = $derived(
		data.user
			? [
					...KID_LINKS,
					{ href: '/board', label: 'Board', icon: '📺' },
					...(data.user.role === 'adult' ? ADULT_LINKS : [])
				]
			: []
	);

	// The family board is a kiosk: fullscreen, no app chrome around it.
	const kiosk = $derived(page.url.pathname.startsWith('/board'));

	// Bottom bar: kids fit in five tabs; adults get their four most-used plus
	// a "More" sheet holding the rest.
	const isAdult = $derived(data.user?.role === 'adult');
	const tabs = $derived(
		isAdult
			? [KID_LINKS[0], ADULT_LINKS[0], ADULT_LINKS[1], ADULT_LINKS[2]]
			: KID_LINKS
	);
	const moreLinks = $derived(
		isAdult ? [KID_LINKS[1], KID_LINKS[2], KID_LINKS[3], KID_LINKS[4], ADULT_LINKS[3]] : []
	);
	let moreOpen = $state(false);
	const moreActive = $derived(moreLinks.some((l) => page.url.pathname.startsWith(l.href)));

	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}

	let navEl = $state<HTMLElement>();

	// Keep the active pill visible when the desktop nav strip wraps/scrolls.
	$effect(() => {
		page.url.pathname;
		moreOpen = false;
		navEl
			?.querySelector('[data-active]')
			?.scrollIntoView({ inline: 'center', block: 'nearest' });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<!-- Touch devices (phones AND tablets) navigate via the bottom tab bar; the
     top pill strip is for mouse/trackpad. Keyed off pointer type, not width —
     an iPad is wider than any phone breakpoint but is still a touch device. -->
<div class="min-h-screen bg-slate-100 {data.user && !kiosk ? 'pb-20 sm:pointer-fine:pb-0' : ''}">
	{#if data.user && !kiosk}
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
				<!-- Mouse/trackpad: pill strip. Touch devices use the bottom tab bar. -->
				<nav
					bind:this={navEl}
					class="no-scrollbar hidden items-center gap-1 pb-2 text-sm sm:pointer-fine:flex sm:pointer-fine:flex-wrap"
				>
					{#each links as link}
						<a
							href={link.href}
							data-active={isActive(link.href) ? '' : undefined}
							class="shrink-0 rounded-full px-3 py-1.5 font-medium whitespace-nowrap {isActive(link.href)
								? 'bg-slate-800 text-white'
								: 'text-slate-600 hover:bg-slate-100'}"
						>
							{link.label}
							{#if link.href === '/verify' && data.verifyQueueCount > 0}
								<span class="ml-1 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">
									{data.verifyQueueCount}
								</span>
							{/if}
						</a>
					{/each}
				</nav>
			</div>
		</header>
	{/if}

	{@render children()}

	{#if data.user && !kiosk}
		<!-- Touch bottom tab bar: thumb-reachable, five slots. Also shown on
		     tablets — width says desktop, the finger says otherwise. -->
		<nav
			class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:pointer-fine:hidden"
			aria-label="Primary"
		>
			{#if moreOpen}
				<div class="absolute right-2 bottom-full mb-2 w-44 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
					{#each moreLinks as link}
						<a
							href={link.href}
							class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium {isActive(link.href)
								? 'bg-slate-100 text-slate-900'
								: 'text-slate-600'}"
						>
							<span>{link.icon}</span>
							{link.label}
						</a>
					{/each}
				</div>
			{/if}
			<!-- Capped width so tabs stay finger-sized clusters on wide tablets. -->
			<div class="mx-auto grid max-w-lg grid-cols-5">
				{#each tabs as tab}
					<a
						href={tab.href}
						class="relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium {isActive(tab.href)
							? 'text-slate-900'
							: 'text-slate-400'}"
						aria-current={isActive(tab.href) ? 'page' : undefined}
					>
						<span class="text-lg leading-none {isActive(tab.href) ? '' : 'grayscale opacity-70'}">
							{tab.icon}
						</span>
						{tab.label}
						{#if tab.href === '/verify' && data.verifyQueueCount > 0}
							<span
								class="absolute top-0.5 right-1/2 -mr-6 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950"
							>
								{data.verifyQueueCount}
							</span>
						{/if}
					</a>
				{/each}
				{#if isAdult}
					<button
						type="button"
						class="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium {moreActive || moreOpen
							? 'text-slate-900'
							: 'text-slate-400'}"
						onclick={() => (moreOpen = !moreOpen)}
						aria-expanded={moreOpen}
					>
						<span class="text-lg leading-none {moreActive || moreOpen ? '' : 'grayscale opacity-70'}">☰</span>
						More
					</button>
				{/if}
			</div>
		</nav>
	{/if}
</div>
