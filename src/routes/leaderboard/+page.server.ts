import { requireUser } from '$lib/server/auth';
import { startOfWeek, todayLocal } from '$lib/server/dates';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { getSettingOr, WEEK_START_KEY } from '$lib/server/settings';
import { currentStreak, pointsTotal } from '$lib/server/stats';
import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireUser(locals);
	const today = todayLocal();
	const weekStart = getSettingOr(db, WEEK_START_KEY) as 'monday' | 'sunday';
	const weekFrom = startOfWeek(today, weekStart);
	const monthFrom = `${today.slice(0, 7)}-01`;

	const people = db
		.select({ id: users.id, name: users.name, role: users.role, avatarColor: users.avatarColor })
		.from(users)
		.where(eq(users.isActive, true))
		.orderBy(asc(users.name))
		.all()
		.map((person) => ({
			...person,
			week: pointsTotal(db, person.id, weekFrom),
			month: pointsTotal(db, person.id, monthFrom),
			allTime: pointsTotal(db, person.id),
			streak: currentStreak(db, person.id, today)
		}))
		.sort((a, b) => b.week - a.week || b.allTime - a.allTime);

	return { board: people, weekFrom };
};
