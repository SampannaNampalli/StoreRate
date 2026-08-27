-- =============================================================
--  Keep running rating totals on the store row
-- =============================================================
--  store_ratings_summary aggregated the whole ratings table:
--
--      FROM stores s LEFT JOIN ratings r ON r.store_id = s.id
--      GROUP BY s.id
--
--  Every store listing, every store detail page and every admin
--  user page joined that view, so the cost of listing one page of
--  stores grew with the total number of ratings on the platform -
--  the more successful the site, the slower every page.
--
--  Two counters on the store row, maintained by a trigger, turn
--  that aggregate into a division. The view keeps exactly the same
--  columns and meaning, so nothing that reads it has to change.
--
--  The trigger is the only writer. Application code never touches
--  these columns, so they cannot drift the way hand-maintained
--  counters usually do.
-- =============================================================

ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_sum   BIGINT  NOT NULL DEFAULT 0;

-- Backfill from the rows that already exist.
UPDATE stores s
SET rating_count = agg.count,
    rating_sum   = agg.sum
FROM (
    SELECT store_id, COUNT(*) AS count, SUM(rating) AS sum
    FROM ratings
    GROUP BY store_id
) AS agg
WHERE agg.store_id = s.id;

CREATE OR REPLACE FUNCTION sync_store_rating_totals() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE stores
        SET rating_count = rating_count + 1,
            rating_sum   = rating_sum + NEW.rating
        WHERE id = NEW.store_id;

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE stores
        SET rating_count = rating_count - 1,
            rating_sum   = rating_sum - OLD.rating
        WHERE id = OLD.store_id;

    ELSIF (TG_OP = 'UPDATE') THEN
        -- A rating can move between stores as well as change value.
        IF (OLD.store_id = NEW.store_id) THEN
            UPDATE stores
            SET rating_sum = rating_sum - OLD.rating + NEW.rating
            WHERE id = NEW.store_id;
        ELSE
            UPDATE stores
            SET rating_count = rating_count - 1,
                rating_sum   = rating_sum - OLD.rating
            WHERE id = OLD.store_id;

            UPDATE stores
            SET rating_count = rating_count + 1,
                rating_sum   = rating_sum + NEW.rating
            WHERE id = NEW.store_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ratings_sync_store_totals ON ratings;
CREATE TRIGGER ratings_sync_store_totals
    AFTER INSERT OR UPDATE OR DELETE ON ratings
    FOR EACH ROW EXECUTE FUNCTION sync_store_rating_totals();

-- Same columns, same rounding, same zero-for-no-ratings behaviour as before;
-- it just no longer reads the ratings table to produce them.
CREATE OR REPLACE VIEW store_ratings_summary AS
SELECT
    s.id AS store_id,
    CASE
        WHEN s.rating_count = 0 THEN 0::numeric
        ELSE ROUND(s.rating_sum::numeric / s.rating_count, 2)
    END  AS average_rating,
    s.rating_count::bigint AS rating_count
FROM stores s;
