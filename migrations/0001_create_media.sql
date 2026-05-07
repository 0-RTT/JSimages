-- Migration number: 0001      2024-12-16T00:00:00.000Z
CREATE TABLE IF NOT EXISTS media (
    url TEXT PRIMARY KEY,
    size INTEGER NOT NULL DEFAULT 0,
    type TEXT DEFAULT '',
    uploaded_at TEXT DEFAULT ''
);
