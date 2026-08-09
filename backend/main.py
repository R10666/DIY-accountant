from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import os

app = FastAPI()

# Allow the React frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Since it's local, we allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "finance.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Basic table for our transactions
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            amount REAL,
            category TEXT,
            type TEXT, -- 'deposit', 'purchase', 'subscription'
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# Initialize DB on startup
init_db()

class Transaction(BaseModel):
    title: str
    amount: float
    category: str
    type: str

@app.get("/")
def read_root():
    return {"status": "Backend is running and storing data locally"}

@app.post("/api/transaction")
def add_transaction(transaction: Transaction):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO transactions (title, amount, category, type) VALUES (?, ?, ?, ?)",
        (transaction.title, transaction.amount, transaction.category, transaction.type)
    )
    conn.commit()
    conn.close()
    return {"message": "Transaction saved locally"}

@app.get("/api/transactions")
def get_transactions():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions ORDER BY date DESC")
    rows = cursor.fetchall()
    conn.close()
    
    transactions = []
    for row in rows:
        transactions.append({
            "id": row[0],
            "title": row[1],
            "amount": row[2],
            "category": row[3],
            "type": row[4],
            "date": row[5]
        })
    return {"transactions": transactions}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)