from pydantic import BaseModel
from typing import Optional


class Transaction(BaseModel):
    title: str
    amount: float
    type: str
    url: Optional[str] = None
    purchase_date: str
    receipt_file: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = "[]"


class TransactionUpdate(BaseModel):
    url: Optional[str] = None
    notes: Optional[str] = None
    receipt_file: Optional[str] = None
    refunded_amount: Optional[float] = None
    tags: Optional[str] = None


class SubscriptionCreate(BaseModel):
    title: str
    amount: float
    type: str                  # 'purchase' (expense) or 'deposit' (income)
    billing_cycle: str         # 'weekly' | 'monthly' | 'yearly' | 'N days'
    start_date: str
    end_date: Optional[str] = None          # stop generating payments after this date
    max_installments: Optional[int] = None  # stop generating payments after N total
    url: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = "[]"
    receipt_file: Optional[str] = None


class SubscriptionUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    billing_cycle: Optional[str] = None
    status: Optional[str] = None    # 'active' | 'cancelled' | 'completed'
    end_date: Optional[str] = None
    max_installments: Optional[int] = None
    url: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    receipt_file: Optional[str] = None


class PaymentUpdate(BaseModel):
    refunded_amount: Optional[float] = None


class Tag(BaseModel):
    name: str
    color: str