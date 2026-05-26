CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  balance REAL DEFAULT 0.00,
  role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  holder_name TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  method_id INTEGER REFERENCES payment_methods(id),
  amount REAL NOT NULL,
  sender_number TEXT,
  transaction_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  game_key TEXT,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO payment_methods (name, account_number, holder_name) VALUES ('Bkash', '01XXXXXXXXX', 'Admin');
INSERT OR IGNORE INTO payment_methods (name, account_number, holder_name) VALUES ('Rocket', '01XXXXXXXXX', 'Admin');
INSERT OR IGNORE INTO payment_methods (name, account_number, holder_name) VALUES ('Nagad', '01XXXXXXXXX', 'Admin');
