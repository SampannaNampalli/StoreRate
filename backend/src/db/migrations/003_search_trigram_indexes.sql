-- =============================================================
--  Trigram indexes for the "contains" search filters
-- =============================================================
--  Every listing filter is a leading-wildcard match:
--
--      WHERE LOWER(u.name) LIKE '%kumar%'
--
--  A B-tree index cannot serve that - it can only seek on a known
--  prefix - so those queries fall back to a sequential scan of the
--  whole table. Fine at seed size, linear in row count after that.
--
--  A GIN index over trigrams does support it. The existing B-tree
--  indexes stay: they are what ORDER BY LOWER(name) sorts on.
--
--  pg_trgm ships with PostgreSQL but installing an extension needs
--  privileges a locked-down managed instance may withhold. That is
--  a missing optimisation, not a broken schema, so this migration
--  degrades to a notice instead of failing the deploy.
-- =============================================================

DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_trgm unavailable (%): skipping trigram indexes. Search falls back to sequential scans.', SQLERRM;
    END;

    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        RETURN;
    END IF;

    CREATE INDEX IF NOT EXISTS users_name_trgm_idx    ON users  USING GIN (LOWER(name)    gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS users_email_trgm_idx   ON users  USING GIN (LOWER(email)   gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS users_address_trgm_idx ON users  USING GIN (LOWER(address) gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS stores_name_trgm_idx    ON stores USING GIN (LOWER(name)    gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS stores_email_trgm_idx   ON stores USING GIN (LOWER(email)   gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS stores_address_trgm_idx ON stores USING GIN (LOWER(address) gin_trgm_ops);

    RAISE NOTICE 'trigram search indexes created';
END
$$;
