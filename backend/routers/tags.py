import json
import sqlite3
from fastapi import APIRouter
from database import get_conn
from models import Tag

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("")
def get_tags():
    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tags ORDER BY name ASC")
    rows = cursor.fetchall()
    conn.close()
    return {"tags": [dict(row) for row in rows]}


@router.post("")
def add_tag(tag: Tag):
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute("REPLACE INTO tags (name, color) VALUES (?, ?)", (tag.name, tag.color))
    conn.commit()
    conn.close()
    return {"message": "Tag saved"}


@router.delete("/{name}")
def delete_tag(name: str):
    conn = get_conn()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM tags WHERE name = ?", (name,))

    # FIX: tags are stored as a JSON array string directly on each
    # transaction/subscription row (there's no proper join table), so
    # deleting the tag's own row previously only removed its color and
    # made it unselectable going forward — every row that already had it
    # kept the bare name sitting in its `tags` array forever, with no
    # color to render. Strip the name out of every row that references it
    # across BOTH tables (subscriptions carries its own `tags` field,
    # shared across all of that subscription's payments) so a deleted tag
    # is actually gone, not just orphaned.
    for table in ("transactions", "subscriptions"):
        cursor.execute(f"SELECT id, tags FROM {table}")
        rows = cursor.fetchall()
        for row_id, tags_json in rows:
            try:
                tags_list = json.loads(tags_json or "[]")
            except (json.JSONDecodeError, TypeError):
                continue
            if name in tags_list:
                updated = [t for t in tags_list if t != name]
                cursor.execute(
                    f"UPDATE {table} SET tags = ? WHERE id = ?",
                    (json.dumps(updated), row_id)
                )

    conn.commit()
    conn.close()
    return {"message": "Tag deleted and removed from all items"}