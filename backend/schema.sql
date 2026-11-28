CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    password_hash bytea NOT NULL,
    password_salt bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash bytea PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens (expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
    key_hash bytea PRIMARY KEY,
    attempts integer NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash bytea PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS events (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 90),
    event_date date NOT NULL,
    event_time time(0) NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS events_calendar_idx ON events (user_id, event_date, event_time, id);

CREATE TABLE IF NOT EXISTS planner_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    task_order text NOT NULL CHECK (task_order IN ('priority', 'added', 'name', 'manual'))
);

CREATE TABLE IF NOT EXISTS tasks (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id text NOT NULL,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
    task_date date NOT NULL,
    task_time time(0),
    parent_id text CHECK (parent_id <> id),
    project text NOT NULL DEFAULT '' CHECK (char_length(project) <= 60),
    priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
    done boolean NOT NULL DEFAULT false,
    done_late boolean NOT NULL DEFAULT false CHECK (NOT done_late OR done),
    featured boolean NOT NULL DEFAULT false,
    featured_date date GENERATED ALWAYS AS (CASE WHEN featured THEN task_date END) STORED,
    manual_order bigint CHECK (manual_order BETWEEN 0 AND 9007199254740991),
    copied_from_task_id text,
    added_order bigint GENERATED ALWAYS AS IDENTITY,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    PRIMARY KEY (user_id, id),
    UNIQUE (user_id, id, task_date),
    UNIQUE (user_id, featured_date) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (user_id, parent_id, task_date) REFERENCES tasks (user_id, id, task_date)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS tasks_added_idx ON tasks (user_id, added_order);

CREATE TABLE IF NOT EXISTS imported_planner_records (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_kind text NOT NULL CHECK (record_kind IN ('event', 'task')),
    legacy_id text NOT NULL,
    PRIMARY KEY (user_id, record_kind, legacy_id)
);
