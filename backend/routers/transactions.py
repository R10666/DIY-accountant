import sqlite3
from fastapi import APIRouter
from database import get_conn
from models import Transaction, TransactionUpdate
from subscription_sync import sync_subscription_payments

router = APIRouter(prefix="/api/transaction", tags=["transactions"])
ledger_router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.post("")
def add_transaction(transaction: Transaction):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO transactions
        (title, amount, type, url, purchase_date, receipt_file, notes, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
        (transaction.title, transaction.amount, transaction.type,
         transaction.url, transaction.purchase_date, transaction.receipt_file,
         transaction.notes, transaction.tags)
    )
    conn.commit()
    conn.close()
    return {"message": "Transaction saved successfully"}


@router.put("/{transaction_id}")
def update_transaction(transaction_id: int, update_data: TransactionUpdate):
    conn = get_conn()
    cursor = conn.cursor()
    update_dict = update_data.dict(exclude_unset=True)
    if not update_dict:
        conn.close()
        return {"message": "No data provided"}
    fields = [f"{k} = ?" for k in update_dict.keys()]
    values = list(update_dict.values())
    values.append(transaction_id)
    query = f"UPDATE transactions SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, tuple(values))
    conn.commit()
    conn.close()
    return {"message": "Transaction updated"}


@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
    conn.commit()
    conn.close()
    return {"message": "Transaction deleted"}


# --- Unified ledger: one-off transactions + realized subscription
#     payments, shaped so existing chart/history components can keep
#     reading is_subscription / billing_cycle per row. ---

@ledger_router.get("")
def get_transactions():
    conn = get_conn()
    conn.row_factory = sqlite3.Row
    sync_subscription_payments(conn)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM transactions")
    one_offs = [dict(r) for r in cursor.fetchall()]
    for t in one_offs:
        t["is_subscription"] = False
        t["billing_cycle"] = None
        t["subscription_id"] = None
        t["subscription_status"] = None

    cursor.execute('''
        SELECT
            sp.id AS id,
            s.title AS title,
            sp.amount AS amount,
            s.type AS type,
            s.billing_cycle AS billing_cycle,
            s.url AS url,
            sp.purchase_date AS purchase_date,
            s.receipt_file AS receipt_file,
            s.notes AS notes,
            s.tags AS tags,
            sp.refunded_amount AS refunded_amount,
            s.id AS subscription_id,
            s.status AS subscription_status
        FROM subscription_payments sp
        JOIN subscriptions s ON s.id = sp.subscription_id
    ''')
    sub_payments = [dict(r) for r in cursor.fetchall()]
    for sp in sub_payments:
        sp["is_subscription"] = True

    combined = one_offs + sub_payments
    combined.sort(key=lambda t: t["purchase_date"], reverse=True)

    conn.close()
    return {"transactions": combined}
