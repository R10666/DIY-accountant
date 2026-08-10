import sqlite3
from fastapi import APIRouter
from database import get_conn
from models import SubscriptionCreate, SubscriptionUpdate, PaymentUpdate
from subscription_sync import sync_subscription_payments, _advance

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])
payments_router = APIRouter(prefix="/api/subscription-payments", tags=["subscriptions"])


@router.get("")
def get_subscriptions():
    conn = get_conn()
    conn.row_factory = sqlite3.Row
    sync_subscription_payments(conn)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM subscriptions ORDER BY title ASC")
    subs = [dict(row) for row in cursor.fetchall()]

    for sub in subs:
        cursor.execute(
            "SELECT COUNT(*), COALESCE(SUM(amount - refunded_amount), 0), MAX(purchase_date) "
            "FROM subscription_payments WHERE subscription_id = ?",
            (sub["id"],)
        )
        count, lifetime_total, last_paid = cursor.fetchone()
        sub["payment_count"] = count
        sub["lifetime_total"] = lifetime_total
        sub["last_payment_date"] = last_paid
        sub["next_due_date"] = (
            _advance(last_paid or sub["start_date"], sub["billing_cycle"])
            if sub["status"] == "active" else None
        )
        # Convenience field so the frontend doesn't have to redo this
        # arithmetic itself: how many payments are left before this
        # subscription's own installment limit (if it has one) is hit.
        sub["remaining_installments"] = (
            max(0, sub["max_installments"] - count) if sub["max_installments"] is not None else None
        )

    conn.close()
    return {"subscriptions": subs}


@router.post("")
def create_subscription(sub: SubscriptionCreate):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO subscriptions
        (title, amount, type, billing_cycle, status, start_date, end_date, max_installments, url, notes, tags, receipt_file)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)''',
        (sub.title, sub.amount, sub.type, sub.billing_cycle, sub.start_date,
         sub.end_date, sub.max_installments, sub.url, sub.notes, sub.tags, sub.receipt_file)
    )
    conn.commit()
    sync_subscription_payments(conn)  # immediately materialize any already-due payment
    conn.close()
    return {"message": "Subscription created"}


@router.put("/{sub_id}")
def update_subscription(sub_id: int, update_data: SubscriptionUpdate):
    conn = get_conn()
    cursor = conn.cursor()
    update_dict = update_data.dict(exclude_unset=True)
    if not update_dict:
        conn.close()
        return {"message": "No data provided"}
    fields = [f"{k} = ?" for k in update_dict.keys()]
    values = list(update_dict.values())
    values.append(sub_id)
    query = f"UPDATE subscriptions SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, tuple(values))
    conn.commit()
    conn.close()
    return {"message": "Subscription updated"}


@router.delete("/{sub_id}")
def delete_subscription(sub_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM subscription_payments WHERE subscription_id = ?", (sub_id,))
    cursor.execute("DELETE FROM subscriptions WHERE id = ?", (sub_id,))
    conn.commit()
    conn.close()
    return {"message": "Subscription and its payment history deleted"}


@router.get("/{sub_id}/payments")
def get_subscription_payments(sub_id: int):
    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM subscription_payments WHERE subscription_id = ? ORDER BY purchase_date DESC",
        (sub_id,)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"payments": rows}


@payments_router.put("/{payment_id}")
def update_subscription_payment(payment_id: int, update_data: PaymentUpdate):
    conn = get_conn()
    cursor = conn.cursor()
    update_dict = update_data.dict(exclude_unset=True)
    if not update_dict:
        conn.close()
        return {"message": "No data provided"}
    fields = [f"{k} = ?" for k in update_dict.keys()]
    values = list(update_dict.values())
    values.append(payment_id)
    query = f"UPDATE subscription_payments SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, tuple(values))
    conn.commit()
    conn.close()
    return {"message": "Payment updated"}