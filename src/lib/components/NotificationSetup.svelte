<script lang="ts">
	import { onMount } from 'svelte';

	let { vapidPublicKey }: { vapidPublicKey: string } = $props();

	// 'unsupported' also covers plain-HTTP LAN pages: browsers require a
	// secure context (HTTPS or localhost) for push.
	let state = $state<'unsupported' | 'off' | 'on' | 'busy'>('unsupported');

	function keyBytes(base64url: string): Uint8Array {
		const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
		const raw = atob((base64url + pad).replaceAll('-', '+').replaceAll('_', '/'));
		return Uint8Array.from(raw, (c) => c.charCodeAt(0));
	}

	onMount(async () => {
		if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.isSecureContext) {
			return;
		}
		const registration = await navigator.serviceWorker.ready;
		const existing = await registration.pushManager.getSubscription();
		state = existing ? 'on' : 'off';
	});

	async function enable() {
		state = 'busy';
		try {
			if ((await Notification.requestPermission()) !== 'granted') {
				state = 'off';
				return;
			}
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: keyBytes(vapidPublicKey).buffer as ArrayBuffer
			});
			await fetch('/push/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(subscription.toJSON())
			});
			state = 'on';
		} catch (err) {
			console.error('push subscribe failed', err);
			state = 'off';
		}
	}

	async function disable() {
		state = 'busy';
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();
			if (subscription) {
				await fetch('/push/subscribe', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: subscription.endpoint })
				});
				await subscription.unsubscribe();
			}
		} finally {
			state = 'off';
		}
	}
</script>

{#if state === 'off'}
	<button
		type="button"
		onclick={enable}
		class="w-full rounded-2xl bg-white p-4 text-left shadow-sm transition hover:shadow"
	>
		<p class="font-semibold text-slate-800">🔔 Turn on notifications</p>
		<p class="mt-0.5 text-sm text-slate-500">
			Get a ping on this device when someone reminds you, verifies your chore, or asks to swap.
		</p>
	</button>
{:else if state === 'on'}
	<p class="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-2.5 text-xs text-slate-400">
		<span>🔔 Notifications are on for this device</span>
		<button type="button" onclick={disable} class="font-medium underline hover:text-slate-600">
			turn off
		</button>
	</p>
{:else if state === 'busy'}
	<p class="rounded-2xl bg-white/70 px-4 py-2.5 text-xs text-slate-400">Setting up…</p>
{/if}
