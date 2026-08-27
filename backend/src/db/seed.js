/**
 * Populates the database with a demo dataset: one admin, five normal users,
 * three store owners, five stores and a spread of ratings.
 *
 * Re-running truncates the three tables first, so the seed is repeatable.
 * Every name is >= 20 characters to satisfy the schema's length constraint.
 *
 * This command destroys data. Three guards stand in front of that:
 *   - it refuses to run when NODE_ENV is production,
 *   - it refuses to truncate a database that already holds rows,
 *   - `--force` overrides the second guard, never the first.
 *
 * The admin password is no longer a constant either. A published default on an
 * account that can create other administrators is a backdoor in any deployment
 * where seeding was run once and then forgotten about.
 */
import crypto from 'node:crypto';
import { pool, query } from '../config/db.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/password.js';

const force = process.argv.includes('--force');

const DEMO_PASSWORD = 'Test@1234';

/** Satisfies the 8-16 character, one-uppercase, one-special policy. */
function generatePassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const specials = '!@#$%^&*?-_=+';
  const pick = (set) => set[crypto.randomInt(set.length)];

  const chars = [pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick(specials)];
  while (chars.length < 14) chars.push(pick(alphabet));

  // Shuffle, so the two guaranteed characters are not always in the same place.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const adminPassword = env.seedAdminPassword || generatePassword();
const adminPasswordWasGenerated = !env.seedAdminPassword;

async function assertSafeToSeed() {
  if (env.isProduction) {
    throw new Error('refusing to run with NODE_ENV=production - this command deletes every row');
  }

  const { rows } = await query(
    'SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM stores) AS stores',
  );
  const { users, stores } = rows[0];

  if ((users > 0 || stores > 0) && !force) {
    throw new Error(
      `database already holds ${users} user(s) and ${stores} store(s), and seeding truncates ` +
        'all three tables. Re-run with --force if discarding them is what you want.',
    );
  }
}

const OWNERS = [
  {
    name: 'Sanjay Venkataraman Pillai',
    email: 'sanjay.pillai@storerate.com',
    address: '14 Marine Lines, Fort District, Mumbai 400001',
  },
  {
    name: 'Nandini Balasubramanian Iyer',
    email: 'nandini.iyer@storerate.com',
    address: '78 Anna Salai, Nungambakkam, Chennai 600034',
  },
  {
    name: 'Farhan Abdul Rahman Sheikh',
    email: 'farhan.sheikh@storerate.com',
    address: '203 Banjara Hills Road No 12, Hyderabad 500034',
  },
];

const USERS = [
  {
    name: 'Aarav Deshmukh Kulkarni',
    email: 'aarav.kulkarni@example.com',
    address: '22 Shivaji Nagar, Pune 411005',
  },
  {
    name: 'Ishita Bandyopadhyay Sen',
    email: 'ishita.sen@example.com',
    address: '5 Park Street, Kolkata 700016',
  },
  {
    name: 'Rohan Vishwanathan Nair',
    email: 'rohan.nair@example.com',
    address: '9 MG Road, Bengaluru 560001',
  },
  {
    name: 'Meera Krishnamurthy Rao',
    email: 'meera.rao@example.com',
    address: '41 Jubilee Hills, Hyderabad 500033',
  },
  {
    name: 'Kabir Chatterjee Mukherjee',
    email: 'kabir.mukherjee@example.com',
    address: '17 Connaught Place, New Delhi 110001',
  },
];

const STORES = [
  {
    name: 'Sunrise Electronics Emporium',
    email: 'contact@sunriseelectronics.com',
    address: '12 Linking Road, Bandra West, Mumbai 400050',
    ownerIndex: 0,
  },
  {
    name: 'Golden Leaf Organic Grocers',
    email: 'hello@goldenleafgrocers.com',
    address: '88 Residency Road, Bengaluru 560025',
    ownerIndex: 0,
  },
  {
    name: 'Metro Fashion House Boutique',
    email: 'care@metrofashionhouse.com',
    address: '31 Commercial Street, Chennai 600002',
    ownerIndex: 1,
  },
  {
    name: 'Riverside Book Depot And Cafe',
    email: 'books@riversidedepot.com',
    address: '4 College Street, Kolkata 700073',
    ownerIndex: 2,
  },
  {
    name: 'Himalaya Sports And Fitness Hub',
    email: 'team@himalayasports.com',
    address: '56 Sector 17, Chandigarh 160017',
    ownerIndex: 2,
  },
];

// [storeIndex, userIndex, rating] - fixed so the demo numbers are reproducible.
const RATINGS = [
  [0, 0, 5], [0, 1, 4], [0, 2, 5], [0, 3, 4],
  [1, 0, 3], [1, 2, 4], [1, 4, 5],
  [2, 1, 2], [2, 3, 3], [2, 4, 4],
  [3, 0, 5], [3, 1, 5], [3, 2, 4], [3, 3, 5], [3, 4, 5],
  [4, 2, 2], [4, 4, 3],
];

async function insertUser({ name, email, address, role, passwordHash }) {
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, email, passwordHash, address, role],
  );
  return rows[0].id;
}

async function seed() {
  await assertSafeToSeed();

  await query('TRUNCATE ratings, stores, users RESTART IDENTITY CASCADE');
  console.log('[seed] cleared existing data');

  const adminHash = await hashPassword(adminPassword);
  const demoHash = await hashPassword(DEMO_PASSWORD);

  await insertUser({
    name: 'Priya Ramachandran Iyer Menon',
    email: env.seedAdminEmail,
    address: 'StoreRate HQ, 1 Infinity Tower, Gurugram 122002',
    role: 'ADMIN',
    passwordHash: adminHash,
  });

  const ownerIds = [];
  for (const owner of OWNERS) {
    ownerIds.push(await insertUser({ ...owner, role: 'OWNER', passwordHash: demoHash }));
  }

  const userIds = [];
  for (const user of USERS) {
    userIds.push(await insertUser({ ...user, role: 'USER', passwordHash: demoHash }));
  }

  const storeIds = [];
  for (const store of STORES) {
    const { rows } = await query(
      `INSERT INTO stores (name, email, address, owner_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [store.name, store.email, store.address, ownerIds[store.ownerIndex]],
    );
    storeIds.push(rows[0].id);
  }

  for (const [storeIndex, userIndex, value] of RATINGS) {
    await query('INSERT INTO ratings (user_id, store_id, rating) VALUES ($1, $2, $3)', [
      userIds[userIndex],
      storeIds[storeIndex],
      value,
    ]);
  }

  console.log(
    `[seed] inserted 1 admin, ${ownerIds.length} owners, ${userIds.length} users, ` +
      `${storeIds.length} stores, ${RATINGS.length} ratings`,
  );
  console.log('\n  Sign in with:');
  console.log(`    Admin       ${env.seedAdminEmail} / ${adminPassword}`);
  console.log(`    Store Owner ${OWNERS[0].email} / ${DEMO_PASSWORD}`);
  console.log(`    Normal User ${USERS[0].email} / ${DEMO_PASSWORD}\n`);

  if (adminPasswordWasGenerated) {
    console.log('  That admin password was generated for this run and is stored nowhere else.');
    console.log('  Copy it now, or set SEED_ADMIN_PASSWORD to choose your own.\n');
  }
}

try {
  await seed();
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
