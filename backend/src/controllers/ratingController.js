import { query } from '../config/db.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

/**
 * PUT /api/stores/:id/rating
 * Submitting and modifying a rating are the same operation: the (user_id,
 * store_id) unique constraint turns the second submission into an update.
 */
export const submitRating = asyncHandler(async (req, res) => {
  const storeId = req.params.id;
  const { rating } = req.body;

  const store = await query('SELECT 1 FROM stores WHERE id = $1', [storeId]);
  if (store.rowCount === 0) throw ApiError.notFound('Store not found');

  const { rows } = await query(
    `INSERT INTO ratings (user_id, store_id, rating)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, store_id)
     DO UPDATE SET rating = EXCLUDED.rating
     RETURNING id, store_id, rating, (xmax = 0) AS inserted`,
    [req.user.id, storeId, rating],
  );

  const summary = await query(
    'SELECT average_rating, rating_count FROM store_ratings_summary WHERE store_id = $1',
    [storeId],
  );

  res.status(rows[0].inserted ? 201 : 200).json({
    rating: { storeId: rows[0].store_id, value: rows[0].rating },
    store: summary.rows[0],
  });
});

/** DELETE /api/stores/:id/rating - withdraw a previously submitted rating. */
export const deleteRating = asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM ratings WHERE user_id = $1 AND store_id = $2', [
    req.user.id,
    req.params.id,
  ]);

  if (rowCount === 0) throw ApiError.notFound('You have not rated this store');
  res.json({ message: 'Rating removed' });
});
