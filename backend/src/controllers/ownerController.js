import { query } from '../config/db.js';
import { asyncHandler } from '../utils/ApiError.js';
import { resolvePagination, resolveSort } from '../utils/listQuery.js';

const RATER_SORT_COLUMNS = {
  name: 'LOWER(u.name)',
  email: 'LOWER(u.email)',
  address: 'LOWER(u.address)',
  rating: 'r.rating',
  ratedAt: 'r.updated_at',
};

/**
 * GET /api/owner/dashboard
 * Every store this owner is assigned to, its average rating, and the users who
 * rated it. A `storeId` query param narrows the rater list to one store.
 *
 * The rater list is paginated. It used to return one row per rating with no
 * limit, so the response grew with the store's popularity - the owner of a
 * well-rated store got the slowest dashboard, and a single request could pull
 * the entire ratings table for those stores into memory.
 */
export const dashboard = asyncHandler(async (req, res) => {
  const sort = resolveSort(req.query.sortBy, req.query.sortOrder, RATER_SORT_COLUMNS, 'ratedAt');
  const { page, limit, offset } = resolvePagination(req.query, { defaultLimit: 20 });

  const stores = await query(
    `SELECT s.id, s.name, s.email, s.address, sm.average_rating, sm.rating_count
     FROM stores s
     JOIN store_ratings_summary sm ON sm.store_id = s.id
     WHERE s.owner_id = $1
     ORDER BY LOWER(s.name) ASC`,
    [req.user.id],
  );

  const storeIds = stores.rows.map((s) => s.id);
  const requestedStoreId = Number.parseInt(req.query.storeId, 10);
  const scopedIds =
    Number.isInteger(requestedStoreId) && storeIds.includes(requestedStoreId)
      ? [requestedStoreId]
      : storeIds;

  const ratersTotal = scopedIds.length
    ? (await query('SELECT COUNT(*) AS count FROM ratings WHERE store_id = ANY($1::int[])', [scopedIds]))
        .rows[0].count
    : 0;

  const raters = scopedIds.length
    ? await query(
        `SELECT u.id AS user_id, u.name, u.email, u.address,
                r.rating, r.updated_at AS rated_at,
                s.id AS store_id, s.name AS store_name
         FROM ratings r
         JOIN users u  ON u.id = r.user_id
         JOIN stores s ON s.id = r.store_id
         WHERE r.store_id = ANY($1::int[])
         ORDER BY ${sort.column} ${sort.direction}, r.id ASC
         LIMIT $2 OFFSET $3`,
        [scopedIds, limit, offset],
      )
    : { rows: [] };

  // Rating count weighted across all owned stores, not an average of averages.
  const overall = await query(
    `SELECT COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS average_rating,
            COUNT(r.id) AS rating_count
     FROM stores s
     LEFT JOIN ratings r ON r.store_id = s.id
     WHERE s.owner_id = $1`,
    [req.user.id],
  );

  res.json({
    stores: stores.rows,
    raters: raters.rows,
    overall: overall.rows[0],
    pagination: { page, limit, total: ratersTotal, totalPages: Math.ceil(ratersTotal / limit) },
    sort: { sortBy: sort.key, sortOrder: sort.direction.toLowerCase() },
  });
});
