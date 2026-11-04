
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medications
  ADD COLUMN owner_id INT REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE medications
  ADD COLUMN owner_id INT REFERENCES users(id) ON DELETE CASCADE;

-- Sharing and pill tracking
CREATE TABLE dogs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE dog_members (
  dog_id INT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'sitter')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (dog_id, user_id)
);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  dog_id INT NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by INT REFERENCES users(id)
);

ALTER TABLE medications
  ADD COLUMN dog_id INT REFERENCES dogs(id) ON DELETE CASCADE,
  ADD COLUMN pills_per_dose INT NOT NULL DEFAULT 1,
  ADD COLUMN pills_total INT,
  ADD COLUMN pills_remaining INT,
  ADD COLUMN created_by INT REFERENCES users(id);

ALTER TABLE medications ALTER COLUMN dog_name DROP NOT NULL;

ALTER TABLE med_logs
  ADD COLUMN logged_by INT REFERENCES users(id),
  ADD COLUMN pills_used INT NOT NULL DEFAULT 0;

-- Keep history when a user is deleted
ALTER TABLE medications
  DROP CONSTRAINT medications_created_by_fkey,
  ADD CONSTRAINT medications_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE med_logs
  DROP CONSTRAINT med_logs_logged_by_fkey,
  ADD CONSTRAINT med_logs_logged_by_fkey
    FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE invites
  DROP CONSTRAINT invites_used_by_fkey,
  ADD CONSTRAINT invites_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL;
