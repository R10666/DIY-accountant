import sqlite3
import os

DB_FILE = "finance.db"
UPLOAD_DIR = "uploads"

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


def get_conn():
    """
    Every route grabs its own short-lived connection. This app is a
    single local user with sqlite on disk, so there's no pooling to worry
    about — this just gives every router one consistent place to open a
    connection instead of repeating sqlite3.connect(DB_FILE) everywhere.
    """
    return sqlite3.connect(DB_FILE)


def init_db():
    conn = get_conn()
    cursor = conn.cursor()

    # One-off ledger events ONLY: purchases, deposits, refunds, manual
    # adjustments. Subscriptions live entirely in the two tables below.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            amount REAL,
            type TEXT,
            url TEXT,
            purchase_date TEXT,
            receipt_file TEXT,
            notes TEXT,
            tags TEXT DEFAULT '[]',
            refunded_amount REAL DEFAULT 0
        )
    ''')

    # One record per recurring commitment, with a single authoritative
    # `status`. Stopping/restarting is ONE update to ONE row.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            billing_cycle TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            start_date TEXT NOT NULL,
            url TEXT,
            notes TEXT,
            tags TEXT DEFAULT '[]',
            receipt_file TEXT
        )
    ''')

    # Every realized payment for a subscription is its own row here, tied
    # to exactly one subscription_id. This is what gets summed for
    # spending/balance calculations.
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS subscription_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
            amount REAL NOT NULL,
            purchase_date TEXT NOT NULL,
            refunded_amount REAL DEFAULT 0,
            UNIQUE(subscription_id, purchase_date)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            name TEXT PRIMARY KEY,
            color TEXT
        )
    ''')

    cursor.execute("INSERT OR IGNORE INTO tags (name, color) VALUES ('General', '#64748b')")

    conn.commit()
    conn.close()
