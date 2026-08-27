import { query } from '../config/db.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { resolvePagination, resolveSort, WhereBuilder } from '../utils/listQuery.js';

const SORT_COLUMNS = {
  name: 'LOWER(s.name)',
  address: 'LOWER(s.address)',
  rating: 'sm.average_rating',
  myRating: 'my.rating',
};

/**
 * GET /api/stores
 * The Normal User store list: searchable by name and address, showing the
 * overall rating alongside the rating this user submitted (if any).
 */
export const listStores = asyncHandler(async (req, res) => {
  const { name, address, search } = req.query;
  const { page, limit, offset } = resolvePagination(req.query);
  const sort = resolveSort(req.query.sortBy, req.query.sortOrder, SORT_COLUMNS, 'name');

  // `my.rating` is bound first so its placeholder stays $1 regardless of filters.
  const where = new WhereBuilder(2);
  where.like('LOWER(s.name)', name);
  where.like('LOWER(s.address)', address);
  if (search && String(search).trim()) {
    const term = `%${String(search).trim().toLowerCase()}%`;
    where.add('(LOWER(s.name) LIKE $? OR LOWER(s.address) LIKE $?)', term, term);
  }

  const whereSql = where.sql();
  // The count query keeps the same LEFT JOIN so the WHERE placeholders, which are
  // numbered from $2, still line up with $1 = the current user id. The join cannot
  // duplicate rows: ratings is UNIQUE on (user_id, store_id).
  const total = await query(
    `SELECT COUNT(*) AS count
     FROM stores s
     LEFT JOIN ratings my ON my.store_id = s.id AND my.user_id = $1
     ${whereSql}`,
    [req.user.id, ...where.values],
  );

  const { rows } = await query(
    `SELECT s.id, s.name, s.address,
            sm.average_rating, sm.rating_count,
            my.rating AS my_rating
     FROM stores s
     JOIN store_ratings_summary sm ON sm.store_id = s.id
     LEFT JOIN ratings my ON my.store_id = s.id AND my.user_id = $1
     ${whereSql}
     ORDER BY ${sort.column} ${sort.direction} NULLS LAST, s.id ASC
     LIMIT $${where.nextIndex} OFFSET $${where.nextIndex + 1}`,
    [req.user.id, ...where.values, limit, offset],
  );

  res.json({
    data: rows,
    pagination: { page, limit, total: total.rows[0].count, totalPages: Math.ceil(total.rows[0].count / limit) },
    sort: { sortBy: sort.key, sortOrder: sort.direction.toLowerCase() },
  });
});

/** GET /api/stores/:id */
export const getStore = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.name, s.email, s.address,
            sm.average_rating, sm.rating_count,
            my.rating AS my_rating
     FROM stores s
     JOIN store_ratings_summary sm ON sm.store_id = s.id
     LEFT JOIN ratings my ON my.store_id = s.id AND my.user_id = $2
     WHERE s.id = $1`,
    [req.params.id, req.user.id],
  );

  if (rows.length === 0) throw ApiError.notFound('Store not found');
  res.json({ store: rows[0] });
});
