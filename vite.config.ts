import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Kit's built-in check needs a single fixed ORIGIN, but this app is
			// reached as localhost, a LAN IP, AND a hostname at once. We enforce
			// the equivalent same-host check ourselves in hooks.server.ts.
			csrf: { checkOrigin: false },

			adapter: adapter()
		})
	]
});
