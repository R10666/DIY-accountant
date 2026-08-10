from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import init_db, UPLOAD_DIR
from routers import tags, transactions, subscriptions, misc

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

init_db()

app.include_router(tags.router)
app.include_router(transactions.router)
app.include_router(transactions.ledger_router)
app.include_router(subscriptions.router)
app.include_router(subscriptions.payments_router)
app.include_router(misc.router)


@app.get("/")
def read_root():
    return {"status": "Backend running — routes split across routers/"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)