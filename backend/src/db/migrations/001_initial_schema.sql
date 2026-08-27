-- =============================================================
--  Store Rating Platform - PostgreSQL schema
-- =============================================================
--  Three entities:
--    users   - every account on the platform (ADMIN / USER / OWNER)
--    stores  - a store registered on the platform, owned by a user
--    ratings - one row per (user, store) pair, value 1..5
--
--  Business rules encoded in the schema itself so the database
--  stays consistent even if a bug slips past the API layer:
--    * name length 20..60, address <= 400  (assessment spec)
--    * a user may rate a given store at most once  (UNIQUE)
--    * ratings are constrained to the 1..5 range   (CHECK)
-- =============================================================

CREATE TYPE user_role AS ENUM ('ADMIN', 'USER', 'OWNER');

-- -------------------------------------------------------------
-- users
-- -------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(60)  NOT NULL
                  CONSTRAINT users_name_length CHECK (char_length(name) BETWEEN 20 AND 60),
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT         NOT NULL,
    address       VARCHAR(400) NOT NULL DEFAULT ''
                  CONSTRAINT users_address_length CHECK (char_length(address) <= 400),
    role          user_role    NOT NULL DEFAULT 'USER',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness: Foo@x.com and foo@x.com are the same account.
CREATE UNIQUE INDEX users_email_unique_idx ON users (LOWER(email));
CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_name_idx ON users (LOWER(name));

-- -------------------------------------------------------------
-- stores
-- -------------------------------------------------------------
CREATE TABLE stores (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(60)  NOT NULL
               CONSTRAINT stores_name_length CHECK (char_length(name) BETWEEN 20 AND 60),
    email      VARCHAR(255) NOT NULL,
    address    VARCHAR(400) NOT NULL DEFAULT ''
               CONSTRAINT stores_address_length CHECK (char_length(address) <= 400),
    -- The store owner. ON DELETE SET NULL keeps the store (and its ratings)
    -- alive if the owning account is removed.
    owner_id   INTEGER      REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX stores_email_unique_idx ON stores (LOWER(email));
CREATE INDEX stores_owner_idx ON stores (owner_id);
CREATE INDEX stores_name_idx ON stores (LOWER(name));
CREATE INDEX stores_address_idx ON stores (LOWER(address));

-- -------------------------------------------------------------
-- ratings
-- -------------------------------------------------------------
CREATE TABLE ratings (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER   NOT NULL REFERENCES users (id)  ON DELETE CASCADE,
    store_id   INTEGER   NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    rating     SMALLINT  NOT NULL
               CONSTRAINT ratings_range CHECK (rating BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One rating per user per store; "modify my rating" is an UPDATE, not an INSERT.
    CONSTRAINT ratings_user_store_unique UNIQUE (user_id, store_id)
);

CREATE INDEX ratings_store_idx ON ratings (store_id);
CREATE INDEX ratings_user_idx  ON ratings (user_id);

-- -------------------------------------------------------------
-- updated_at maintenance
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at   BEFORE UPDATE ON users   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stores_set_updated_at  BEFORE UPDATE ON stores  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ratings_set_updated_at BEFORE UPDATE ON ratings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- store_ratings_summary
-- -------------------------------------------------------------
-- Keeps the "overall rating" calculation in one place instead of
-- repeating the aggregate in every query that needs it.
CREATE VIEW store_ratings_summary AS
SELECT
    s.id                                        AS store_id,
    COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS average_rating,
    COUNT(r.id)                                 AS rating_count
FROM stores s
LEFT JOIN ratings r ON r.store_id = s.id
GROUP BY s.id;
