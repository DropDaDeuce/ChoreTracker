// End-to-end smoke test against a freshly seeded running server.
//
// Usage (from the repo root):
//   npm run build
//   rm -rf data && npm run seed
//   PORT=3010 BODY_SIZE_LIMIT=10M node build   (in another terminal)
//   npm run smoke
//
// NOTE: mutates the database (marks chores done, pays out, restores a
// backup) — only ever run it against a fresh seed, never real family data.
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3010';
let failures = 0;

function check(label, ok, detail = '') {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + detail}`);
	if (!ok) failures++;
}

async function get(path, cookie) {
	const res = await fetch(BASE + path, {
		redirect: 'manual',
		headers: cookie ? { cookie } : {}
	});
	return { status: res.status, location: res.headers.get('location'), body: await res.text() };
}

async function post(path, data, cookie) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(data)) {
		for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
	}
	const res = await fetch(BASE + path, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html', // plain form post: HTML + real 303s, not JSON action results
			origin: BASE,
			...(cookie ? { cookie } : {})
		},
		body: params.toString()
	});
	const setCookie = res.headers.getSetCookie?.() ?? [];
	const session = setCookie.find((c) => c.startsWith('session='))?.split(';')[0] ?? null;
	return { status: res.status, session, body: await res.text() };
}

async function login(userId, pin) {
	const res = await post('/?/login', { userId, pin });
	if (res.status !== 303 || !res.session) throw new Error(`login failed for user ${userId}: ${res.status}`);
	return res.session;
}

// 1. Logged-out behavior
const home = await get('/');
check('profile picker renders with demo family', home.status === 200 && home.body.includes('Sam') && home.body.includes('Alex'));
const guarded = await get('/dashboard');
check('anonymous /dashboard redirects to picker', guarded.status === 303 && guarded.location === '/');

// 2. Wrong PIN rejected
const badLogin = await post('/?/login', { userId: '2', pin: '9999' });
check('wrong PIN rejected', badLogin.status === 400);

// 3. Kid logs in, sees chores, marks dishwasher done
const sam = await login('2', '1111');
let dash = await get('/dashboard', sam);
check('kid dashboard shows chore', dash.status === 200 && dash.body.includes('Empty the dishwasher'));
const instanceId = dash.body.match(/name="instanceId" value="(\d+)"/)?.[1];
check('dashboard exposes an instance to mark done', Boolean(instanceId));
const done = await post('/dashboard?/markDone', { instanceId }, sam);
check('kid marks chore done', done.status === 200);
dash = await get('/dashboard', sam);
check('chore now awaiting verification', dash.body.includes('awaiting verification'));

// Phase 2: undo brings it back, then redo
const undone = await post('/dashboard?/undo', { instanceId }, sam);
check('kid undoes mark-done', undone.status === 200);
dash = await get('/dashboard', sam);
check('chore back in open list after undo', !dash.body.includes('awaiting verification') && dash.body.includes(`name="instanceId" value="${instanceId}"`));
await post('/dashboard?/markDone', { instanceId }, sam);

// 4. Kid cannot access adult pages
const kidVerify = await get('/verify', sam);
check('kid blocked from /verify (403)', kidVerify.status === 403);

// 5. Adult reminds once, then verifies -> half payout (50c allowance -> 25c)
const alex = await login('1', '1234');
let verify = await get('/verify', alex);
check('verify queue shows the done chore', verify.body.includes('Empty the dishwasher') && verify.body.includes('Sam'));
const remind = await post('/verify?/remind', { instanceId }, alex);
check('adult adds a reminder', remind.status === 200);
verify = await get('/verify', alex);
check('payout preview shows half ($0.25 of $0.50)', verify.body.includes('$0.25'));
const verified = await post('/verify?/verify', { instanceId }, alex);
check('adult verifies chore', verified.status === 200);

// 6. Earnings: Sam has $0.25, reminder reason recorded; adult pays out
let earnings = await get('/earnings', alex);
check('kid balance is $0.25 after reduced payout', earnings.body.includes('$0.25'));
check('ledger records the reminder reason', earnings.body.includes('1 reminder'));
const kidId = earnings.body.match(/\?\/payout"[\s\S]*?name="kidId" value="(\d+)"/)?.[1];
check('payout button targets the kid', Boolean(kidId));
const paid = await post('/earnings?/payout', { kidId }, alex);
check('adult pays out balance', paid.status === 200);
earnings = await get('/earnings', alex);
check('balance zero after payout, history kept', earnings.body.includes('$0.00') && earnings.body.includes('Paid out'));

// 7. Kid earnings view works
const kidEarnings = await get('/earnings', sam);
check('kid sees own earnings page', kidEarnings.status === 200 && kidEarnings.body.includes('Paid out'));

// 8. Admin pages render for adult
const adminChores = await get('/admin/chores', alex);
check('admin chores lists all 5 demo chores', adminChores.status === 200 && (adminChores.body.match(/admin\/chores\/\d+/g) ?? []).length >= 5);
const adminUsers = await get('/admin/users', alex);
check('admin users lists the family', adminUsers.status === 200 && adminUsers.body.includes('Riley'));

// 8b. Rooms + chore library
const roomRes = await post('/admin/chores?/addRoom', { name: 'Test Kitchen', icon: '🍳' }, alex);
check('adult adds a room', roomRes.status === 200 || roomRes.status === 303);
let house = await get('/admin/chores', alex);
check('house view shows the new room', house.body.includes('Test Kitchen'));
const roomId = house.body.match(/\/admin\/chores\/new\?room=(\d+)/)?.[1];
check('room exposes an add-chore link', Boolean(roomId));

const picker = await get(`/admin/chores/new?room=${roomId}`, alex);
check('library picker shows kitchen templates', picker.body.includes('Wipe the counters'));

const multiAdd = await post(
	'/admin/chores/new?/library',
	{ roomId, presetKey: 'kitchen', titles: ['Wipe the counters', 'Mop the kitchen floor'] },
	alex
);
check('library multi-add redirects', multiAdd.status === 303);
house = await get('/admin/chores', alex);
check('library chores land in the room, unassigned', house.body.includes('Wipe the counters') && house.body.includes('unassigned'));

// Person-centric assignment: Sam takes "Wipe the counters" from their page
const choreLink = house.body.match(/href="\/admin\/chores\/(\d+)"[^>]*>[\s\S]{0,200}?Wipe the counters/);
const libChoreId = choreLink?.[1];
check('house view links the library chore', Boolean(libChoreId));
const personPage = await get('/admin/users/2', alex);
check('person page renders with assign control', personPage.status === 200 && personPage.body.includes('Assign a chore'));
const assignRes = await post('/admin/users/2?/assign', { choreId: libChoreId }, alex);
check('adult assigns library chore to Sam', assignRes.status === 200 || assignRes.status === 303);
const samDash = await get('/dashboard', sam);
check('assigned daily library chore hits Sam today', samDash.body.includes('Wipe the counters'));
const unassignRes = await post('/admin/users/2?/unassign', { choreId: libChoreId }, alex);
check('adult unassigns it again', unassignRes.status === 200 || unassignRes.status === 303);
const samDash2 = await get('/dashboard', sam);
check('unassigned chore leaves Sam\'s dashboard', !samDash2.body.includes('Wipe the counters'));

// 9. Adult creates a chore via the form; it appears on their dashboard
const today = new Date().toLocaleDateString('en-CA'); // local date, matching the server's todayLocal()
const createRes = await post(
	'/admin/chores/new?/custom',
	{
		title: 'Water the plants',
		description: '',
		frequency: 'daily',
		interval: '1',
		startDate: today,
		points: '2',
		allowance: '0.10',
		graceDays: '0',
		requiresVerification: 'on',
		assignmentType: 'fixed',
		assigneeIds: '1'
	},
	alex
);
check('chore create redirects to list', createRes.status === 303);
const dashAlex = await get('/dashboard', alex);
check('new chore appears on assignee dashboard', dashAlex.body.includes('Water the plants'));

// Phase 2: rotating chore via the form
const rotRes = await post(
	'/admin/chores/new?/custom',
	{
		title: 'Set the table',
		description: '',
		frequency: 'daily',
		interval: '1',
		startDate: today,
		points: '0',
		allowance: '0.20',
		graceDays: '1',
		requiresVerification: 'on',
		assignmentType: 'rotating',
		assigneeIds: ['2', '3'] // Sam then Riley
	},
	alex
);
check('rotating chore create redirects', rotRes.status === 303);
const choresList = await get('/admin/chores', alex);
check('admin list shows rotation order Sam → Riley', choresList.body.includes('Sam → Riley'));

// Phase 2: rotation rejects a single-person pool
const badRot = await post(
	'/admin/chores/new?/custom',
	{
		title: 'Bad rotation',
		frequency: 'daily',
		interval: '1',
		startDate: today,
		graceDays: '0',
		assignmentType: 'rotating',
		assigneeIds: '2'
	},
	alex
);
check('single-person rotation rejected', badRot.status === 400);

// Phase 2: my-chores tabs page
const myChores = await get('/chores', sam);
check('kid my-chores page lists daily chores', myChores.status === 200 && myChores.body.includes('Empty the dishwasher') && myChores.body.includes('Set the table'));

// Phase 2: settings page saves and currency threads through
const kidSettings = await get('/admin/settings', sam);
check('kid blocked from settings (403)', kidSettings.status === 403);
let settingsPage = await get('/admin/settings', alex);
check('settings page renders', settingsPage.status === 200 && settingsPage.body.includes('Reminder penalty'));
const saveSettings = await post(
	'/admin/settings',
	{ currencySymbol: '€', reminderPenaltyPercent: '50', undoWindowMinutes: '15', weekStart: 'monday', backupKeepCount: '14' },
	alex
);
check('settings save succeeds', saveSettings.status === 200);
const dashEuro = await get('/dashboard', alex);
check('currency symbol threads through UI', dashEuro.body.includes('€'));
await post(
	'/admin/settings',
	{ currencySymbol: '$', reminderPenaltyPercent: '50', undoWindowMinutes: '15', weekStart: 'monday', backupKeepCount: '14' },
	alex
);

// Phase 3: photo proof end-to-end
const photoChore = await post(
	'/admin/chores/new?/custom',
	{
		title: 'Photo check',
		frequency: 'daily',
		interval: '1',
		startDate: today,
		points: '3',
		allowance: '0',
		graceDays: '0',
		requiresVerification: 'on',
		requiresPhoto: 'on',
		assignmentType: 'fixed',
		assigneeIds: '2' // Sam
	},
	alex
);
check('photo-required chore created', photoChore.status === 303);
dash = await get('/dashboard', sam);
const photoInstanceId = dash.body.match(/Photo check[\s\S]*?name="instanceId" value="(\d+)"/)?.[1];
check('photo chore on kid dashboard with camera input', Boolean(photoInstanceId) && dash.body.includes('photo proof'));

const noPhoto = await post('/dashboard?/markDone', { instanceId: photoInstanceId }, sam);
check('markDone without photo rejected', noPhoto.status === 400);

const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
);
const fd = new FormData();
fd.append('instanceId', photoInstanceId);
fd.append('photo', new Blob([PNG_1PX], { type: 'image/png' }), 'proof.png');
const photoDone = await fetch(BASE + '/dashboard?/markDone', {
	method: 'POST',
	redirect: 'manual',
	headers: { accept: 'text/html', origin: BASE, cookie: sam },
	body: fd
});
check('markDone with photo accepted', photoDone.status === 200);

verify = await get('/verify', alex);
const photoUrl = verify.body.match(/\/photos\/[a-f0-9]{16}\.(?:png|jpg|webp)/)?.[0];
check('verify queue shows the proof photo', Boolean(photoUrl));
const photoAuthed = await fetch(BASE + photoUrl, { headers: { cookie: alex }, redirect: 'manual' });
check('photo served to logged-in user', photoAuthed.status === 200 && photoAuthed.headers.get('content-type') === 'image/png');
const photoAnon = await fetch(BASE + photoUrl, { redirect: 'manual' });
check('photo blocked for anonymous', photoAnon.status === 303);
await post('/verify?/verify', { instanceId: photoInstanceId }, alex);

// Phase 3: calendar + leaderboard
const calendar = await get('/calendar', sam);
check('calendar renders month grid', calendar.status === 200 && calendar.body.includes('rotation (turn not decided yet)'));
const board = await get('/leaderboard', sam);
check('leaderboard shows family with points columns', board.status === 200 && board.body.includes('Sam') && board.body.includes('week'));

// Phase 3: CSV export
const csv = await fetch(BASE + '/earnings/export?person=2', { headers: { cookie: alex } });
const csvBody = await csv.text();
check('CSV export works for adult', csv.status === 200 && (csv.headers.get('content-type') ?? '').includes('text/csv') && csvBody.startsWith('date,type,amount,note'));
const csvForbidden = await fetch(BASE + '/earnings/export?person=3', { headers: { cookie: sam } });
check("kid can't export someone else's CSV", csvForbidden.status === 403);

// Ops: health endpoint
const health = await get('/healthz');
check('healthz reports ok', health.status === 200 && health.body.includes('"ok":true'));

// Phase 3: PWA assets
const manifest = await get('/manifest.webmanifest');
check('web manifest served', manifest.status === 200 && manifest.body.includes('"ChoreTracker"'));
const swRes = await get('/service-worker.js');
check('service worker served', swRes.status === 200);
const icon = await fetch(BASE + '/icons/icon-192.png');
check('PWA icon served', icon.status === 200);

// Phase 4: swap requests end-to-end
dash = await get('/dashboard', sam);
const swapInstanceId = dash.body.match(/Set the table[\s\S]*?name="instanceId" value="(\d+)"/)?.[1];
check('sam has a swappable open chore', Boolean(swapInstanceId));
const swapReq = await post('/dashboard?/requestSwap', { instanceId: swapInstanceId, toUserId: '3' }, sam);
check('swap request created', swapReq.status === 200);
dash = await get('/dashboard', sam);
check('outgoing swap visible to requester', dash.body.includes('Asked Riley'));

const riley = await login('3', '2222');
let rileyDash = await get('/dashboard', riley);
const swapId = rileyDash.body.match(/name="swapId" value="(\d+)"/)?.[1];
check('incoming swap visible to target', rileyDash.body.includes('Sam asks') && Boolean(swapId));
const accepted = await post('/dashboard?/acceptSwap', { swapId }, riley);
check('swap accepted', accepted.status === 200);
rileyDash = await get('/dashboard', riley);
check('chore now on target dashboard', rileyDash.body.includes('Set the table'));

// Phase 4: bonuses & penalties
const bonus = await post('/earnings?/adjust', { kidId: '2', type: 'bonus', amount: '1.00', note: 'Car wash help' }, alex);
check('bonus applied', bonus.status === 200);
const penalty = await post('/earnings?/adjust', { kidId: '2', type: 'penalty', amount: '0.25', note: 'Muddy shoes' }, alex);
check('penalty applied', penalty.status === 200);
earnings = await get('/earnings', alex);
check('balance reflects bonus minus penalty ($0.75)', earnings.body.includes('$0.75') && earnings.body.includes('Car wash help') && earnings.body.includes('Muddy shoes'));
const badAdjust = await post('/earnings?/adjust', { kidId: '2', type: 'bonus', amount: '0', note: '' }, alex);
check('zero-amount adjustment rejected', badAdjust.status === 400);

// Phase 4: push subscription endpoints
const fakeSub = { endpoint: 'https://push.example.com/sub/abc123', keys: { p256dh: 'test-p256dh-key', auth: 'test-auth' } };
const subRes = await fetch(BASE + '/push/subscribe', {
	method: 'POST',
	headers: { 'content-type': 'application/json', origin: BASE, cookie: sam },
	body: JSON.stringify(fakeSub)
});
check('push subscribe accepted', subRes.status === 200);
const badSub = await fetch(BASE + '/push/subscribe', {
	method: 'POST',
	headers: { 'content-type': 'application/json', origin: BASE, cookie: sam },
	body: JSON.stringify({ endpoint: 'not-a-url', keys: {} })
});
check('invalid subscription rejected', badSub.status === 400);
const unsubRes = await fetch(BASE + '/push/subscribe', {
	method: 'DELETE',
	headers: { 'content-type': 'application/json', origin: BASE, cookie: sam },
	body: JSON.stringify({ endpoint: fakeSub.endpoint })
});
check('push unsubscribe accepted', unsubRes.status === 200);

// Phase 4: backup -> change -> restore roundtrip
const kidBackup = await get('/admin/backup', sam);
check('kid blocked from backup page (403)', kidBackup.status === 403);
const backupPage = await get('/admin/backup', alex);
check('backup page renders', backupPage.status === 200 && backupPage.body.includes('Download backup'));
const backupRes = await fetch(BASE + '/admin/backup/download', { headers: { cookie: alex } });
const backupZip = Buffer.from(await backupRes.arrayBuffer());
check('backup downloads as zip', backupRes.status === 200 && backupZip.readUInt32LE(0) === 0x04034b50 && backupZip.length > 10000);

await post(
	'/admin/chores/new?/custom',
	{ title: 'Post-backup marker', frequency: 'daily', interval: '1', startDate: today, graceDays: '0', assignmentType: 'fixed', assigneeIds: '1' },
	alex
);
let adminList = await get('/admin/chores', alex);
check('marker chore exists before restore', adminList.body.includes('Post-backup marker'));

const restoreForm = new FormData();
restoreForm.append('backup', new Blob([backupZip], { type: 'application/zip' }), 'backup.zip');
restoreForm.append('confirm', 'on');
const restoreRes = await fetch(BASE + '/admin/backup?/restore', {
	method: 'POST',
	redirect: 'manual',
	headers: { accept: 'text/html', origin: BASE, cookie: alex },
	body: restoreForm
});
check('restore succeeds', restoreRes.status === 200 && (await restoreRes.text()).includes('Restored.'));

adminList = await get('/admin/chores', alex);
check('marker chore gone after restore', !adminList.body.includes('Post-backup marker') && adminList.body.includes('Set the table'));
earnings = await get('/earnings', alex);
check('restored data intact (balance still $0.75)', earnings.body.includes('$0.75'));

// Presence: days-at-home calendar
const usersPage = await get('/admin/users', alex);
check('people page links to days-at-home', usersPage.body.includes('Days at home'));
let presencePage = await get('/admin/users/2/presence', alex);
check('presence calendar renders', presencePage.status === 200 && presencePage.body.includes('days at home') && presencePage.body.includes('Repeating patterns'));
const kidPresence = await get('/admin/users/2/presence', sam);
check('kid blocked from presence page (403)', kidPresence.status === 403);

const localToday = new Date();
const todayWeekday = (localToday.getDay() + 6) % 7; // 0 = Monday
const addRuleRes = await post(
	`/admin/users/2/presence?/addRule`,
	{ kind: 'weekly', isHome: 'false', weekday: String(todayWeekday) },
	alex
);
check('away-every-weekday rule added', addRuleRes.status === 200);
presencePage = await get('/admin/users/2/presence', alex);
check('rule listed on calendar page', presencePage.body.includes('Away every'));
dash = await get('/dashboard', sam);
check('kid dashboard shows away banner', dash.body.includes('away today'));

const ruleId = presencePage.body.match(/name="ruleId" value="(\d+)"/)?.[1];
check('rule exposes delete control', Boolean(ruleId));
await post(`/admin/users/2/presence?/deleteRule`, { ruleId }, alex);
dash = await get('/dashboard', sam);
check('banner clears when rule removed', !dash.body.includes('away today'));

await post(`/admin/users/2/presence?/toggleDay`, { date: today }, alex);
dash = await get('/dashboard', sam);
check('single-day toggle marks kid away', dash.body.includes('away today'));
await post(`/admin/users/2/presence?/resetDay`, { date: today }, alex);
dash = await get('/dashboard', sam);
check('day reset brings kid home', !dash.body.includes('away today'));

// Weekday-mask patterns + presence-aware calendar
const maskRule = await post(
	'/admin/users/2/presence?/addRule',
	{ kind: 'weekly', isHome: 'false', weekdays: ['0', '1', '2', '3', '4', '5', '6'] },
	alex
);
check('every-day mask pattern added', maskRule.status === 200);
presencePage = await get('/admin/users/2/presence', alex);
check('mask pattern described whole ("Away every day")', presencePage.body.includes('Away every day'));
const nextMonth = `${localToday.getFullYear() + (localToday.getMonth() === 11 ? 1 : 0)}-${String(((localToday.getMonth() + 1) % 12) + 1).padStart(2, '0')}`;
let calNext = await get(`/calendar?month=${nextMonth}`, alex);
check("calendar hides an away kid's planned chores", !calNext.body.includes('Empty the dishwasher'));
check('rotation stays planned while a pool member is home', calNext.body.includes('Set the table'));
const maskRuleId = presencePage.body.match(/name="ruleId" value="(\d+)"/)?.[1];
await post('/admin/users/2/presence?/deleteRule', { ruleId: maskRuleId }, alex);
calNext = await get(`/calendar?month=${nextMonth}`, alex);
check('planned chores return when the pattern is removed', calNext.body.includes('Empty the dishwasher'));

// Self-cleaning day overrides: toggle-toggle leaves no pin behind
await post('/admin/users/2/presence?/toggleDay', { date: today }, alex);
presencePage = await get('/admin/users/2/presence', alex);
check('single toggle stores an override', presencePage.body.includes(`${today}: away (day override)`));
await post('/admin/users/2/presence?/toggleDay', { date: today }, alex);
presencePage = await get('/admin/users/2/presence', alex);
check(
	'second toggle removes the override entirely',
	presencePage.body.includes(`${today}: home`) && !presencePage.body.includes(`${today}: home (day override)`)
);

// 9b2. Chore deletion
await post(
	'/admin/chores/new?/custom',
	{ title: 'Throwaway chore', frequency: 'daily', interval: '1', startDate: today, graceDays: '0', assignmentType: 'fixed' },
	alex
);
let houseAfterCreate = await get('/admin/chores', alex);
const throwawayId = houseAfterCreate.body.match(/href="\/admin\/chores\/(\d+)"[^>]*>[\s\S]{0,200}?Throwaway chore/)?.[1];
check('throwaway chore created for deletion test', Boolean(throwawayId));
const delRes = await post(`/admin/chores/${throwawayId}?/delete`, {}, alex);
check('chore delete redirects', delRes.status === 303);
houseAfterCreate = await get('/admin/chores', alex);
check('deleted chore is gone from the house', !houseAfterCreate.body.includes('Throwaway chore'));

// 9c. Family board + kiosk switch
const familyBoard = await get('/board', sam);
check('board renders for a kid with the whole family', familyBoard.status === 200 && familyBoard.body.includes('Family board') && familyBoard.body.includes('Alex') && familyBoard.body.includes('Riley'));
const anonFamilyBoard = await get('/board');
check('anonymous board redirects to picker', anonFamilyBoard.status === 303 && anonFamilyBoard.location === '/');
const badSwitch = await post('/board?/switch', { userId: '3', pin: '9999' }, sam);
check('kiosk switch rejects a wrong PIN', badSwitch.status === 400);
const goodSwitch = await post('/board?/switch', { userId: '3', pin: '2222' }, sam);
check('kiosk switch logs in as the tapped person', goodSwitch.status === 303 && Boolean(goodSwitch.session));
const rileyEarnings = await get('/earnings', goodSwitch.session);
check('switched session is Riley (sees only own earnings)', rileyEarnings.body.includes('Riley') && !rileyEarnings.body.includes('>Sam<'));

// 10. Logout kills the session
const out = await post('/logout', {}, alex);
check('logout redirects', out.status === 303);
const afterLogout = await get('/dashboard', alex);
check('session invalid after logout', afterLogout.status === 303);

console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
