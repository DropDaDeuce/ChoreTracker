import { db } from '$lib/server/db';
import { CURRENCY_SYMBOL_KEY, getSettingOr } from '$lib/server/settings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: locals.user,
		currency: getSettingOr(db, CURRENCY_SYMBOL_KEY)
	};
};
