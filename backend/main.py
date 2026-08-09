from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import sqlite3
import os
import shutil

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

# Create the uploads directory if it doesn't exist
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# This allows the frontend to view the images directly via URL
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
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
            refunded_amount REAL DEFAULT 0
        )
    ''')
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

class TransactionUpdate(BaseModel):
    url: Optional[str] = None
    notes: Optional[str] = None
    receipt_file: Optional[str] = None
    refunded_amount: Optional[float] = None

@app.get("/")
def read_root():
    return {"status": "Backend running with file upload support"}

# NEW ROUTE: Handle actual file uploads
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    file_location = f"{UPLOAD_DIR}/{file.filename}"
    with open(file_location, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    # Return the path so the frontend can save it to the database
    return {"filename": file.filename, "url": f"http://127.0.0.1:8000/uploads/{file.filename}"}

@app.post("/api/transaction")
def add_transaction(transaction: Transaction):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO transactions 
        (title, amount, type, is_subscription, billing_cycle, url, purchase_date, receipt_file, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (transaction.title, transaction.amount, transaction.type, transaction.is_subscription, 
         transaction.billing_cycle, transaction.url, transaction.purchase_date, 
         transaction.receipt_file, transaction.notes)
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