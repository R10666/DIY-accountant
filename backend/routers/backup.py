import json
import sqlite3
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from database import get_conn

router = APIRouter(prefix="/api", tags=["backup"])

EXPORT_VERSION = 1


@router.get("/export")
def export_data():
    """
    Everything needed to fully reconstruct the database: tags, one-off
    transactions, subscription definitions, and every realized
    subscription payment — with their real ids preserved, so
    subscription_payments.subscription_id still points at the right row
    after a restore.
    """
    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM tags")
    tags = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM transactions")
    transactions = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM subscriptions")
    subscriptions = [dict(r) for r in cursor.fetchall()]

    cursor.execute("SELECT * FROM subscription_payments")
    subscription_payments = [dict(r) for r in cursor.fetchall()]

    conn.close()

    return {
        "version": EXPORT_VERSION,
        "exported_at": datetime.now().isoformat(),
        "tags": tags,
        "transactions": transactions,
        "subscriptions": subscriptions,
        "subscription_payments": subscription_payments,
    }


@router.post("/import")
async def import_data(file: UploadFile = File(...)):
    try:
        raw = await file.read()
        data = json.loads(raw)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="That file isn't valid JSON — make sure you're uploading an export produced by this app."
        )

    required_keys = {"tags", "transactions", "subscriptions", "subscription_payments"}
    if not isinstance(data, dict) or not required_keys.issubset(data.keys()):
        raise HTTPException(
            status_code=400,
            detail="This file is missing expected data — it doesn't look like a valid backup from this app."
        )

    conn = get_conn()
    cursor = conn.cursor()

    try:
        # Full replace, deliberately: wipe everything currently in the
        # database, then restore exactly what's in the backup. Merging
        # with whatever's already there would risk silent duplicates or
        # id collisions, and isn't what "restore from a backup" means
        # anyway — this whole thing is wrapped in a transaction, so if
        # anything below fails, the rollback leaves the original data
        # completely untouched rather than half-replaced.
        cursor.execute("DELETE FROM subscription_payments")
        cursor.execute("DELETE FROM subscriptions")
        cursor.execute("DELETE FROM transactions")
        cursor.execute("DELETE FROM tags")

        for tag in data["tags"]:
            cursor.execute(
                "INSERT INTO tags (name, color) VALUES (?, ?)",
                (tag["name"], tag["color"])
            )

        for sub in data["subscriptions"]:
            cursor.execute(
                '''INSERT INTO subscriptions
                (id, title, amount, type, billing_cycle, status, start_date, end_date, max_installments, url, notes, tags, receipt_file)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (sub["id"], sub["title"], sub["amount"], sub["type"], sub["billing_cycle"],
                 sub.get("status", "active"), sub["start_date"], sub.get("end_date"), sub.get("max_installments"),
                 sub.get("url"), sub.get("notes"), sub.get("tags", "[]"), sub.get("receipt_file"))
            )

        for payment in data["subscription_payments"]:
            cursor.execute(
                '''INSERT INTO subscription_payments
                (id, subscription_id, amount, purchase_date, refunded_amount)
                VALUES (?, ?, ?, ?, ?)''',
                (payment["id"], payment["subscription_id"], payment["amount"],
                 payment["purchase_date"], payment.get("refunded_amount", 0))
            )

        for t in data["transactions"]:
            cursor.execute(
                '''INSERT INTO transactions
                (id, title, amount, type, url, purchase_date, receipt_file, notes, tags, refunded_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (t["id"], t["title"], t["amount"], t["type"], t.get("url"), t["purchase_date"],
                 t.get("receipt_file"), t.get("notes"), t.get("tags", "[]"), t.get("refunded_amount", 0))
            )

        # Manually inserting explicit ids doesn't advance SQLite's own
        # AUTOINCREMENT bookkeeping (the sqlite_sequence table) — so the
        # very next auto-generated insert on any of these tables could
        # otherwise reuse an id that was just restored, silently
        # colliding with real data. Bring each table's sequence forward
        # to match the highest id actually present after the restore.
        for table in ("transactions", "subscriptions", "subscription_payments"):
            cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
            max_id = cursor.fetchone()[0]
            cursor.execute("SELECT seq FROM sqlite_sequence WHERE name = ?", (table,))
            if cursor.fetchone() is None:
                cursor.execute("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", (table, max_id))
            else:
                cursor.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = ?", (max_id, table))

        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=500, detail=f"Restore failed, nothing was changed: {e}")

    conn.close()
    return {
        "message": "Data restored successfully",
        "counts": {
            "tags": len(data["tags"]),
            "transactions": len(data["transactions"]),
            "subscriptions": len(data["subscriptions"]),
            "subscription_payments": len(data["subscription_payments"]),
        }
    }