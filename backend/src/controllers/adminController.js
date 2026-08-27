import { query } from '../config/db.js';
import { ROLES } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { hashPassword } from '../utils/password.js';
import { resolvePagination, resolveSort, WhereBuilder } from '../utils/listQuery.js';

const USER_SORT_COLUMNS = {
  name: 'LOWER(u.name)',
  email: 'LOWER(u.email)',
  address: 'LOWER(u.address)',
  role: 'u.role',
  createdAt: 'u.created_at',
};

const STORE_SORT_COLUMNS = {
  name: 'LOWER(s.name)',
  email: 'LOWER(s.email)',
  address: 'LOWER(s.address)',
  rating: 'sm.average_rating',
  createdAt: 's.created_at',
};

/** The average rating across every store this user owns; NULL for non-owners. */
const OWNER_RATING_SUBQUERY = `
  CASE WHEN u.role = 'OWNER' THEN (
    SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)
    FROM stores s
    LEFT JOIN ratings r ON r.store_id = s.id
    WHERE s.owner_id = u.id
  ) END AS rating`;

/** GET /api/admin/dashboard */
export const dashboard = asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT
      (SELECT COUNT(*) FROM users)   AS total_users,
      (SELECT COUNT(*) FROM stores)  AS total_stores,
      (SELECT COUNT(*) FROM ratings) AS total_ratings
  `);

  res.json({
    totalUsers: rows[0].total_users,
    totalStores: rows[0].total_stores,
    totalRatings: rows[0].total_ratings,
  });
});

/** POST /api/admin/users - create a normal user, another admin, or a store owner. */
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, address = '', password, role = ROLES.USER } = req.body;

  const existing = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rowCount > 0) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, address, role`,
    [name, email, await hashPassword(password), address, role],
  );

  res.status(201).json({ user: rows[0] });
});

/** GET /api/admin/users - filter on name/email/address/role, sort, paginate. */
export const listUsers = asyncHandler(async (req, res) => {
  const { name, email, address, role } = req.query;
  const { page, limit, offset } = resolvePagination(req.query);
  const sort = resolveSort(req.query.sortBy, req.query.sortOrder, USER_SORT_COLUMNS, 'name');

  const where = new WhereBuilder();
  where.like('LOWER(u.name)', name);
  where.like('LOWER(u.email)', email);
  where.like('LOWER(u.address)', address);
  if (role && Object.values(ROLES).includes(role)) {
    where.add('u.role = $?', role);
  }

  const whereSql = where.sql();
  const total = await query(`SELECT COUNT(*) AS count FROM users u ${whereSql}`, where.values);

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.address, u.role, ${OWNER_RATING_SUBQUERY}
     FROM users u
     ${whereSql}
     ORDER BY ${sort.column} ${sort.direction}, u.id ASC
     LIMIT $${where.nextIndex} OFFSET $${where.nextIndex + 1}`,
    [...where.values, limit, offset],
  );

  res.json({
    data: rows,
    pagination: { page, limit, total: total.rows[0].count, totalPages: Math.ceil(total.rows[0].count / limit) },
    sort: { sortBy: sort.key, sortOrder: sort.direction.toLowerCase() },
  });
});

/** GET /api/admin/users/:id - full detail; store owners also carry their rating. */
export const getUser = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.address, u.role, u.created_at, ${OWNER_RATING_SUBQUERY}
     FROM users u WHERE u.id = $1`,
    [req.params.id],
  );

  if (rows.length === 0) throw ApiError.notFound('User not found');
  const user = rows[0];

  // For an owner, list the stores behind that rating so the admin sees the breakdown.
  if (user.role === ROLES.OWNER) {
    const stores = await query(
      `SELECT s.id, s.name, s.email, s.address, sm.average_rating, sm.rating_count
       FROM stores s
       JOIN store_ratings_summary sm ON sm.store_id = s.id
       WHERE s.owner_id = $1
       ORDER BY LOWER(s.name) ASC`,
      [user.id],
    );
    user.stores = stores.rows;
  }

  res.json({ user });
});

/** POST /api/admin/stores */
export const createStore = asyncHandler(async (req, res) => {
  const { name, email, address = '', ownerId = null } = req.body;

  const existing = await query('SELECT 1 FROM stores WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rowCount > 0) {
    throw ApiError.conflict('A store with this email already exists');
  }

  if (ownerId !== null) {
    const owner = await query('SELECT role FROM users WHERE id = $1', [ownerId]);
    if (owner.rowCount === 0) throw ApiError.badRequest('Selected owner does not exist');
    if (owner.rows[0].role !== ROLES.OWNER) {
      throw ApiError.badRequest('Selected user is not a Store Owner');
    }
  }

  const { rows } = await query(
    `INSERT INTO stores (name, email, address, owner_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, address, owner_id`,
    [name, email, address, ownerId],
  );

  res.status(201).json({ store: rows[0] });
});

/** GET /api/admin/stores - Name, Email, Address, Rating + owner, filterable and sortable. */
export const listStores = asyncHandler(async (req, res) => {
  const { name, email, address } = req.query;
  const { page, limit, offset } = resolvePagination(req.query);
  const sort = resolveSort(req.query.sortBy, req.query.sortOrder, STORE_SORT_COLUMNS, 'name');

  const where = new WhereBuilder();
  where.like('LOWER(s.name)', name);
  where.like('LOWER(s.email)', email);
  where.like('LOWER(s.address)', address);

  const whereSql = where.sql();
  const total = await query(`SELECT COUNT(*) AS count FROM stores s ${whereSql}`, where.values);

  const { rows } = await query(
    `SELECT s.id, s.name, s.email, s.address,
            s.owner_id, owner.name AS owner_name,
            sm.average_rating, sm.rating_count
     FROM stores s
     JOIN store_ratings_summary sm ON sm.store_id = s.id
     LEFT JOIN users owner ON owner.id = s.owner_id
     ${whereSql}
     ORDER BY ${sort.column} ${sort.direction}, s.id ASC
     LIMIT $${where.nextIndex} OFFSET $${where.nextIndex + 1}`,
    [...where.values, limit, offset],
  );

  res.json({
    data: rows,
    pagination: { page, limit, total: total.rows[0].count, totalPages: Math.ceil(total.rows[0].count / limit) },
    sort: { sortBy: sort.key, sortOrder: sort.direction.toLowerCase() },
  });
});

/**
 * GET /api/admin/owners - owner picker for the "create store" form.
 *
 * Bounded and filterable. Returning every owner row was fine at seed size and
 * grows without limit afterwards: one request that reads the whole table,
 * serialises it, and hands the browser a select element with thousands of
 * options in it.
 */
export const listOwners = asyncHandler(async (req, res) => {
  const { page, limit, offset } = resolvePagination(req.query, { defaultLimit: 100, maxLimit: 200 });

  const where = new WhereBuilder();
  where.add('u.role = $?', ROLES.OWNER);
  where.like('LOWER(u.name)', req.query.name);
  where.like('LOWER(u.email)', req.query.email);

  const whereSql = where.sql();
  const total = await query(`SELECT COUNT(*) AS count FROM users u ${whereSql}`, where.values);

  const { rows } = await query(
    `SELECT u.id, u.name, u.email
     FROM users u
     ${whereSql}
     ORDER BY LOWER(u.name) ASC, u.id ASC
     LIMIT $${where.nextIndex} OFFSET $${where.nextIndex + 1}`,
    [...where.values, limit, offset],
  );

  res.json({
    data: rows,
    pagination: {
      page,
      limit,
      total: total.rows[0].count,
      totalPages: Math.ceil(total.rows[0].count / limit),
    },
  });
});
