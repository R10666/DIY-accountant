from datetime import datetime, timedelta


def _advance(date_str, cycle):
    """Given a date string and a billing cycle, return the next due date string."""
    d = datetime.strptime(date_str, "%Y-%m-%d")

    if cycle == 'weekly':
        d += timedelta(days=7)
    elif cycle == 'monthly':
        month = d.month + 1
        year = d.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        is_leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
        days_in_month = [31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        day = min(d.day, days_in_month[month - 1])
        d = d.replace(year=year, month=month, day=day)
    elif cycle == 'yearly':
        try:
            d = d.replace(year=d.year + 1)
        except ValueError:
            d = d.replace(year=d.year + 1, day=28)  # Feb 29 -> Feb 28
    elif cycle and cycle.endswith('days'):
        try:
            days = int(cycle.split()[0])
        except ValueError:
            return None
        if days <= 0:
            return None
        d += timedelta(days=days)
    else:
        return None

    return d.strftime("%Y-%m-%d")


def sync_subscription_payments(conn):
    """
    The single, authoritative place recurring payments get generated.
    Walks every ACTIVE subscription forward from its most recent payment
    (or its start_date if it has none yet) and inserts one row per
    elapsed cycle, up to today.

    This is called from the subscriptions and transactions routers
    (anywhere the frontend reads data), and from the test-data generator
    — so there is exactly one implementation of "what payments are due"
    that every consumer, real or test, goes through.
    """
    cursor = conn.cursor()
    today_str = datetime.now().strftime("%Y-%m-%d")

    cursor.execute("SELECT id, amount, billing_cycle, start_date FROM subscriptions WHERE status = 'active'")
    subs = cursor.fetchall()

    for sub_id, amount, cycle, start_date in subs:
        cursor.execute(
            "SELECT MAX(purchase_date) FROM subscription_payments WHERE subscription_id = ?",
            (sub_id,)
        )
        last_paid = cursor.fetchone()[0]
        anchor = last_paid or start_date

        # First payment hasn't landed yet but is already due.
        if not last_paid and anchor <= today_str:
            cursor.execute(
                "INSERT OR IGNORE INTO subscription_payments (subscription_id, amount, purchase_date) VALUES (?, ?, ?)",
                (sub_id, amount, anchor)
            )

        safety = 0
        while True:
            safety += 1
            if safety > 2000:  # guard against a malformed cycle looping forever
                break
            nxt = _advance(anchor, cycle)
            if not nxt or nxt > today_str:
                break
            cursor.execute(
                "INSERT OR IGNORE INTO subscription_payments (subscription_id, amount, purchase_date) VALUES (?, ?, ?)",
                (sub_id, amount, nxt)
            )
            anchor = nxt

    conn.commit()
