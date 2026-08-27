-- =============================================================
--  Password changes must revoke tokens issued before them
-- =============================================================
--  JWTs are stateless: once signed, one stays valid for its full
--  lifetime. That meant a user who changed their password because
--  they believed it was compromised did not actually cut off
--  whoever held a token minted with the old one - that session
--  kept working for the rest of the seven-day window.
--
--  Recording when the password last changed gives the auth
--  middleware something to compare a token's `iat` against, so
--  changing the password ends every existing session immediately.
-- =============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing rows take NOW() as their default, which is in the past relative to
-- any token issued from here on, so no one is signed out by this migration.

COMMENT ON COLUMN users.password_changed_at IS
    'Tokens issued at or before this instant are rejected. Set on every password change.';
