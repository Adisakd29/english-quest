-- ===== P1-7: Social Safety — บล็อก / รายงานผู้ใช้ =====
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT ck_block_not_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id          SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      VARCHAR(24) NOT NULL,
  details     VARCHAR(500),
  status      VARCHAR(16) NOT NULL DEFAULT 'open',   -- open / reviewed / dismissed
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_report_reason CHECK (reason IN ('spam', 'harassment', 'inappropriate_name', 'cheating', 'other')),
  CONSTRAINT ck_report_status CHECK (status IN ('open', 'reviewed', 'dismissed')),
  CONSTRAINT ck_report_not_self CHECK (reporter_id <> reported_id)
);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports (status, created_at);
