from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import sqlite3
import os
import shutil
import requests
from bs4 import BeautifulSoup

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "finance.db"
UPLOAD_DIR = "uploads"

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Updated transactions table to use 'tags' instead of 'category'
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
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
    
    # NEW: Tags table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tags (
            name TEXT PRIMARY KEY,
            color TEXT
        )
    ''')
    
    # Insert a default tag if the table is empty
    cursor.execute("INSERT OR IGNORE INTO tags (name, color) VALUES ('General', '#64748b')")
    
    conn.commit()
    conn.close()

init_db()

class Transaction(BaseModel):
    title: str
    amount: float
    type: str 
    is_subscription: bool = False
    billing_cycle: Optional[str] = None
    url: Optional[str] = None
    purchase_date: str
    receipt_file: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = "[]" # Stored as a JSON string array

class TransactionUpdate(BaseModel):
    url: Optional[str] = None
    notes: Optional[str] = None
    receipt_file: Optional[str] = None
    refunded_amount: Optional[float] = None
    tags: Optional[str] = None

class Tag(BaseModel):
    name: str
    color: str

@app.get("/")
def read_root():
    return {"status": "Backend running with custom tags!"}

# --- NEW TAG ENDPOINTS ---
@app.get("/api/tags")
def get_tags():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row 
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tags ORDER BY name ASC")
    rows = cursor.fetchall()
    conn.close()
    return {"tags": [dict(row) for row in rows]}

@app.post("/api/tags")
def add_tag(tag: Tag):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Replace ensures we can update a color if the name already exists
    cursor.execute("REPLACE INTO tags (name, color) VALUES (?, ?)", (tag.name, tag.color))
    conn.commit()
    conn.close()
    return {"message": "Tag saved"}

@app.delete("/api/tags/{name}")
def delete_tag(name: str):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tags WHERE name = ?", (name,))
    conn.commit()
    conn.close()
    return {"message": "Tag deleted"}
# -------------------------

@app.get("/api/preview")
def get_link_preview(url: str):
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.text, "html.parser")
        title_tag = soup.find("meta", property="og:title")
        title = title_tag["content"] if title_tag else (soup.title.string if soup.title else url)
        img_tag = soup.find("meta", property="og:image")
        image = img_tag["content"] if img_tag else None
        desc_tag = soup.find("meta", property="og:description")
        description = desc_tag["content"] if desc_tag else ""
        return {"title": title, "image": image, "description": description, "url": url}
    except Exception:
        return {"title": url, "image": None, "description": "Preview not available", "url": url}

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    file_location = f"{UPLOAD_DIR}/{file.filename}"
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"filename": file.filename, "url": f"http://127.0.0.1:8000/uploads/{file.filename}"}

@app.post("/api/transaction")
def add_transaction(transaction: Transaction):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO transactions 
        (title, amount, type, is_subscription, billing_cycle, url, purchase_date, receipt_file, notes, tags) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (transaction.title, transaction.amount, transaction.type, transaction.is_subscription, 
         transaction.billing_cycle, transaction.url, transaction.purchase_date, 
         transaction.receipt_file, transaction.notes, transaction.tags)
    )
    conn.commit()
    conn.close()
    return {"message": "Transaction saved successfully"}

@app.put("/api/transaction/{transaction_id}")
def update_transaction(transaction_id: int, update_data: TransactionUpdate):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    update_dict = update_data.dict(exclude_unset=True)
    if not update_dict:
        return {"message": "No data provided"}
    fields = [f"{k} = ?" for k in update_dict.keys()]
    values = list(update_dict.values())
    values.append(transaction_id)
    query = f"UPDATE transactions SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, tuple(values))
    conn.commit()
    conn.close()
    return {"message": "Transaction updated"}

@app.get("/api/transactions")
def get_transactions():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row 
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions ORDER BY purchase_date DESC")
    rows = cursor.fetchall()
    conn.close()
    return {"transactions": [dict(row) for row in rows]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)