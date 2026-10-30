"""
Command-Line Forecasting & Verification Runner for OjaPulse.
Loads the trained XGBoost, Random Forest, and Hybrid Isolation Forest models
from `models/` and prints live forecasts, baseline comparisons, and outlier checks.
"""

import sys
from backend.database import SessionLocal, HistoricalPriceModel
from backend.ml_service import ml_service

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def run_live_models():
    db = SessionLocal()
    try:
        print("=" * 80)
        print("  OJAPULSE — COMMODITY FORECASTING & OUTLIER VERIFICATION ENGINE")
        print("=" * 80)
        print(f"Primary Model : {ml_service.model_metadata.get('selected_model')}")
        print(f"Last Trained  : {ml_service.model_metadata.get('last_trained_date')}")
        print("-" * 80)

        print("\n1. CHRONOLOGICAL OUT-OF-SAMPLE TEST BENCHMARK (2025 - 2026):")
        for m in ml_service.model_metadata.get("baseline_comparison", []):
            print(
                f"  • {m['Model']:<40} | MAE: ₦{m['MAE (NGN/kg)']:>6.2f}/kg | "
                f"RMSE: ₦{m['RMSE (NGN/kg)']:>6.2f}/kg | MAPE: {m['MAPE (%)']:>4.2f}%"
            )

        print("\n" + "-" * 80)
        print("2. LIVE 2-WEEK & 1-MONTH COMMODITY PRICE FORECASTS FOR RETAILERS:")
        sample_queries = [
            ("rice", "mkt_mile12", "50kg Bag"),
            ("beans", "mkt_dawanau", "50kg Bag"),
            ("gari_fao", "mkt_bodija", "Paint Bucket / Olodo (3.5kg)"),
            ("yam", "mkt_wuse", "5 Tubers Heap"),
            ("onions", "mkt_mile12", "25kg Mesh Bag"),
        ]

        for prod_id, mkt_id, unit_name in sample_queries:
            rows = (
                db.query(HistoricalPriceModel)
                .filter_by(product_id=prod_id, market_id=mkt_id)
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
                for r in rows
            ]
            res = ml_service.forecast_commodity(hist_dicts, mkt_id, prod_id, unit_name)
            f2w = res["forecast_2_weeks"]
            f1m = res["forecast_1_month"]

            print(f"\n  [{res['product_name']}] @ {res['market_name']} ({res['state']}) — Unit: {unit_name}")
            print(f"    Current Benchmark : ₦{res['current_benchmark_price']:,.2f}")
            print(
                f"    2-Week Forecast   : ₦{f2w['predicted_price']:,.2f} ({f2w['expected_change_pct']:+.2f}%) "
                f"| Est. Range: ₦{f2w['low_estimate']:,.0f} – ₦{f2w['high_estimate']:,.0f} (by {f2w['target_date']})"
            )
            print(
                f"    1-Month Forecast  : ₦{f1m['predicted_price']:,.2f} (XGBoost) vs ₦{f1m['rf_predicted_price']:,.2f} (Random Forest) "
                f"vs ₦{f1m['baseline_naive_price']:,.2f} (Naive Baseline)"
            )
            print(f"    Retailer Signal   : {res['retailer_advisory']['recommendation']}")

        print("\n" + "-" * 80)
        print("3. MODEL 3: REAL-TIME CROWDSOURCED SUBMISSION ANOMALY DETECTION:")
        test_submissions = [
            ("Normal Trader Submission", "rice", "50kg Bag", 211500.0, 4512.0),
            ("Unit Mismatch / 10x Typo", "rice", "1 kg", 210000.0, 4512.0),
            ("Artificial Price Spike (+65%)", "beans", "Paint Bucket / Olodo (4kg)", 18500.0, 2750.0),
        ]
        for label, prod_id, unit, price, bench_kg in test_submissions:
            val = ml_service.validate_submission(prod_id, unit, price, bench_kg)
            print(
                f"\n  • [{label}] Submitted: ₦{price:,.0f} per {unit} "
                f"(Expected Benchmark: ₦{val['expected_unit_benchmark_ngn']:,.0f})"
            )
            print(
                f"    Status: {val['verification_status'].upper()} | Robust Z-Score: {val['robust_z_score']} "
                f"| Deviation: {val['deviation_pct']:+.1f}%"
            )
            print(f"    Reason: {val['anomaly_reason']}")

        print("\n" + "=" * 80)
    finally:
        db.close()


if __name__ == "__main__":
    run_live_models()
