/**
 * The built-in room + chore catalog. This ships as CODE, not database rows —
 * a fresh household starts empty and only what the family picks gets created.
 *
 * Templates deliberately carry NO money amounts: allowance is family policy,
 * so everything defaults to $0 and the form nudges you to set your own.
 * Points are a neutral effort hint (5 quick / 10 medium / 15–25 big job).
 */

export interface RoomPreset {
	key: string;
	name: string;
	icon: string;
}

export interface ChoreTemplate {
	title: string;
	icon: string;
	description?: string;
	frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
	/** Daily only: every N days. */
	interval?: number;
	/** Monthly/yearly default day (falls back to 1). */
	dayOfMonth?: number;
	/** Yearly only: 1–12. */
	monthOfYear?: number;
	points: number;
}

export const ROOM_PRESETS: RoomPreset[] = [
	{ key: 'kitchen', name: 'Kitchen', icon: '🍳' },
	{ key: 'bathroom', name: 'Bathroom', icon: '🛁' },
	{ key: 'bedroom', name: 'Bedroom', icon: '🛏️' },
	{ key: 'living', name: 'Living room', icon: '🛋️' },
	{ key: 'dining', name: 'Dining room', icon: '🍽️' },
	{ key: 'laundry', name: 'Laundry', icon: '🧺' },
	{ key: 'entryway', name: 'Entryway', icon: '🚪' },
	{ key: 'playroom', name: 'Playroom', icon: '🧸' },
	{ key: 'office', name: 'Office', icon: '💻' },
	{ key: 'garage', name: 'Garage', icon: '🚗' },
	{ key: 'yard', name: 'Yard & garden', icon: '🌱' },
	{ key: 'pets', name: 'Pets', icon: '🐾' },
	{ key: 'general', name: 'Whole house', icon: '🏠' }
];

export const CHORE_TEMPLATES: Record<string, ChoreTemplate[]> = {
	kitchen: [
		{ title: 'Unload the dishwasher', icon: '🍽️', frequency: 'daily', points: 5 },
		{ title: 'Load the dishwasher', icon: '🧼', frequency: 'daily', points: 5 },
		{ title: 'Wipe the counters', icon: '🧽', frequency: 'daily', points: 5 },
		{ title: 'Sweep the kitchen floor', icon: '🧹', frequency: 'daily', points: 5 },
		{ title: 'Take out the trash', icon: '🗑️', frequency: 'daily', interval: 2, points: 5 },
		{ title: 'Take out the recycling', icon: '♻️', frequency: 'weekly', points: 5 },
		{ title: 'Mop the kitchen floor', icon: '🪣', frequency: 'weekly', points: 10 },
		{ title: 'Clean the microwave', icon: '📦', frequency: 'weekly', points: 10 },
		{ title: 'Clean out the fridge', icon: '🧊', frequency: 'monthly', points: 15, description: 'Toss expired food, wipe the shelves.' },
		{ title: 'Wipe the cabinet doors', icon: '🚪', frequency: 'monthly', points: 10 },
		{ title: 'Clean the oven', icon: '🔥', frequency: 'monthly', points: 20 }
	],
	bathroom: [
		{ title: 'Wipe the sink & counter', icon: '🚿', frequency: 'daily', points: 5 },
		{ title: 'Clean the toilet', icon: '🚽', frequency: 'weekly', points: 15 },
		{ title: 'Scrub the shower & tub', icon: '🛁', frequency: 'weekly', points: 15 },
		{ title: 'Clean the mirror', icon: '🪞', frequency: 'weekly', points: 5 },
		{ title: 'Mop the bathroom floor', icon: '🪣', frequency: 'weekly', points: 10 },
		{ title: 'Restock toilet paper & towels', icon: '🧻', frequency: 'weekly', points: 5 },
		{ title: 'Empty the bathroom trash', icon: '🗑️', frequency: 'weekly', points: 5 },
		{ title: 'Wash the bath mats', icon: '🧺', frequency: 'monthly', points: 10 }
	],
	bedroom: [
		{ title: 'Make your bed', icon: '🛏️', frequency: 'daily', points: 5 },
		{ title: 'Tidy your room', icon: '🧸', frequency: 'daily', points: 5 },
		{ title: 'Dirty clothes in the hamper', icon: '🧺', frequency: 'daily', points: 5 },
		{ title: 'Change your sheets', icon: '🛌', frequency: 'weekly', points: 10 },
		{ title: 'Put away clean laundry', icon: '👕', frequency: 'weekly', points: 5 },
		{ title: 'Vacuum your room', icon: '🌀', frequency: 'weekly', points: 10 },
		{ title: 'Declutter desk & shelves', icon: '📚', frequency: 'monthly', points: 10 },
		{ title: 'Under-bed cleanout', icon: '🔦', frequency: 'monthly', points: 15 }
	],
	living: [
		{ title: 'Tidy the living room', icon: '🛋️', frequency: 'daily', points: 5 },
		{ title: 'Fold blankets & fluff pillows', icon: '🛏️', frequency: 'daily', points: 5 },
		{ title: 'Vacuum the living room', icon: '🌀', frequency: 'weekly', points: 10 },
		{ title: 'Dust shelves & TV stand', icon: '🪶', frequency: 'weekly', points: 10 },
		{ title: 'Water the plants', icon: '🪴', frequency: 'daily', interval: 3, points: 5 },
		{ title: 'Wipe remotes & light switches', icon: '🎮', frequency: 'monthly', points: 5 },
		{ title: 'Clean the windows', icon: '🪟', frequency: 'monthly', points: 15 }
	],
	dining: [
		{ title: 'Set the table', icon: '🍽️', frequency: 'daily', points: 5 },
		{ title: 'Clear the table', icon: '🥣', frequency: 'daily', points: 5 },
		{ title: 'Wipe the dining table', icon: '🧽', frequency: 'daily', points: 5 },
		{ title: 'Sweep under the table', icon: '🧹', frequency: 'weekly', points: 5 }
	],
	laundry: [
		{ title: 'Sort the laundry', icon: '🧺', frequency: 'weekly', points: 5 },
		{ title: 'Run a load of laundry', icon: '🫧', frequency: 'weekly', points: 10 },
		{ title: 'Fold & sort clean clothes', icon: '👕', frequency: 'weekly', points: 10 },
		{ title: 'Clean the lint trap', icon: '🌬️', frequency: 'weekly', points: 5 },
		{ title: 'Match the sock basket', icon: '🧦', frequency: 'monthly', points: 5 }
	],
	entryway: [
		{ title: 'Line up the shoes', icon: '👟', frequency: 'daily', points: 5 },
		{ title: 'Hang up coats & bags', icon: '🧥', frequency: 'daily', points: 5 },
		{ title: 'Sort the mail', icon: '📬', frequency: 'daily', points: 5 },
		{ title: 'Sweep the entryway', icon: '🧹', frequency: 'weekly', points: 5 },
		{ title: 'Wipe the front door & handle', icon: '🚪', frequency: 'monthly', points: 5 }
	],
	playroom: [
		{ title: 'Toys back in their bins', icon: '🧸', frequency: 'daily', points: 5 },
		{ title: 'Books back on the shelf', icon: '📚', frequency: 'weekly', points: 5 },
		{ title: 'Wipe the play table', icon: '🖍️', frequency: 'weekly', points: 5 },
		{ title: 'Donate-box sweep', icon: '📦', frequency: 'monthly', points: 10, description: 'Find toys you’ve outgrown for the donate box.' }
	],
	office: [
		{ title: 'Tidy the desk', icon: '🖥️', frequency: 'weekly', points: 5 },
		{ title: 'Empty the wastebasket', icon: '🗑️', frequency: 'weekly', points: 5 },
		{ title: 'Dust monitor & keyboard', icon: '⌨️', frequency: 'monthly', points: 5 },
		{ title: 'Shred or recycle old papers', icon: '📄', frequency: 'monthly', points: 5 }
	],
	garage: [
		{ title: 'Take the bins to the curb', icon: '🗑️', frequency: 'weekly', points: 5 },
		{ title: 'Bring the bins back in', icon: '↩️', frequency: 'weekly', points: 5 },
		{ title: 'Put bikes & toys away', icon: '🚲', frequency: 'weekly', points: 5 },
		{ title: 'Sweep the garage', icon: '🧹', frequency: 'monthly', points: 15 },
		{ title: 'Organize the tool bench', icon: '🔧', frequency: 'monthly', points: 10 }
	],
	yard: [
		{ title: 'Mow the lawn', icon: '🚜', frequency: 'weekly', points: 20 },
		{ title: 'Water the garden', icon: '💧', frequency: 'daily', interval: 2, points: 5 },
		{ title: 'Weed a garden bed', icon: '🌿', frequency: 'weekly', points: 10 },
		{ title: 'Rake the leaves', icon: '🍂', frequency: 'weekly', points: 10 },
		{ title: 'Sweep the porch & patio', icon: '🧹', frequency: 'weekly', points: 5 },
		{ title: 'Pick up sticks & toys', icon: '🪵', frequency: 'weekly', points: 5 },
		{ title: 'Clean the gutters', icon: '🏠', frequency: 'yearly', monthOfYear: 10, dayOfMonth: 15, points: 25 }
	],
	pets: [
		{ title: 'Feed the pet', icon: '🥣', frequency: 'daily', points: 5 },
		{ title: 'Fresh water bowl', icon: '💧', frequency: 'daily', points: 5 },
		{ title: 'Walk the dog', icon: '🐕', frequency: 'daily', points: 10 },
		{ title: 'Scoop the litter box', icon: '🐈', frequency: 'daily', points: 10 },
		{ title: 'Brush the pet', icon: '🪮', frequency: 'weekly', points: 5 },
		{ title: 'Wash the pet bowls', icon: '🧼', frequency: 'weekly', points: 5 },
		{ title: 'Clean the cage or tank', icon: '🐠', frequency: 'weekly', points: 15 },
		{ title: 'Poop-scoop the yard', icon: '💩', frequency: 'weekly', points: 10 }
	],
	general: [
		{ title: 'Take out all the trash', icon: '🗑️', frequency: 'weekly', points: 10, description: 'Every wastebasket in the house.' },
		{ title: 'Vacuum the whole house', icon: '🌀', frequency: 'weekly', points: 20 },
		{ title: 'Dust the whole house', icon: '🪶', frequency: 'weekly', points: 15 },
		{ title: 'Water all the houseplants', icon: '🪴', frequency: 'weekly', points: 5 },
		{ title: 'Help carry in groceries', icon: '🛒', frequency: 'weekly', points: 5 },
		{ title: 'Wipe door handles & switches', icon: '🚪', frequency: 'monthly', points: 10 },
		{ title: 'Change the HVAC filter', icon: '🌬️', frequency: 'monthly', points: 10 },
		{ title: 'Test the smoke detectors', icon: '🚨', frequency: 'monthly', points: 10 }
	]
};

/** Templates for a room preset key; unknown/custom rooms get the General list. */
export function templatesFor(presetKey: string | null): ChoreTemplate[] {
	return CHORE_TEMPLATES[presetKey ?? 'general'] ?? CHORE_TEMPLATES.general;
}

/** Case-insensitive search across every room's templates. */
export function searchTemplates(query: string): { roomKey: string; template: ChoreTemplate }[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return Object.entries(CHORE_TEMPLATES).flatMap(([roomKey, templates]) =>
		templates
			.filter((t) => t.title.toLowerCase().includes(q))
			.map((template) => ({ roomKey, template }))
	);
}

/** Best-guess preset key for an existing room (matches name or icon). */
export function presetKeyForRoom(room: { name: string; icon: string }): string | null {
	const byIcon = ROOM_PRESETS.find((p) => p.icon === room.icon);
	if (byIcon) return byIcon.key;
	const name = room.name.toLowerCase();
	const byName = ROOM_PRESETS.find(
		(p) => name.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name)
	);
	return byName?.key ?? null;
}
