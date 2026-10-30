"""
Pydantic Request & Response Schemas for NaijaPrice AI API.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class SubmissionCreateRequest(BaseModel):
    market_id: str = Field(..., description="Target market ID, e.g. mkt_mile12")
    product_id: str = Field(..., description="Commodity ID, e.g. rice, beans, gari_fao")
    unit_name: str = Field(..., description="Measurement unit, e.g. 50kg Bag, Paint Bucket / Olodo (4kg)")
    submitted_price_ngn: float = Field(..., gt=0, description="Observed price in NGN")
    observation_date: Optional[str] = Field(None, description="Date of observation YYYY-MM-DD")
    reporter_name: Optional[str] = Field("Market Trader", description="Name or shop of submitter")
    reporter_role: Optional[str] = Field("Retailer", description="Role: Retailer, Wholesaler, Market Agent, Consumer")


class RestockItemRequest(BaseModel):
    product_id: str
    unit_name: str
    quantity: float = Field(..., gt=0)


class RestockAssistantRequest(BaseModel):
    preferred_market_id: str = Field("mkt_mile12", description="Retailer's primary market")
    state_filter: Optional[str] = Field(None, description="Optional state filter for nearby markets")
    budget_ngn: float = Field(..., gt=0, description="Retailer's available restocking budget in NGN")
    horizon_days: int = Field(14, description="Forecast horizon: 14 (2 weeks) or 30 (1 month)")
    items: List[RestockItemRequest]
