import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Shared `use:enhance` handler for every form in the app: while the request is
 * in flight the form gets `data-submitting` (styled in app.css) and its submit
 * buttons are disabled so a double-tap can't double-post. `onSuccess` fires
 * after the action succeeded AND the page data has been refreshed.
 */
export function submit(onSuccess?: () => void): SubmitFunction {
	return ({ formElement }) => {
		const buttons = [
			...formElement.querySelectorAll<HTMLButtonElement>('button:not([type="button"])'),
			// Buttons living outside the form but tied to it via form="id".
			...(formElement.id
				? document.querySelectorAll<HTMLButtonElement>(`button[form="${formElement.id}"]`)
				: [])
		];
		formElement.setAttribute('data-submitting', '');
		for (const button of buttons) button.disabled = true;
		return async ({ result, update }) => {
			await update();
			formElement.removeAttribute('data-submitting');
			for (const button of buttons) button.disabled = false;
			if (result.type === 'success') onSuccess?.();
		};
	};
}
