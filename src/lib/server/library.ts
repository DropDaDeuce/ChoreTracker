import { eq, sql } from 'drizzle-orm';
import { templatesFor, type ChoreTemplate } from '$lib/choreLibrary';
import { todayLocal } from './dates';
import { chores } from './db/schema';
import type { DB } from './db/type';
import { generateDueInstances } from './generate';

/** Default weekly library chores to Saturday (bit 5); families retune later. */
const SATURDAY_MASK = 1 << 5;

/**
 * Create chores from library templates, UNASSIGNED, into a room.
 * `titles` picks which of the room preset's templates to use. Returns how
 * many were created — titles already present in the room are skipped, so
 * re-adding a template can't duplicate it.
 */
export function createFromTemplates(
	db: DB,
	roomId: number | null,
	presetKey: string | null,
	titles: string[],
	today = todayLocal()
): number {
	const templates = templatesFor(presetKey).filter((t) => titles.includes(t.title));
	let created = 0;
	db.transaction((tx) => {
		const existing = new Set(roomTitles(tx, roomId));
		for (const template of templates) {
			if (existing.has(template.title)) continue;
			tx.insert(chores).values(templateColumns(template, roomId, today)).run();
			created++;
		}
	});
	// Unassigned chores generate nothing yet, but keep the invariant anyway.
	generateDueInstances(db, today);
	return created;
}

function roomTitles(tx: DB, roomId: number | null): string[] {
	return tx
		.select({ title: chores.title })
		.from(chores)
		.where(roomId === null ? sql`${chores.roomId} is null` : eq(chores.roomId, roomId))
		.all()
		.map((r) => r.title);
}

function templateColumns(template: ChoreTemplate, roomId: number | null, today: string) {
	return {
		title: template.title,
		description: template.description ?? '',
		roomId,
		icon: template.icon,
		frequency: template.frequency,
		interval: template.interval ?? 1,
		weekdayMask: template.frequency === 'weekly' ? SATURDAY_MASK : 0,
		dayOfMonth:
			template.frequency === 'monthly' || template.frequency === 'yearly'
				? (template.dayOfMonth ?? 1)
				: null,
		monthOfYear: template.frequency === 'yearly' ? (template.monthOfYear ?? 1) : null,
		startDate: today,
		points: template.points,
		allowanceCents: 0 // money is family policy — set it when you assign
	};
}
