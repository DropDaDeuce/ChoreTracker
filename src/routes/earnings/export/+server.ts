import { requireUser } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { allowanceLedger, users } from '$lib/server/db/schema';
import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

function csvField(value: string): string {
	return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Full ledger history as CSV. Kids get their own; adults can pick anyone. */
export const GET: RequestHandler = ({ locals, url }) => {
	const user = requireUser(locals);
	const personId = Number(url.searchParams.get('person') ?? user.id);
	if (user.role !== 'adult' && personId !== user.id) {
		error(403, 'You can only export your own history.');
	}

	const person = db.select().from(users).where(eq(users.id, personId)).get();
	if (!person) error(404, 'Person not found');

	const rows = db
		.select({
			createdAt: allowanceLedger.createdAt,
			type: allowanceLedger.type,
			amountCents: allowanceLedger.amountCents,
			note: allowanceLedger.note
		})
		.from(allowanceLedger)
		.where(eq(allowanceLedger.userId, personId))
		.orderBy(asc(allowanceLedger.createdAt), asc(allowanceLedger.id))
		.all();

	const lines = [
		'date,type,amount,note',
		...rows.map((row) =>
			[
				row.createdAt.toISOString(),
				row.type,
				(row.amountCents / 100).toFixed(2),
				csvField(row.note)
			].join(',')
		)
	];

	const safeName = person.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	return new Response(lines.join('\n') + '\n', {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="choretracker-${safeName}.csv"`
		}
	});
};
