/**
 * The built-in room + chore catalog. This ships as CODE, not database rows —
 * a fresh household starts empty and only what the family picks gets created.
 *
 * Templates carry no points and no money. Money is one household-wide weekly
 * allowance (a setting, not a per-chore figure), and a chore's points default
 * from how often it comes round — so a template only has to describe the job.
 * Adults retune points per chore afterwards.
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
		{ title: 'Unload the dishwasher', icon: '🍽️', frequency: 'daily' },
		{ title: 'Load the dishwasher', icon: '🧼', frequency: 'daily' },
		{ title: 'Wipe the counters', icon: '🧽', frequency: 'daily' },
		{ title: 'Sweep the kitchen floor', icon: '🧹', frequency: 'daily' },
		{ title: 'Take out the trash', icon: '🗑️', frequency: 'daily', interval: 2 },
		{ title: 'Take out the recycling', icon: '♻️', frequency: 'weekly' },
		{ title: 'Mop the kitchen floor', icon: '🪣', frequency: 'weekly' },
		{ title: 'Clean the microwave', icon: '📦', frequency: 'weekly' },
		{ title: 'Clean out the fridge', icon: '🧊', frequency: 'monthly', description: 'Toss expired food, wipe the shelves.' },
		{ title: 'Wipe the cabinet doors', icon: '🚪', frequency: 'monthly' },
		{ title: 'Clean the oven', icon: '🔥', frequency: 'monthly' }
	],
	bathroom: [
		{ title: 'Wipe the sink & counter', icon: '🚿', frequency: 'daily' },
		{ title: 'Clean the toilet', icon: '🚽', frequency: 'weekly' },
		{ title: 'Scrub the shower & tub', icon: '🛁', frequency: 'weekly' },
		{ title: 'Clean the mirror', icon: '🪞', frequency: 'weekly' },
		{ title: 'Mop the bathroom floor', icon: '🪣', frequency: 'weekly' },
		{ title: 'Restock toilet paper & towels', icon: '🧻', frequency: 'weekly' },
		{ title: 'Empty the bathroom trash', icon: '🗑️', frequency: 'weekly' },
		{ title: 'Wash the bath mats', icon: '🧺', frequency: 'monthly' }
	],
	bedroom: [
		{ title: 'Make your bed', icon: '🛏️', frequency: 'daily' },
		{ title: 'Tidy your room', icon: '🧸', frequency: 'daily' },
		{ title: 'Dirty clothes in the hamper', icon: '🧺', frequency: 'daily' },
		{ title: 'Change your sheets', icon: '🛌', frequency: 'weekly' },
		{ title: 'Put away clean laundry', icon: '👕', frequency: 'weekly' },
		{ title: 'Vacuum your room', icon: '🌀', frequency: 'weekly' },
		{ title: 'Declutter desk & shelves', icon: '📚', frequency: 'monthly' },
		{ title: 'Under-bed cleanout', icon: '🔦', frequency: 'monthly' }
	],
	living: [
		{ title: 'Tidy the living room', icon: '🛋️', frequency: 'daily' },
		{ title: 'Fold blankets & fluff pillows', icon: '🛏️', frequency: 'daily' },
		{ title: 'Vacuum the living room', icon: '🌀', frequency: 'weekly' },
		{ title: 'Dust shelves & TV stand', icon: '🪶', frequency: 'weekly' },
		{ title: 'Water the plants', icon: '🪴', frequency: 'daily', interval: 3 },
		{ title: 'Wipe remotes & light switches', icon: '🎮', frequency: 'monthly' },
		{ title: 'Clean the windows', icon: '🪟', frequency: 'monthly' }
	],
	dining: [
		{ title: 'Set the table', icon: '🍽️', frequency: 'daily' },
		{ title: 'Clear the table', icon: '🥣', frequency: 'daily' },
		{ title: 'Wipe the dining table', icon: '🧽', frequency: 'daily' },
		{ title: 'Sweep under the table', icon: '🧹', frequency: 'weekly' }
	],
	laundry: [
		{ title: 'Sort the laundry', icon: '🧺', frequency: 'weekly' },
		{ title: 'Run a load of laundry', icon: '🫧', frequency: 'weekly' },
		{ title: 'Fold & sort clean clothes', icon: '👕', frequency: 'weekly' },
		{ title: 'Clean the lint trap', icon: '🌬️', frequency: 'weekly' },
		{ title: 'Match the sock basket', icon: '🧦', frequency: 'monthly' }
	],
	entryway: [
		{ title: 'Line up the shoes', icon: '👟', frequency: 'daily' },
		{ title: 'Hang up coats & bags', icon: '🧥', frequency: 'daily' },
		{ title: 'Sort the mail', icon: '📬', frequency: 'daily' },
		{ title: 'Sweep the entryway', icon: '🧹', frequency: 'weekly' },
		{ title: 'Wipe the front door & handle', icon: '🚪', frequency: 'monthly' }
	],
	playroom: [
		{ title: 'Toys back in their bins', icon: '🧸', frequency: 'daily' },
		{ title: 'Books back on the shelf', icon: '📚', frequency: 'weekly' },
		{ title: 'Wipe the play table', icon: '🖍️', frequency: 'weekly' },
		{ title: 'Donate-box sweep', icon: '📦', frequency: 'monthly', description: 'Find toys you’ve outgrown for the donate box.' }
	],
	office: [
		{ title: 'Tidy the desk', icon: '🖥️', frequency: 'weekly' },
		{ title: 'Empty the wastebasket', icon: '🗑️', frequency: 'weekly' },
		{ title: 'Dust monitor & keyboard', icon: '⌨️', frequency: 'monthly' },
		{ title: 'Shred or recycle old papers', icon: '📄', frequency: 'monthly' }
	],
	garage: [
		{ title: 'Take the bins to the curb', icon: '🗑️', frequency: 'weekly' },
		{ title: 'Bring the bins back in', icon: '↩️', frequency: 'weekly' },
		{ title: 'Put bikes & toys away', icon: '🚲', frequency: 'weekly' },
		{ title: 'Sweep the garage', icon: '🧹', frequency: 'monthly' },
		{ title: 'Organize the tool bench', icon: '🔧', frequency: 'monthly' }
	],
	yard: [
		{ title: 'Mow the lawn', icon: '🚜', frequency: 'weekly' },
		{ title: 'Water the garden', icon: '💧', frequency: 'daily', interval: 2 },
		{ title: 'Weed a garden bed', icon: '🌿', frequency: 'weekly' },
		{ title: 'Rake the leaves', icon: '🍂', frequency: 'weekly' },
		{ title: 'Sweep the porch & patio', icon: '🧹', frequency: 'weekly' },
		{ title: 'Pick up sticks & toys', icon: '🪵', frequency: 'weekly' },
		{ title: 'Clean the gutters', icon: '🏠', frequency: 'yearly', monthOfYear: 10, dayOfMonth: 15 }
	],
	pets: [
		{ title: 'Feed the pet', icon: '🥣', frequency: 'daily' },
		{ title: 'Fresh water bowl', icon: '💧', frequency: 'daily' },
		{ title: 'Walk the dog', icon: '🐕', frequency: 'daily' },
		{ title: 'Scoop the litter box', icon: '🐈', frequency: 'daily' },
		{ title: 'Brush the pet', icon: '🪮', frequency: 'weekly' },
		{ title: 'Wash the pet bowls', icon: '🧼', frequency: 'weekly' },
		{ title: 'Clean the cage or tank', icon: '🐠', frequency: 'weekly' },
		{ title: 'Poop-scoop the yard', icon: '💩', frequency: 'weekly' }
	],
	general: [
		{ title: 'Take out all the trash', icon: '🗑️', frequency: 'weekly', description: 'Every wastebasket in the house.' },
		{ title: 'Vacuum the whole house', icon: '🌀', frequency: 'weekly' },
		{ title: 'Dust the whole house', icon: '🪶', frequency: 'weekly' },
		{ title: 'Water all the houseplants', icon: '🪴', frequency: 'weekly' },
		{ title: 'Help carry in groceries', icon: '🛒', frequency: 'weekly' },
		{ title: 'Wipe door handles & switches', icon: '🚪', frequency: 'monthly' },
		{ title: 'Change the HVAC filter', icon: '🌬️', frequency: 'monthly' },
		{ title: 'Test the smoke detectors', icon: '🚨', frequency: 'monthly' }
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
