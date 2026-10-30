"""
FastAPI Backend for OjaPulse:
Nigerian Food-Price Intelligence, Community Price Verification & Retailer Restocking Platform.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional
import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from backend.database import (
    Base,
    engine,
    SessionLocal,
    get_db,
    MarketModel,
    HistoricalPriceModel,
    PriceSubmissionModel,
)
from backend.schemas import SubmissionCreateRequest, RestockAssistantRequest
from backend.ml_service import ml_service

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"

app = FastAPI(
    title="OjaPulse API",
    description="Nigerian Food-Price Comparison, Forecasting & Retailer Restocking Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def seed_database_if_empty():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(MarketModel).count() == 0:
            print("Seeding markets into database...")
            with open(PROCESSED_DIR / "markets_metadata.json", "r", encoding="utf-8") as f:
                markets = json.load(f)
            for m in markets:
                db.add(
                    MarketModel(
                        market_id=m["market_id"],
                        name=m["name"],
                        state=m["state"],
                        city=m["city"],
                        latitude=m["latitude"],
                        longitude=m["longitude"],
                        market_type=m["market_type"],
                        market_days=m["market_days"],
                        transport_tier=m["transport_tier"],
                        base_multiplier=m["base_multiplier"],
                    )
                )
            db.commit()

        if db.query(HistoricalPriceModel).count() == 0:
            print("Seeding historical prices into database...")
            df_hist = pd.read_csv(PROCESSED_DIR / "market_prices_history.csv")
            records = [
                HistoricalPriceModel(
                    date=str(row["Date"]),
                    country=str(row["Country"]),
                    region=str(row["Region"]),
                    market_id=str(row["Market_ID"]),
                    market_name=str(row["Market"]),
                    product_id=str(row["Product"]),
                    product_name=str(row["Product_Name"]),
                    category=str(row["Category"]),
                    base_unit=str(row["Base_Unit"]),
                    open_price=float(row["Open"]),
                    high_price=float(row["High"]),
                    low_price=float(row["Low"]),
                    close_price=float(row["Close"]),
                    currency=str(row["Currency"]),
                )
                for _, row in df_hist.iterrows()
            ]
            db.bulk_save_objects(records)
            db.commit()

        if db.query(PriceSubmissionModel).count() == 0:
            print("Seeding crowdsourced submissions into database...")
            df_crowd = pd.read_csv(PROCESSED_DIR / "crowdsourced_submissions.csv")
            sub_records = []
            for _, row in df_crowd.iterrows():
                exp_b = float(row["expected_benchmark_per_kg"])
                norm_p = float(row["normalized_price_per_kg"])
                dev_pct = round(((norm_p / (exp_b + 1e-6)) - 1.0) * 100.0, 2)
                is_anom = bool(int(row["is_anomaly_ground_truth"]) == 1)
                sub_records.append(
                    PriceSubmissionModel(
                        submission_code=str(row["submission_id"]),
                        observation_date=str(row["observation_date"]),
                        state=str(row["state"]),
                        market_id=str(row["market_id"]),
                        market_name=str(row["market_name"]),
                        product_id=str(row["product_id"]),
                        product_name=str(row["product_name"]),
                        unit_name=str(row["unit_name"]),
                        kg_equivalent=float(row["kg_equivalent"]),
                        submitted_price_ngn=float(row["submitted_price_ngn"]),
                        normalized_price_per_kg=norm_p,
                        expected_benchmark_per_kg=exp_b,
                        deviation_pct=dev_pct,
                        reporter_name=str(row["reporter_name"]),
                        reporter_role=str(row["reporter_role"]),
                        verification_status=str(row["verification_status"]),
                        is_anomaly=is_anom,
                        anomaly_reason=str(row["anomaly_note"]),
                        confidence_score=0.92 if not is_anom else 0.15,
                    )
                )
            db.bulk_save_objects(sub_records)
            db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    seed_database_if_empty()


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "OjaPulse Backend",
        "timestamp": datetime.utcnow().isoformat(),
        "selected_model": ml_service.model_metadata.get("selected_model", "XGBoost Regressor"),
    }


@app.get("/api/metadata")
def get_metadata(db: Session = Depends(get_db)):
    """Returns all states, markets (with GPS coordinates), commodities, local units, and ML metrics."""
    markets = db.query(MarketModel).all()
    markets_list = [
        {
            "market_id": m.market_id,
            "name": m.name,
            "state": m.state,
            "city": m.city,
            "latitude": m.latitude,
            "longitude": m.longitude,
            "market_type": m.market_type,
            "market_days": m.market_days,
            "transport_tier": m.transport_tier,
        }
        for m in markets
    ]
    states = sorted(list({m["state"] for m in markets_list if m["state"] != "National"}))
    return {
        "states": states,
        "markets": markets_list,
        "commodities": ml_service.commodities_meta,
        "model_metadata": ml_service.model_metadata,
    }


@app.get("/api/dashboard/summary")
def get_dashboard_summary(
    market_id: str = Query("mkt_mile12"),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Returns KPI cards, unusual price spike alerts, and latest commodity prices
    for the selected market or state.
    """
    if state and state != "All" and market_id == "mkt_national":
        first_mkt = db.query(MarketModel).filter(MarketModel.state == state).first()
        if first_mkt:
            market_id = first_mkt.market_id

    # Fetch last 2 months of historical data for each commodity in the selected market
    rows = (
        db.query(HistoricalPriceModel)
        .filter(
            HistoricalPriceModel.market_id == market_id,
            HistoricalPriceModel.date >= "2026-08-01",
        )
        .order_by(HistoricalPriceModel.date.asc())
        .all()
    )

    by_prod = {}
    for r in rows:
        by_prod.setdefault(r.product_id, []).append(r)

    # Also check latest verified community submissions per product in this market
    verified_subs = (
        db.query(PriceSubmissionModel)
        .filter(
            PriceSubmissionModel.market_id == market_id,
            PriceSubmissionModel.verification_status == "verified",
        )
        .order_by(PriceSubmissionModel.observation_date.desc())
        .all()
    )
    latest_sub_by_prod = {}
    for s in verified_subs:
        if s.product_id not in latest_sub_by_prod:
            latest_sub_by_prod[s.product_id] = s

    commodity_cards = []
    unusual_spikes = []

    for prod_id, c_meta in ml_service.commodities_meta.items():
        hist_list = by_prod.get(prod_id, [])
        if not hist_list:
            continue
        curr = hist_list[-1]
        prev = hist_list[-2] if len(hist_list) >= 2 else curr
        mom_change_pct = round(((curr.close_price - prev.close_price) / (prev.close_price + 1e-6)) * 100.0, 2)

        default_unit = c_meta["default_retail_unit"]
        unit_mult = ml_service.get_unit_multiplier(prod_id, default_unit)

        latest_sub = latest_sub_by_prod.get(prod_id)
        if latest_sub:
            current_kg_price = latest_sub.normalized_price_per_kg
            price_source = f"Verified Trader ({latest_sub.observation_date})"
        else:
            current_kg_price = curr.close_price
            price_source = f"Market Benchmark ({curr.date})"

        unit_price = round(current_kg_price * unit_mult, 2)

        card = {
            "product_id": prod_id,
            "product_name": c_meta["short_name"],
            "display_name": c_meta["display_name"],
            "category": c_meta["category"],
            "base_price_per_kg": round(current_kg_price, 2),
            "historical_benchmark_per_kg": round(curr.close_price, 2),
            "default_unit": default_unit,
            "default_unit_price": unit_price,
            "mom_change_pct": mom_change_pct,
            "high_price_per_kg": round(curr.high_price, 2),
            "low_price_per_kg": round(curr.low_price, 2),
            "price_source": price_source,
            "is_unusual_spike": bool(mom_change_pct >= 3.5 or (curr.high_price - curr.low_price) / curr.close_price >= 0.11),
        }
        commodity_cards.append(card)

        if card["is_unusual_spike"]:
            unusual_spikes.append(
                {
                    "product_id": prod_id,
                    "product_name": c_meta["short_name"],
                    "market_name": curr.market_name,
                    "mom_change_pct": mom_change_pct,
                    "unit_name": default_unit,
                    "unit_price": unit_price,
                    "alert_message": (
                        f"{c_meta['short_name']} rose +{mom_change_pct:.1f}% MoM in {curr.market_name} "
                        f"(High volatility band: ₦{curr.low_price * unit_mult:,.0f} – ₦{curr.high_price * unit_mult:,.0f} per {default_unit})."
                    ),
                }
            )

    total_subs = db.query(PriceSubmissionModel).count()
    verified_count = db.query(PriceSubmissionModel).filter(PriceSubmissionModel.verification_status == "verified").count()
    flagged_count = total_subs - verified_count

    return {
        "market_id": market_id,
        "commodity_cards": commodity_cards,
        "unusual_price_increases": sorted(unusual_spikes, key=lambda x: x["mom_change_pct"], reverse=True),
        "platform_stats": {
            "total_markets": db.query(MarketModel).count() - 1,
            "total_historical_records": db.query(HistoricalPriceModel).count(),
            "total_community_submissions": total_subs,
            "verified_submissions": verified_count,
            "flagged_anomalies": flagged_count,
        },
    }


@app.get("/api/prices/history")
def get_price_history(
    product_id: str = Query("rice"),
    market_id: str = Query("mkt_mile12"),
    unit_name: Optional[str] = Query(None),
    start_date: str = Query("2021-01-01"),
    end_date: str = Query("2026-10-31"),
    db: Session = Depends(get_db),
):
    """Returns historical price series scaled to the user's chosen Nigerian market unit."""
    c_meta = ml_service.commodities_meta.get(product_id)
    if not c_meta:
        raise HTTPException(status_code=404, detail=f"Unknown product_id: {product_id}")

    selected_unit = unit_name or c_meta["default_retail_unit"]
    unit_mult = ml_service.get_unit_multiplier(product_id, selected_unit)

    rows = (
        db.query(HistoricalPriceModel)
        .filter(
            HistoricalPriceModel.product_id == product_id,
            HistoricalPriceModel.market_id == market_id,
            HistoricalPriceModel.date >= start_date,
            HistoricalPriceModel.date <= end_date,
        )
        .order_by(HistoricalPriceModel.date.asc())
        .all()
    )

    # Also fetch National Average for comparison overlay
    nat_rows = (
        db.query(HistoricalPriceModel)
        .filter(
            HistoricalPriceModel.product_id == product_id,
            HistoricalPriceModel.market_id == "mkt_national",
            HistoricalPriceModel.date >= start_date,
            HistoricalPriceModel.date <= end_date,
        )
        .order_by(HistoricalPriceModel.date.asc())
        .all()
    )
    nat_map = {r.date: round(r.close_price * unit_mult, 2) for r in nat_rows}

    series = [
        {
            "date": r.date,
            "open": round(r.open_price * unit_mult, 2),
            "high": round(r.high_price * unit_mult, 2),
            "low": round(r.low_price * unit_mult, 2),
            "close": round(r.close_price * unit_mult, 2),
            "national_avg_close": nat_map.get(r.date, round(r.close_price * unit_mult, 2)),
            "base_close_per_kg": round(r.close_price, 2),
        }
        for r in rows
    ]

    return {
        "product_id": product_id,
        "product_name": c_meta["display_name"],
        "market_id": market_id,
        "unit_name": selected_unit,
        "kg_equivalent": unit_mult,
        "count": len(series),
        "series": series,
    }


@app.get("/api/forecast")
def get_commodity_forecast(
    product_id: str = Query("rice"),
    market_id: str = Query("mkt_mile12"),
    unit_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Runs the trained XGBoost and Random Forest models to forecast commodity prices
    for the next 2 weeks, 1 month, and 2 months, alongside recent historical context.
    """
    c_meta = ml_service.commodities_meta.get(product_id)
    if not c_meta:
        raise HTTPException(status_code=404, detail=f"Unknown product_id: {product_id}")

    selected_unit = unit_name or c_meta["default_retail_unit"]

    rows = (
        db.query(HistoricalPriceModel)
        .filter(
            HistoricalPriceModel.product_id == product_id,
            HistoricalPriceModel.market_id == market_id,
            HistoricalPriceModel.date >= "2024-06-01",
        )
        .order_by(HistoricalPriceModel.date.asc())
        .all()
    )
    if len(rows) < 13:
        raise HTTPException(status_code=400, detail="Insufficient historical series for forecasting.")

    hist_dicts = [
        {
            "date": r.date,
            "region": r.region,
            "market_id": r.market_id,
            "market_name": r.market_name,
            "product_id": r.product_id,
            "open_price": r.open_price,
            "high_price": r.high_price,
            "low_price": r.low_price,
            "close_price": r.close_price,
        }
        for r in rows
    ]

    forecast_result = ml_service.forecast_commodity(
        history_rows=hist_dicts,
        market_id=market_id,
        product_id=product_id,
        unit_name=selected_unit,
    )

    unit_mult = forecast_result["kg_equivalent"]
    recent_trend = [
        {
            "date": r.date,
            "actual_price": round(r.close_price * unit_mult, 2),
            "high_band": round(r.high_price * unit_mult, 2),
            "low_band": round(r.low_price * unit_mult, 2),
            "type": "historical",
        }
        for r in rows[-12:]
    ]

    # Append future forecast points for seamless chart rendering
    f2w = forecast_result["forecast_2_weeks"]
    f1m = forecast_result["forecast_1_month"]
    f2m = forecast_result["forecast_2_months"]

    forecast_chart_points = recent_trend + [
        {
            "date": f2w["target_date"],
            "predicted_price": f2w["predicted_price"],
            "low_estimate": f2w["low_estimate"],
            "high_estimate": f2w["high_estimate"],
            "baseline_naive": f1m["baseline_naive_price"],
            "rf_predicted": round((forecast_result["current_benchmark_price"] + f1m["rf_predicted_price"]) / 2.0, 2),
            "type": "forecast_2w",
        },
        {
            "date": f1m["target_date"],
            "predicted_price": f1m["predicted_price"],
            "low_estimate": f1m["low_estimate"],
            "high_estimate": f1m["high_estimate"],
            "baseline_naive": f1m["baseline_naive_price"],
            "rf_predicted": f1m["rf_predicted_price"],
            "type": "forecast_1m",
        },
        {
            "date": f2m["target_date"],
            "predicted_price": f2m["predicted_price"],
            "low_estimate": f2m["low_estimate"],
            "high_estimate": f2m["high_estimate"],
            "baseline_naive": f1m["baseline_naive_price"],
            "rf_predicted": round(f1m["rf_predicted_price"] * 1.015, 2),
            "type": "forecast_2m",
        },
    ]

    forecast_result["chart_series"] = forecast_chart_points
    return forecast_result


@app.get("/api/markets/compare")
def compare_markets(
    product_id: str = Query("rice"),
    unit_name: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Compares the latest verified community submissions & market benchmarks
    for the same product and equivalent quantity across all Nigerian markets.
    """
    c_meta = ml_service.commodities_meta.get(product_id)
    if not c_meta:
        raise HTTPException(status_code=404, detail=f"Unknown product_id: {product_id}")

    selected_unit = unit_name or c_meta["default_retail_unit"]
    unit_mult = ml_service.get_unit_multiplier(product_id, selected_unit)

    markets_query = db.query(MarketModel).filter(MarketModel.market_id != "mkt_national")
    if state and state != "All":
        markets_query = markets_query.filter(MarketModel.state == state)
    markets = markets_query.all()

    comparisons = []
    for m in markets:
        # Latest historical benchmark for this market
        latest_hist = (
            db.query(HistoricalPriceModel)
            .filter(
                HistoricalPriceModel.market_id == m.market_id,
                HistoricalPriceModel.product_id == product_id,
            )
            .order_by(HistoricalPriceModel.date.desc())
            .first()
        )
        prev_hist = (
            db.query(HistoricalPriceModel)
            .filter(
                HistoricalPriceModel.market_id == m.market_id,
                HistoricalPriceModel.product_id == product_id,
                HistoricalPriceModel.date < (latest_hist.date if latest_hist else "2026-10-01"),
            )
            .order_by(HistoricalPriceModel.date.desc())
            .first()
        )

        # Latest verified community submissions in this market
        verified_subs = (
            db.query(PriceSubmissionModel)
            .filter(
                PriceSubmissionModel.market_id == m.market_id,
                PriceSubmissionModel.product_id == product_id,
                PriceSubmissionModel.verification_status == "verified",
            )
            .order_by(PriceSubmissionModel.observation_date.desc())
            .limit(5)
            .all()
        )

        hist_kg = latest_hist.close_price if latest_hist else 1000.0
        prev_kg = prev_hist.close_price if prev_hist else hist_kg
        mom_pct = round(((hist_kg - prev_kg) / (prev_kg + 1e-6)) * 100.0, 2)

        if verified_subs:
            latest_sub = verified_subs[0]
            avg_verified_kg = sum(s.normalized_price_per_kg for s in verified_subs) / len(verified_subs)
            equivalent_unit_price = round(avg_verified_kg * unit_mult, 2)
            last_updated = latest_sub.observation_date
            reporter = f"{latest_sub.reporter_name} ({latest_sub.reporter_role})"
            verified_count = len(verified_subs)
        else:
            avg_verified_kg = hist_kg
            equivalent_unit_price = round(hist_kg * unit_mult, 2)
            last_updated = latest_hist.date if latest_hist else "2026-10-01"
            reporter = "World Bank Benchmark"
            verified_count = 0

        comparisons.append(
            {
                "market_id": m.market_id,
                "market_name": m.name,
                "state": m.state,
                "city": m.city,
                "latitude": m.latitude,
                "longitude": m.longitude,
                "market_type": m.market_type,
                "market_days": m.market_days,
                "transport_tier": m.transport_tier,
                "product_id": product_id,
                "product_name": c_meta["short_name"],
                "unit_name": selected_unit,
                "equivalent_unit_price": equivalent_unit_price,
                "normalized_price_per_kg": round(avg_verified_kg, 2),
                "historical_benchmark_unit_price": round(hist_kg * unit_mult, 2),
                "mom_change_pct": mom_pct,
                "last_updated": last_updated,
                "latest_reporter": reporter,
                "verified_submissions_count": verified_count,
            }
        )

    comparisons.sort(key=lambda x: x["equivalent_unit_price"])

    if comparisons:
        cheapest_price = comparisons[0]["equivalent_unit_price"]
        highest_price = comparisons[-1]["equivalent_unit_price"]
        avg_price = round(sum(c["equivalent_unit_price"] for c in comparisons) / len(comparisons), 2)
        for idx, c in enumerate(comparisons):
            c["rank"] = idx + 1
            c["savings_vs_highest_ngn"] = round(highest_price - c["equivalent_unit_price"], 2)
            c["diff_vs_cheapest_pct"] = round(((c["equivalent_unit_price"] - cheapest_price) / (cheapest_price + 1e-6)) * 100.0, 1)
    else:
        cheapest_price = highest_price = avg_price = 0.0

    return {
        "product_id": product_id,
        "product_name": c_meta["display_name"],
        "unit_name": selected_unit,
        "kg_equivalent": unit_mult,
        "cheapest_market": comparisons[0] if comparisons else None,
        "most_expensive_market": comparisons[-1] if comparisons else None,
        "average_market_price": avg_price,
        "max_potential_savings_per_unit": round(highest_price - cheapest_price, 2),
        "markets": comparisons,
    }


@app.get("/api/submissions")
def list_submissions(
    market_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    """Lists recent crowdsourced price submissions with verification status and anomaly explanations."""
    q = db.query(PriceSubmissionModel)
    if market_id and market_id != "All":
        q = q.filter(PriceSubmissionModel.market_id == market_id)
    if product_id and product_id != "All":
        q = q.filter(PriceSubmissionModel.product_id == product_id)
    if status and status != "All":
        q = q.filter(PriceSubmissionModel.verification_status == status)

    rows = q.order_by(PriceSubmissionModel.id.desc()).limit(limit).all()
    return {
        "count": len(rows),
        "submissions": [
            {
                "id": r.id,
                "submission_code": r.submission_code,
                "observation_date": r.observation_date,
                "state": r.state,
                "market_id": r.market_id,
                "market_name": r.market_name,
                "product_id": r.product_id,
                "product_name": r.product_name,
                "unit_name": r.unit_name,
                "kg_equivalent": r.kg_equivalent,
                "submitted_price_ngn": r.submitted_price_ngn,
                "normalized_price_per_kg": r.normalized_price_per_kg,
                "expected_benchmark_per_kg": r.expected_benchmark_per_kg,
                "expected_unit_benchmark_ngn": round(r.expected_benchmark_per_kg * r.kg_equivalent, 2),
                "deviation_pct": r.deviation_pct,
                "reporter_name": r.reporter_name,
                "reporter_role": r.reporter_role,
                "verification_status": r.verification_status,
                "is_anomaly": r.is_anomaly,
                "anomaly_reason": r.anomaly_reason,
                "confidence_score": r.confidence_score,
            }
            for r in rows
        ],
    }


@app.post("/api/submissions")
def create_submission(req: SubmissionCreateRequest, db: Session = Depends(get_db)):
    """
    Accepts a new local price submission from a retailer, trader, or consumer,
    validates it in real time using Model 3 (Statistical Z-Score/IQR + Isolation Forest),
    persists it to SQLite/PostgreSQL, and returns the verification report.
    """
    mkt = db.query(MarketModel).filter(MarketModel.market_id == req.market_id).first()
    if not mkt:
        raise HTTPException(status_code=404, detail=f"Market not found: {req.market_id}")

    c_meta = ml_service.commodities_meta.get(req.product_id)
    if not c_meta:
        raise HTTPException(status_code=404, detail=f"Commodity not found: {req.product_id}")

    latest_hist = (
        db.query(HistoricalPriceModel)
        .filter(
            HistoricalPriceModel.market_id == req.market_id,
            HistoricalPriceModel.product_id == req.product_id,
        )
        .order_by(HistoricalPriceModel.date.desc())
        .first()
    )
    expected_kg = latest_hist.close_price if latest_hist else 1500.0

    val_res = ml_service.validate_submission(
        product_id=req.product_id,
        unit_name=req.unit_name,
        submitted_price_ngn=req.submitted_price_ngn,
        expected_benchmark_per_kg=expected_kg,
    )

    obs_date = req.observation_date or datetime(2026, 10, 20).strftime("%Y-%m-%d")
    next_num = db.query(func.count(PriceSubmissionModel.id)).scalar() + 1001
    sub_code = f"SUB-{next_num}"

    new_sub = PriceSubmissionModel(
        submission_code=sub_code,
        observation_date=obs_date,
        state=mkt.state,
        market_id=mkt.market_id,
        market_name=mkt.name,
        product_id=req.product_id,
        product_name=c_meta["short_name"],
        unit_name=req.unit_name,
        kg_equivalent=val_res["unit_multiplier"],
        submitted_price_ngn=round(req.submitted_price_ngn, 2),
        normalized_price_per_kg=val_res["normalized_price_per_kg"],
        expected_benchmark_per_kg=val_res["expected_benchmark_per_kg"],
        deviation_pct=val_res["deviation_pct"],
        reporter_name=req.reporter_name or "Local Shop Owner",
        reporter_role=req.reporter_role or "Retailer",
        verification_status=val_res["verification_status"],
        is_anomaly=val_res["is_anomaly"],
        anomaly_reason=val_res["anomaly_reason"],
        confidence_score=val_res["confidence_score"],
    )
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)

    return {
        "message": (
            "Price submission verified and published to live market comparisons!"
            if not val_res["is_anomaly"]
            else "Submission recorded but flagged by statistical outlier screening for secondary review."
        ),
        "submission": {
            "id": new_sub.id,
            "submission_code": new_sub.submission_code,
            "observation_date": new_sub.observation_date,
            "state": new_sub.state,
            "market_id": new_sub.market_id,
            "market_name": new_sub.market_name,
            "product_id": new_sub.product_id,
            "product_name": new_sub.product_name,
            "unit_name": new_sub.unit_name,
            "submitted_price_ngn": new_sub.submitted_price_ngn,
            "expected_unit_benchmark_ngn": val_res["expected_unit_benchmark_ngn"],
            "deviation_pct": new_sub.deviation_pct,
            "verification_status": new_sub.verification_status,
            "is_anomaly": new_sub.is_anomaly,
            "anomaly_reason": new_sub.anomaly_reason,
            "confidence_score": new_sub.confidence_score,
            "robust_z_score": val_res["robust_z_score"],
        },
    }


@app.post("/api/retailer/restock-assistant")
def calculate_restock_plan(req: RestockAssistantRequest, db: Session = Depends(get_db)):
    """
    Retailer Restocking Assistant:
    Takes a shop owner's shopping list, preferred market, forecast horizon (14 or 30 days),
    and available budget. Returns:
    - Itemized current cost vs forecasted cost & uncertainty range
    - Best alternative market for each item (split-procurement optimization)
    - Total basket comparison across all markets
    - Budget surplus/deficit and actionable restocking recommendations
    """
    markets_q = db.query(MarketModel).filter(MarketModel.market_id != "mkt_national")
    if req.state_filter and req.state_filter != "All":
        markets_q = markets_q.filter(MarketModel.state == req.state_filter)
    candidate_markets = markets_q.all()
    if not candidate_markets:
        candidate_markets = db.query(MarketModel).filter(MarketModel.market_id != "mkt_national").all()

    line_items = []
    total_current_preferred = 0.0
    total_forecast_preferred = 0.0
    total_forecast_low = 0.0
    total_forecast_high = 0.0
    total_optimal_split_cost = 0.0

    # Track total basket cost if bought entirely at a single market
    single_market_totals = {
        m.market_id: {
            "market_id": m.market_id,
            "market_name": m.name,
            "state": m.state,
            "city": m.city,
            "transport_tier": m.transport_tier,
            "current_total_ngn": 0.0,
            "forecast_total_ngn": 0.0,
        }
        for m in candidate_markets
    }

    for item in req.items:
        c_meta = ml_service.commodities_meta.get(item.product_id)
        if not c_meta:
            continue

        # Forecast at preferred market
        pref_rows = (
            db.query(HistoricalPriceModel)
            .filter(
                HistoricalPriceModel.market_id == req.preferred_market_id,
                HistoricalPriceModel.product_id == item.product_id,
                HistoricalPriceModel.date >= "2024-06-01",
            )
            .order_by(HistoricalPriceModel.date.asc())
            .all()
        )
        hist_dicts = [
            {
                "date": r.date,
                "region": r.region,
                "market_id": r.market_id,
                "market_name": r.market_name,
                "product_id": r.product_id,
                "open_price": r.open_price,
                "high_price": r.high_price,
                "low_price": r.low_price,
                "close_price": r.close_price,
            }
            for r in pref_rows
        ]
        fc = ml_service.forecast_commodity(
            history_rows=hist_dicts,
            market_id=req.preferred_market_id,
            product_id=item.product_id,
            unit_name=item.unit_name,
        )

        horizon_obj = fc["forecast_2_weeks"] if req.horizon_days <= 14 else fc["forecast_1_month"]
        unit_curr = fc["current_benchmark_price"]
        unit_fc = horizon_obj["predicted_price"]
        unit_low = horizon_obj["low_estimate"]
        unit_high = horizon_obj["high_estimate"]

        sub_curr = round(unit_curr * item.quantity, 2)
        sub_fc = round(unit_fc * item.quantity, 2)
        sub_low = round(unit_low * item.quantity, 2)
        sub_high = round(unit_high * item.quantity, 2)

        total_current_preferred += sub_curr
        total_forecast_preferred += sub_fc
        total_forecast_low += sub_low
        total_forecast_high += sub_high

        # Evaluate across all candidate markets to find cheapest verified market for this item
        unit_mult = fc["kg_equivalent"]
        best_mkt_name = fc["market_name"]
        best_mkt_state = fc["state"]
        best_unit_price = unit_curr

        for m in candidate_markets:
            # Check latest verified submission or historical price
            v_sub = (
                db.query(PriceSubmissionModel)
                .filter(
                    PriceSubmissionModel.market_id == m.market_id,
                    PriceSubmissionModel.product_id == item.product_id,
                    PriceSubmissionModel.verification_status == "verified",
                )
                .order_by(PriceSubmissionModel.observation_date.desc())
                .first()
            )
            if v_sub:
                m_kg = v_sub.normalized_price_per_kg
            else:
                m_hist = (
                    db.query(HistoricalPriceModel)
                    .filter(
                        HistoricalPriceModel.market_id == m.market_id,
                        HistoricalPriceModel.product_id == item.product_id,
                    )
                    .order_by(HistoricalPriceModel.date.desc())
                    .first()
                )
                m_kg = m_hist.close_price if m_hist else (unit_curr / unit_mult)

            m_unit_price = round(m_kg * unit_mult, 2)
            m_sub_curr = round(m_unit_price * item.quantity, 2)
            m_sub_fc = round(m_sub_curr * (1.0 + horizon_obj["expected_change_pct"] / 100.0), 2)

            single_market_totals[m.market_id]["current_total_ngn"] = round(
                single_market_totals[m.market_id]["current_total_ngn"] + m_sub_curr, 2
            )
            single_market_totals[m.market_id]["forecast_total_ngn"] = round(
                single_market_totals[m.market_id]["forecast_total_ngn"] + m_sub_fc, 2
            )

            if m_unit_price < best_unit_price:
                best_unit_price = m_unit_price
                best_mkt_name = m.name
                best_mkt_state = m.state

        best_subtotal = round(best_unit_price * item.quantity, 2)
        total_optimal_split_cost += best_subtotal

        line_items.append(
            {
                "product_id": item.product_id,
                "product_name": c_meta["short_name"],
                "unit_name": item.unit_name,
                "quantity": item.quantity,
                "current_unit_price": unit_curr,
                "forecast_unit_price": unit_fc,
                "current_subtotal": sub_curr,
                "forecast_subtotal": sub_fc,
                "forecast_low_subtotal": sub_low,
                "forecast_high_subtotal": sub_high,
                "expected_change_pct": horizon_obj["expected_change_pct"],
                "buy_timing_advice": (
                    "Buy Now (Price Rising)"
                    if horizon_obj["expected_change_pct"] > 1.2
                    else ("Wait / Partial Restock (Harvest Easing)" if horizon_obj["expected_change_pct"] < -1.0 else "Normal Restock")
                ),
                "cheapest_market_for_item": f"{best_mkt_name} ({best_mkt_state})",
                "cheapest_unit_price": best_unit_price,
                "potential_item_savings": round(sub_curr - best_subtotal, 2),
            }
        )

    market_rankings = sorted(single_market_totals.values(), key=lambda x: x["current_total_ngn"])

    budget_gap_current = float(round(req.budget_ngn - total_current_preferred, 2))
    budget_gap_forecast = float(round(req.budget_ngn - total_forecast_preferred, 2))
    recommended_contingency_budget = float(round(total_forecast_high, 2))

    return {
        "preferred_market_id": req.preferred_market_id,
        "horizon_days": int(req.horizon_days),
        "budget_ngn": float(round(req.budget_ngn, 2)),
        "summary": {
            "total_current_cost_ngn": float(round(total_current_preferred, 2)),
            "total_forecast_cost_ngn": float(round(total_forecast_preferred, 2)),
            "forecast_range_low_ngn": float(round(total_forecast_low, 2)),
            "forecast_range_high_ngn": float(round(total_forecast_high, 2)),
            "optimal_split_market_cost_ngn": float(round(total_optimal_split_cost, 2)),
            "potential_arbitrage_savings_ngn": float(round(total_current_preferred - total_optimal_split_cost, 2)),
            "budget_surplus_or_deficit_current": budget_gap_current,
            "budget_surplus_or_deficit_forecast": budget_gap_forecast,
            "within_budget_now": bool(budget_gap_current >= 0),
            "within_budget_forecast": bool(budget_gap_forecast >= 0),
            "recommended_safe_budget_ngn": recommended_contingency_budget,
        },
        "items": line_items,
        "market_basket_comparison": market_rankings,
    }
