/**
 * End-to-end API smoke test. Start the backend, then:
 *   node scripts/smoke-test.mjs
 *
 * The assertions are deliberately independent of whatever is already in the
 * database: counts are compared against a baseline snapshot taken at startup,
 * filters are checked by verifying every returned row matches the term, and
 * aggregates are cross-checked against the rows they summarise. Accounts and
 * stores this run creates carry a per-run suffix, so the script is safe to run
 * repeatedly against a database that also holds hand-made data.
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:4000/api';
let pass = 0;
let fail = 0;

async function call(method, path, { token, body, rawBody, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...((body || rawBody) && { body: rawBody ?? JSON.stringify(body) }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (res.status === 429) {
    console.error(
      `\n\n  Rate limited on ${method} ${path}. Limits are per-IP over 15 minutes.\n  For repeated runs, start the backend with RATE_LIMIT_DISABLED=true.\n`,
    );
  }
  return { status: res.status, data, headers: res.headers };
}

function check(label, ok, extra = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}  ${extra}`);
  }
}

for (let i = 0; i < 40; i += 1) {
  try {
    const res = await fetch(`${BASE}/health`);
    if (res.ok) break;
  } catch {
    /* server still booting */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log('\n== health ==');
check('GET /health', (await call('GET', '/health')).data?.status === 'ok');

console.log('\n== auth ==');
const admin = await call('POST', '/auth/login', { body: { email: 'admin@storerate.com', password: 'Admin@1234' } });
check('admin login', admin.status === 200 && admin.data.user.role === 'ADMIN', JSON.stringify(admin.data));
const A = admin.data?.token;

// Unique per run so repeated runs never collide on the email unique index.
const RUN = Date.now().toString(36);
const SIGNUP_EMAIL = `smoke.signup.${RUN}@smoketest.local`;
const OWNER_EMAIL = `smoke.owner.${RUN}@smoketest.local`;
const ADMIN_EMAIL = `smoke.admin.${RUN}@smoketest.local`;
const STORE_EMAIL = `smoke.store.${RUN}@smoketest.local`;
const REJECT_EMAIL = `smoke.reject.${RUN}@smoketest.local`;

// Row counts before this run touches anything; the totals below are deltas.
const base = (await call('GET', '/admin/dashboard', { token: A })).data ?? {};

const owner = await call('POST', '/auth/login', { body: { email: 'sanjay.pillai@storerate.com', password: 'Test@1234' } });
check('owner login', owner.status === 200 && owner.data.user.role === 'OWNER');
const O = owner.data?.token;

const user = await call('POST', '/auth/login', { body: { email: 'aarav.kulkarni@example.com', password: 'Test@1234' } });
check('user login', user.status === 200 && user.data.user.role === 'USER');
const U = user.data?.token;

check('wrong password -> 401', (await call('POST', '/auth/login', { body: { email: 'admin@storerate.com', password: 'Wrong@1234' } })).status === 401);
check('no token -> 401', (await call('GET', '/admin/dashboard')).status === 401);

const me = await call('GET', '/auth/me', { token: U });
check('GET /auth/me', me.status === 200 && me.data.user.email === 'aarav.kulkarni@example.com');

console.log('\n== validation ==');
const shortName = await call('POST', '/auth/register', { body: { name: 'Bob', email: 'bob@x.com', address: 'x', password: 'Test@1234' } });
check('name under 20 chars -> 400', shortName.status === 400 && shortName.data.errors?.some((e) => e.field === 'name'));

const weakPw = await call('POST', '/auth/register', { body: { name: 'Registration Test Person One', email: 'weak@x.com', address: 'x', password: 'alllowercase1' } });
check('password without uppercase/special -> 400', weakPw.status === 400 && weakPw.data.errors?.some((e) => e.field === 'password'));

const longAddr = await call('POST', '/auth/register', { body: { name: 'Registration Test Person One', email: 'longaddr@x.com', address: 'x'.repeat(401), password: 'Valid@2024' } });
check('address over 400 chars -> 400', longAddr.status === 400);

const reg = await call('POST', '/auth/register', { body: { name: 'Registration Test Person One', email: SIGNUP_EMAIL, address: '9 Test Lane, Pune', password: 'Signup@2024' } });
check('valid signup -> 201 and role USER', reg.status === 201 && reg.data.user.role === 'USER', JSON.stringify(reg.data));
const N = reg.data?.token;

check('duplicate email -> 409', (await call('POST', '/auth/register', { body: { name: 'Registration Test Person One', email: SIGNUP_EMAIL, address: 'x', password: 'Signup@2024' } })).status === 409);

console.log('\n== admin dashboard + listings ==');
const dash = await call('GET', '/admin/dashboard', { token: A });
check(
  'dashboard totals',
  dash.data?.totalUsers === base.totalUsers + 1 &&
    dash.data.totalStores === base.totalStores &&
    dash.data.totalRatings === base.totalRatings,
  `baseline ${JSON.stringify(base)} -> ${JSON.stringify(dash.data)}`,
);

const users = await call('GET', '/admin/users?sortBy=name&sortOrder=asc&limit=100', { token: A });
const names = users.data?.data.map((u) => u.name) ?? [];
check('users sorted asc by name', JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))));

const usersDesc = await call('GET', '/admin/users?sortBy=email&sortOrder=desc&limit=100', { token: A });
const emails = usersDesc.data?.data.map((u) => u.email) ?? [];
check('users sorted desc by email', JSON.stringify(emails) === JSON.stringify([...emails].sort((a, b) => b.toLowerCase().localeCompare(a.toLowerCase()))));

const owners = await call('GET', '/admin/users?role=OWNER&limit=100', { token: A });
// The filtered list must be exactly the OWNER rows of the unfiltered list.
const ownersInFullList = users.data?.data.filter((u) => u.role === 'OWNER') ?? [];
check(
  'filter role=OWNER',
  ownersInFullList.length > 0 &&
    owners.data?.data.length === ownersInFullList.length &&
    owners.data.data.every((u) => u.role === 'OWNER'),
  `${owners.data?.data.length} filtered vs ${ownersInFullList.length} owners in the full list`,
);
check('owner rows carry a rating', owners.data?.data.every((u) => typeof u.rating === 'number'), JSON.stringify(owners.data?.data.map((u) => u.rating)));
check('normal user rows have no rating', users.data?.data.filter((u) => u.role === 'USER').every((u) => u.rating === null));

// A partial match must return at least the seeded hits and nothing that does
// not actually contain the term.
async function checkFilter(label, path, token, field, term, atLeast) {
  const res = await call('GET', path, { token });
  const rows = res.data?.data ?? [];
  check(
    label,
    res.data?.pagination.total >= atLeast &&
      rows.length > 0 &&
      rows.every((row) => String(row[field]).toLowerCase().includes(term)),
    `total ${res.data?.pagination.total}, expected >= ${atLeast}`,
  );
}

await checkFilter('filter by name', '/admin/users?name=aarav', A, 'name', 'aarav', 1);
await checkFilter('filter by address', '/admin/users?address=hyderabad', A, 'address', 'hyderabad', 2);
await checkFilter('filter by email', '/admin/users?email=storerate.com', A, 'email', 'storerate.com', 4);

const ownerId = owners.data.data[0].id;
const detail = await call('GET', `/admin/users/${ownerId}`, { token: A });
check('owner detail exposes rating + stores', detail.status === 200 && typeof detail.data.user.rating === 'number' && Array.isArray(detail.data.user.stores));
check('unknown user -> 404', (await call('GET', '/admin/users/99999', { token: A })).status === 404);

const stores = await call('GET', '/admin/stores?sortBy=rating&sortOrder=desc', { token: A });
const avgs = stores.data?.data.map((s) => Number(s.average_rating)) ?? [];
check('stores sorted by rating desc', JSON.stringify(avgs) === JSON.stringify([...avgs].sort((a, b) => b - a)), JSON.stringify(avgs));
check('store rows carry name/email/address/rating', stores.data?.data.every((s) => s.name && s.email && 'address' in s && 'average_rating' in s));

console.log('\n== admin creates users + stores ==');
const newOwner = await call('POST', '/admin/users', { token: A, body: { name: 'Created Owner Account Person', email: OWNER_EMAIL, address: '1 Admin Way', password: 'Owner@2024', role: 'OWNER' } });
check('create OWNER -> 201', newOwner.status === 201 && newOwner.data.user.role === 'OWNER', JSON.stringify(newOwner.data));

const newAdmin = await call('POST', '/admin/users', { token: A, body: { name: 'Created Admin Account Person', email: ADMIN_EMAIL, address: '1 Admin Way', password: 'Admin@2024', role: 'ADMIN' } });
check('create ADMIN -> 201', newAdmin.status === 201 && newAdmin.data.user.role === 'ADMIN');

const newStore = await call('POST', '/admin/stores', { token: A, body: { name: 'Admin Created Test Store Ltd', email: STORE_EMAIL, address: '2 Admin Way', ownerId: newOwner.data.user.id } });
check('create store -> 201', newStore.status === 201, JSON.stringify(newStore.data));

const normalUserId = users.data.data.find((u) => u.role === 'USER').id;
check('non-owner as ownerId -> 400', (await call('POST', '/admin/stores', { token: A, body: { name: 'Another Test Store Limited Co', email: REJECT_EMAIL, address: 'x', ownerId: normalUserId } })).status === 400);

console.log('\n== role gating ==');
check('USER  -> /admin/users 403', (await call('GET', '/admin/users', { token: U })).status === 403);
check('OWNER -> /admin/users 403', (await call('GET', '/admin/users', { token: O })).status === 403);
check('ADMIN -> /owner/dashboard 403', (await call('GET', '/owner/dashboard', { token: A })).status === 403);

console.log('\n== normal user: browse + rate ==');
const list = await call('GET', '/stores?sortBy=name', { token: U });
check('store list ok', list.status === 200 && list.data.data.length > 0);
check('list carries overall + my rating', 'average_rating' in list.data.data[0] && 'my_rating' in list.data.data[0] && 'rating_count' in list.data.data[0]);

await checkFilter('search by store name', '/stores?name=riverside', U, 'name', 'riverside', 1);
await checkFilter('search by address', '/stores?address=kolkata', U, 'address', 'kolkata', 1);

const targetId = newStore.data.store.id;
const submit = await call('PUT', `/stores/${targetId}/rating`, { token: U, body: { rating: 4 } });
check('submit rating -> 201', submit.status === 201 && submit.data.rating.value === 4 && submit.data.store.average_rating === 4, JSON.stringify(submit.data));

const modify = await call('PUT', `/stores/${targetId}/rating`, { token: U, body: { rating: 2 } });
check('modify rating -> 200, still one row', modify.status === 200 && modify.data.rating.value === 2 && modify.data.store.rating_count === 1, JSON.stringify(modify.data));

check('my_rating reflected on re-read', (await call('GET', `/stores/${targetId}`, { token: U })).data?.store.my_rating === 2);
check('rating 9 -> 400', (await call('PUT', `/stores/${targetId}/rating`, { token: U, body: { rating: 9 } })).status === 400);
check('rating 0 -> 400', (await call('PUT', `/stores/${targetId}/rating`, { token: U, body: { rating: 0 } })).status === 400);
check('OWNER cannot rate -> 403', (await call('PUT', `/stores/${targetId}/rating`, { token: O, body: { rating: 5 } })).status === 403);
check('rating unknown store -> 404', (await call('PUT', '/stores/99999/rating', { token: U, body: { rating: 3 } })).status === 404);
check('delete rating', (await call('DELETE', `/stores/${targetId}/rating`, { token: U })).status === 200);
check('delete again -> 404', (await call('DELETE', `/stores/${targetId}/rating`, { token: U })).status === 404);

console.log('\n== SQL injection guard ==');
const inj = await call('GET', '/admin/users?sortBy=name);DROP%20TABLE%20users;--&sortOrder=asc', { token: A });
check('malicious sortBy falls back to whitelist', inj.status === 200 && inj.data.sort.sortBy === 'name');
check('users table intact', (await call('GET', '/admin/dashboard', { token: A })).data?.totalUsers > 0);

console.log('\n== owner dashboard ==');
const od = await call('GET', '/owner/dashboard?sortBy=rating&sortOrder=desc&limit=100', { token: O });
check('owner dashboard 200', od.status === 200);
// Cross-check the owner's own view against what the admin sees for that
// account: the same store set, and nothing belonging to another owner.
const ownerDetail = await call('GET', `/admin/users/${owner.data.user.id}`, { token: A });
const adminStoreIds = (ownerDetail.data?.user.stores ?? []).map((s) => s.id).sort((a, b) => a - b);
const ownStoreIds = (od.data?.stores ?? []).map((s) => s.id).sort((a, b) => a - b);
check(
  'owner sees only own stores',
  ownStoreIds.length > 0 && JSON.stringify(ownStoreIds) === JSON.stringify(adminStoreIds),
  `owner ${JSON.stringify(ownStoreIds)} vs admin ${JSON.stringify(adminStoreIds)}`,
);

// The headline count covers every rating; the rater list is one page of them.
// Compare the count against the pagination total, and the average against the
// rows actually returned only when the page holds all of them.
const raters = od.data?.raters ?? [];
const ratersTotal = od.data?.pagination?.total ?? raters.length;
const expectedAvg = raters.length
  ? Math.round((raters.reduce((sum, r) => sum + Number(r.rating), 0) / raters.length) * 100) / 100
  : 0;
check(
  'owner average rating + count',
  typeof od.data?.overall.average_rating === 'number' &&
    od.data.overall.rating_count === ratersTotal &&
    (raters.length < ratersTotal || Math.abs(od.data.overall.average_rating - expectedAvg) < 0.011),
  `${JSON.stringify(od.data?.overall)} vs ${ratersTotal} rating(s), page of ${raters.length} averaging ${expectedAvg}`,
);
check(
  'owner raters are paginated',
  od.data?.pagination?.limit === 100 && od.data.pagination.totalPages === Math.ceil(ratersTotal / 100),
  JSON.stringify(od.data?.pagination),
);
check(
  'raters list has name/email/rating',
  raters.length > 0 && raters.every((r) => r.name && r.email && r.rating >= 1 && r.rating <= 5),
  `${raters.length} raters`,
);
const rvals = od.data?.raters.map((r) => r.rating) ?? [];
check('raters sorted by rating desc', JSON.stringify(rvals) === JSON.stringify([...rvals].sort((a, b) => b - a)), JSON.stringify(rvals));

console.log('\n== password update ==');
check('wrong current password -> 400', (await call('PUT', '/auth/password', { token: N, body: { currentPassword: 'Nope@1234', newPassword: 'Fresh@2024' } })).status === 400);
check('weak new password -> 400', (await call('PUT', '/auth/password', { token: N, body: { currentPassword: 'Signup@2024', newPassword: 'short' } })).status === 400);
const changed = await call('PUT', '/auth/password', { token: N, body: { currentPassword: 'Signup@2024', newPassword: 'Fresh@2024' } });
check('password updated', changed.status === 200);
check('password change returns a replacement token', typeof changed.data?.token === 'string' && changed.data.token !== N);
check('replacement token works', (await call('GET', '/auth/me', { token: changed.data?.token })).status === 200);
// The point of the change: every session opened with the old password ends.
check('token issued before the change -> 401', (await call('GET', '/auth/me', { token: N })).status === 401);
check('login with new password', (await call('POST', '/auth/login', { body: { email: SIGNUP_EMAIL, password: 'Fresh@2024' } })).status === 200);
check('login with old password -> 401', (await call('POST', '/auth/login', { body: { email: SIGNUP_EMAIL, password: 'Signup@2024' } })).status === 401);

console.log('\n== pagination ==');
const p1 = await call('GET', '/admin/users?limit=3&page=1&sortBy=name', { token: A });
const p2 = await call('GET', '/admin/users?limit=3&page=2&sortBy=name', { token: A });
check('pages return different rows', p1.data.data[0].id !== p2.data.data[0].id && p1.data.data.length === 3);
check('pagination metadata', p1.data.pagination.limit === 3 && p1.data.pagination.totalPages === Math.ceil(p1.data.pagination.total / 3));

console.log('\n== input handling ==');
// Each of these used to come back as a 500 - the server reporting the caller's
// own bad request as a fault of its own.
const tooLong = await call('GET', `/stores/${'9'.repeat(20)}`, { token: U });
check('id larger than int4 -> 400', tooLong.status === 400, `got ${tooLong.status}`);

const badJson = await call('POST', '/auth/login', { rawBody: '{"email": "a@b.c", ' });
check('malformed JSON -> 400', badJson.status === 400, `got ${badJson.status}`);

const oversized = await call('POST', '/auth/login', {
  rawBody: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(200_000) }),
});
check('oversized body -> 413', oversized.status === 413, `got ${oversized.status}`);

const arrayRating = await call('PUT', `/stores/${targetId}/rating`, { token: U, body: { rating: [5] } });
check('array where a number belongs -> 400', arrayRating.status === 400, `got ${arrayRating.status}`);

check('unknown route -> 404', (await call('GET', '/no/such/route', { token: A })).status === 404);

console.log('\n== filter wildcards ==');
const wildcard = await call('GET', '/admin/users?name=%25', { token: A });
check(
  'a literal % is matched, not expanded into a wildcard',
  wildcard.status === 200 && wildcard.data.pagination.total === 0,
  `matched ${wildcard.data?.pagination.total} user(s)`,
);
const underscore = await call('GET', '/stores?name=_', { token: U });
check(
  'a literal _ does not match any single character',
  underscore.status === 200 && underscore.data.data.every((row) => row.name.includes('_')),
  `matched ${underscore.data?.pagination.total} store(s)`,
);

console.log('\n== rate limiting ==');
// Asserted through the headers rather than by exhausting the budget: tripping
// the limiter would lock this address out of logging in for fifteen minutes and
// cost the script the re-runnability it was rewritten to have.
const limited = await call('POST', '/auth/login', { body: { email: 'admin@storerate.com', password: 'Wrong@1234' } });
check('failed login still 401', limited.status === 401);
check(
  'rate limit headers present on /auth/login',
  Boolean(limited.headers.get('ratelimit-policy') || limited.headers.get('ratelimit-limit')),
  `policy=${limited.headers.get('ratelimit-policy')} limit=${limited.headers.get('ratelimit-limit')}`,
);

console.log('\n== readiness ==');
const ready = await call('GET', '/ready');
check(
  'GET /ready reports the database',
  ready.status === 200 && ready.data.status === 'ok' && typeof ready.data.databaseLatencyMs === 'number',
  JSON.stringify(ready.data),
);

console.log(`\n${'='.repeat(44)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(44)}\n`);
process.exit(fail ? 1 : 0);
