CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  password_reset_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS student_profiles (
  account_id BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  year_group TEXT,
  programme TEXT,
  house TEXT,
  email TEXT
);
CREATE TABLE IF NOT EXISTS announcements (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','students')),
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS timetable_entries (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_profiles(student_id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject TEXT NOT NULL,
  room TEXT,
  teacher TEXT,
  CHECK (end_time > start_time)
);
CREATE TABLE IF NOT EXISTS student_results (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_profiles(student_id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  term TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  score NUMERIC(5,2),
  grade TEXT,
  remark TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS announcements_published_created_idx ON announcements(published, created_at DESC);
CREATE INDEX IF NOT EXISTS timetable_student_weekday_idx ON timetable_entries(student_id, weekday);
CREATE INDEX IF NOT EXISTS results_student_published_idx ON student_results(student_id, published, academic_year, term);
