-- Additive migration: existing catalog, users and settings are preserved.
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO categories (id, name) VALUES
 ('geek','Geek'), ('decoracao','Decoração'), ('ferramentas','Ferramentas'),
 ('organizacao','Organização'), ('gadgets','Gadgets'), ('personalizados','Personalizados');
INSERT OR IGNORE INTO categories (id,name) SELECT DISTINCT category,category FROM products;

CREATE TRIGGER IF NOT EXISTS products_category_insert BEFORE INSERT ON products
WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category)
BEGIN SELECT RAISE(ABORT, 'Categoria inexistente'); END;
CREATE TRIGGER IF NOT EXISTS products_category_update BEFORE UPDATE OF category ON products
WHEN NOT EXISTS (SELECT 1 FROM categories WHERE id=NEW.category)
BEGIN SELECT RAISE(ABORT, 'Categoria inexistente'); END;

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  request_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  number TEXT NOT NULL UNIQUE,
  document TEXT NOT NULL,
  document_hash TEXT NOT NULL,
  calculation TEXT NOT NULL DEFAULT '{}',
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting','accepted','declined','changes','superseded')),
  previous_id TEXT REFERENCES quotes(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  responded_at INTEGER,
  response TEXT,
  receipt_hash TEXT,
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending','production','ready','dispatched','delivered','cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);
CREATE TABLE IF NOT EXISTS quote_email_challenges (
  quote_id TEXT PRIMARY KEY REFERENCES quotes(id),
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quote_mail (
  quote_id TEXT PRIMARY KEY REFERENCES quotes(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS quote_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  event TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  user_id INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS quote_payments (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_event_version ON quote_events(quote_id, json_extract(details,'$.version')) WHERE event='order';
