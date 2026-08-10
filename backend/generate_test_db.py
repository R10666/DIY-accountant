import sqlite3
import random
from datetime import datetime, timedelta

DB_FILE = "finance.db"

def generate_mock_data():
    # Remove existing db to start fresh
    import os
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 1. Create Tables matching your current schema
    cursor.execute('''
        CREATE TABLE transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            amount REAL,
            type TEXT, 
            is_subscription BOOLEAN,
            billing_cycle TEXT, 
            url TEXT,
            purchase_date TEXT,
            receipt_file TEXT,
            notes TEXT,
            tags TEXT DEFAULT '[]', 
            refunded_amount REAL DEFAULT 0
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE tags (
            name TEXT PRIMARY KEY,
            color TEXT
        )
    ''')

    # 2. Insert Custom Colored Tags
    tags_data = [
        ('Food & Dining', '#ef4444'), # Red
        ('Tech & Gear', '#6366f1'),   # Indigo
        ('Utilities', '#f59e0b'),     # Amber
        ('Entertainment', '#ec4899'), # Pink
        ('Subscriptions', '#10b981')  # Emerald
    ]
    cursor.executemany("INSERT INTO tags (name, color) VALUES (?, ?)", tags_data)

    # 3. Insert Starting Fund Adjustment (6 months ago)
    start_date = datetime.now() - timedelta(days=180)
    cursor.execute(
        '''INSERT INTO transactions (title, amount, type, is_subscription, purchase_date, tags) 
           VALUES (?, ?, ?, ?, ?, ?)''',
        ("Initial Bank Deposit", 5000.00, "adjustment", False, start_date.strftime('%Y-%m-%d'), '[]')
    )

    # 4. Insert Subscriptions (Active recurring items)
    subscriptions = [
        ("Netflix", 15.99, "monthly", '["Entertainment", "Subscriptions"]'),
        ("Cloud Storage", 9.99, "monthly", '["Tech & Gear", "Subscriptions"]'),
        ("Internet Bill", 65.00, "monthly", '["Utilities"]'),
        ("Gym Membership", 45.00, "monthly", '["Subscriptions"]')
    ]

    # Generate historical subscription payments every month for the past 6 months
    for title, amount, cycle, tags_json in subscriptions:
        curr_date = start_date + timedelta(days=5)
        while curr_date <= datetime.now():
            cursor.execute(
                '''INSERT INTO transactions (title, amount, type, is_subscription, billing_cycle, purchase_date, tags) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (title, amount, "purchase", True, cycle, curr_date.strftime('%Y-%m-%d'), tags_json)
            )
            curr_date += timedelta(days=30)

    # 5. Generate Random Past Purchases (Food, Tech, Gear over the last 180 days)
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
        ("Steam Game Purchase", 39.99, "Entertainment")
    ]

    # Spread out ~60 random purchases across the 6 months
    for _ in range(60):
        item = random.choice(random_purchases)
        days_ago = random.randint(0, 175)
        p_date = datetime.now() - timedelta(days=days_ago)
        
        # Add minor random price variance
        price_variance = round(item[1] * random.uniform(0.9, 1.3), 2)

        cursor.execute(
            '''INSERT INTO transactions (title, amount, type, is_subscription, purchase_date, tags, notes) 
               VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (item[0], price_variance, "purchase", False, p_date.strftime('%Y-%m-%d'), f'["{item[2]}"]', "Automatically generated test data.")
        )

    conn.commit()
    conn.close()
    print("Successfully generated rich test database ('finance.db') with 6 months of history and projections!")

if __name__ == "__main__":
    generate_mock_data()