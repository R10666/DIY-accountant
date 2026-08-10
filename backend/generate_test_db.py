import sqlite3
import random
import os
from datetime import datetime, timedelta

from database import DB_FILE, init_db, get_conn
from subscription_sync import sync_subscription_payments


def generate_mock_data():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)

    init_db()
    conn = get_conn()
    cursor = conn.cursor()

    tags_data = [
        ('Food & Dining', '#ef4444'),
        ('Tech & Gear', '#6366f1'),
        ('Utilities', '#f59e0b'),
        ('Entertainment', '#ec4899'),
        ('Subscriptions', '#10b981'),
    ]
    cursor.executemany("REPLACE INTO tags (name, color) VALUES (?, ?)", tags_data)

    start_date = datetime.now() - timedelta(days=180)

    cursor.execute(
        '''INSERT INTO transactions (title, amount, type, purchase_date, tags)
           VALUES (?, ?, ?, ?, ?)''',
        ("Initial Bank Deposit", 5000.00, "adjustment", start_date.strftime('%Y-%m-%d'), '[]')
    )

    # Subscriptions: definitions only. Payments are generated the same way
    # the real backend generates them — via sync_subscription_payments —
    # so test data and production data are produced by the exact same code
    # path instead of two logics that could drift apart.
    subscriptions = [
        ("Netflix", 15.99, "purchase", "monthly", '["Entertainment", "Subscriptions"]'),
        ("Cloud Storage", 9.99, "purchase", "monthly", '["Tech & Gear", "Subscriptions"]'),
        ("Internet Bill", 65.00, "purchase", "monthly", '["Utilities"]'),
        ("Gym Membership", 45.00, "purchase", "monthly", '["Subscriptions"]'),
    ]

    for title, amount, s_type, cycle, tags_json in subscriptions:
        sub_start = (start_date + timedelta(days=5)).strftime('%Y-%m-%d')
        cursor.execute(
            '''INSERT INTO subscriptions (title, amount, type, billing_cycle, status, start_date, tags)
               VALUES (?, ?, ?, ?, 'active', ?, ?)''',
            (title, amount, s_type, cycle, sub_start, tags_json)
        )

    conn.commit()
    sync_subscription_payments(conn)

    random_purchases = [
        ("Groceries Supermarket", 85.50, "Food & Dining"),
        ("Coffee & Pastries", 12.40, "Food & Dining"),
        ("New USB-C Cable", 18.99, "Tech & Gear"),
        ("Restaurant Dinner", 64.20, "Food & Dining"),
        ("Electricity Bill", 112.50, "Utilities"),
        ("Movie Tickets", 28.00, "Entertainment"),
        ("Mechanical Keyboard", 129.99, "Tech & Gear"),
        ("Fast Food Run", 22.50, "Food & Dining"),
        ("Mobile Phone Bill", 45.00, "Utilities"),
        ("Steam Game Purchase", 39.99, "Entertainment"),
    ]

    for _ in range(60):
        item = random.choice(random_purchases)
        days_ago = random.randint(0, 175)
        p_date = datetime.now() - timedelta(days=days_ago)
        price_variance = round(item[1] * random.uniform(0.9, 1.3), 2)

        cursor.execute(
            '''INSERT INTO transactions (title, amount, type, purchase_date, tags, notes)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (item[0], price_variance, "purchase", p_date.strftime('%Y-%m-%d'), f'["{item[2]}"]', "Automatically generated test data.")
        )

    conn.commit()
    conn.close()
    print("Successfully generated test database with the split backend structure!")


if __name__ == "__main__":
    generate_mock_data()
