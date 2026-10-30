"""
Data Preparation & Market Enrichment Pipeline for OjaPulse.
Loads World Bank historical dataset (data/raw/data.csv) and constructs:
1. Clean national & multi-market historical time-series (data/processed/market_prices_history.csv)
2. Market metadata with GPS coordinates across 7 Nigerian states (data/processed/markets_metadata.json)
3. Commodity & Nigerian retail/wholesale unit conversion catalog (data/processed/commodities_metadata.json)
4. Crowdsourced daily staple submissions dataset (NBS/World Bank style 2025-2026) with ground-truth anomaly labels for validation (data/processed/crowdsourced_submissions.csv)
"""

import json
from pathlib import Path
import numpy as np
import pandas as pd

np.random.seed(42)

BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DATA_PATH = BASE_DIR / "data" / "raw" / "data.csv"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# 1. Define Nigerian Markets across 7 States + National Average
MARKETS = [
    {
        "market_id": "mkt_mile12",
        "name": "Mile 12 International Market",
        "state": "Lagos",
        "city": "Kosofe, Lagos",
        "latitude": 6.6058,
        "longitude": 3.3941,
        "market_type": "Major Perishable & Grain Hub",
        "market_days": "Daily (Peak: Tue, Thu, Sat)",
        "transport_tier": "High Demand Urban",
        "base_multiplier": 1.06,
        "produce_discount": -0.05,  # Wholesale hub for onions, tomatoes, yam
    },
    {
        "market_id": "mkt_oyingbo",
        "name": "Oyingbo Market",
        "state": "Lagos",
        "city": "Ebute Metta, Lagos",
        "latitude": 6.4795,
        "longitude": 3.3814,
        "market_type": "Wholesale & Retail Food Hub",
        "market_days": "Daily",
        "transport_tier": "High Demand Urban",
        "base_multiplier": 1.09,
        "produce_discount": 0.02,
    },
    {
        "market_id": "mkt_daleko",
        "name": "Daleko Rice & Grain Market",
        "state": "Lagos",
        "city": "Mushin, Lagos",
        "latitude": 6.5332,
        "longitude": 3.3489,
        "market_type": "Specialized Wholesale Rice & Grains",
        "market_days": "Mon - Sat",
        "transport_tier": "Wholesale Terminal",
        "base_multiplier": 1.02,
        "produce_discount": 0.0,
    },
    {
        "market_id": "mkt_alabarago",
        "name": "Alaba Rago Market",
        "state": "Lagos",
        "city": "Ojo, Lagos",
        "latitude": 6.4628,
        "longitude": 3.1932,
        "market_type": "Northern Grains & Livestock Hub",
        "market_days": "Daily",
        "transport_tier": "Suburban Wholesale",
        "base_multiplier": 1.04,
        "produce_discount": -0.02,
    },
    {
        "market_id": "mkt_dawanau",
        "name": "Dawanau International Grain Market",
        "state": "Kano",
        "city": "Dawakin Tofa, Kano",
        "latitude": 12.0894,
        "longitude": 8.4308,
        "market_type": "West Africa Largest Grain Producer Hub",
        "market_days": "Daily",
        "transport_tier": "Producer Origin",
        "base_multiplier": 0.84,
        "produce_discount": -0.14,
    },
    {
        "market_id": "mkt_wuse",
        "name": "Wuse Market",
        "state": "Abuja (FCT)",
        "city": "Wuse Zone 5, Abuja",
        "latitude": 9.0667,
        "longitude": 7.4667,
        "market_type": "Urban Retail & Bulk Market",
        "market_days": "Daily",
        "transport_tier": "Premium Urban",
        "base_multiplier": 1.12,
        "produce_discount": 0.03,
    },
    {
        "market_id": "mkt_nyanya",
        "name": "Nyanya Market",
        "state": "Abuja (FCT)",
        "city": "Nyanya, Abuja",
        "latitude": 9.0189,
        "longitude": 7.5681,
        "market_type": "Suburban Wholesale & Retail",
        "market_days": "Daily (Peak: Wed, Sat)",
        "transport_tier": "Suburban Hub",
        "base_multiplier": 0.99,
        "produce_discount": -0.04,
    },
    {
        "market_id": "mkt_bodija",
        "name": "Bodija Market",
        "state": "Oyo",
        "city": "Ibadan",
        "latitude": 7.4352,
        "longitude": 3.9142,
        "market_type": "South-West Regional Staple Hub",
        "market_days": "Daily",
        "transport_tier": "Regional Transit Hub",
        "base_multiplier": 0.96,
        "produce_discount": -0.03,
    },
    {
        "market_id": "mkt_mile1",
        "name": "Mile 1 Market",
        "state": "Rivers",
        "city": "Diobu, Port Harcourt",
        "latitude": 4.7918,
        "longitude": 6.9985,
        "market_type": "South-South Major Food Market",
        "market_days": "Daily",
        "transport_tier": "Coastal Urban",
        "base_multiplier": 1.11,
        "produce_discount": 0.05,
    },
    {
        "market_id": "mkt_ogbete",
        "name": "Ogbete Main Market",
        "state": "Enugu",
        "city": "Enugu Municipal",
        "latitude": 6.4398,
        "longitude": 7.4892,
        "market_type": "South-East Commercial Hub",
        "market_days": "Mon - Sat",
        "transport_tier": "Regional Urban",
        "base_multiplier": 1.03,
        "produce_discount": 0.01,
    },
    {
        "market_id": "mkt_farin_gada",
        "name": "Farin Gada Tomato & Tuber Market",
        "state": "Plateau",
        "city": "Jos North",
        "latitude": 9.9565,
        "longitude": 8.8783,
        "market_type": "Middle-Belt Producer & Vegetable Hub",
        "market_days": "Daily",
        "transport_tier": "Producer Origin",
        "base_multiplier": 0.89,
        "produce_discount": -0.15,
    },
    {
        "market_id": "mkt_national",
        "name": "Market Average",
        "state": "National",
        "city": "All 36 States + FCT",
        "latitude": 9.0820,
        "longitude": 8.6753,
        "market_type": "World Bank National Benchmark",
        "market_days": "Monthly Benchmark",
        "transport_tier": "National Benchmark",
        "base_multiplier": 1.00,
        "produce_discount": 0.00,
    },
]

# 2. Define Core Commodities & Authentic Nigerian Units
# Note: World Bank raw data is per 1 kg (or 1 dozen/crate base for eggs).
# We provide exact unit multipliers so retailers can view prices per 1kg, Paint Bucket (Olodo), Derica, Mudu, or 50kg/100kg Bag.
COMMODITIES = {
    "rice": {
        "id": "rice",
        "display_name": "Rice (Parboiled / Local & Imported)",
        "short_name": "Rice",
        "category": "Grains & Cereals",
        "base_unit": "1 kg",
        "default_retail_unit": "50kg Bag",
        "northern_crop": True,
        "harvest_months": [10, 11, 12],
        "lean_months": [6, 7, 8],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Derica (850g)", "kg_equivalent": 0.85, "is_wholesale": False},
            {"unit_name": "Mudu (1.3kg)", "kg_equivalent": 1.3, "is_wholesale": False},
            {"unit_name": "Paint Bucket / Olodo (4kg)", "kg_equivalent": 4.0, "is_wholesale": False},
            {"unit_name": "25kg Half-Bag", "kg_equivalent": 25.0, "is_wholesale": True},
            {"unit_name": "50kg Bag", "kg_equivalent": 46.5, "is_wholesale": True},  # Bulk discount reflected in effective multiplier
        ],
    },
    "beans": {
        "id": "beans",
        "display_name": "Beans (Brown Oloyin / White)",
        "short_name": "Beans",
        "category": "Legumes & Pulses",
        "base_unit": "1 kg",
        "default_retail_unit": "Paint Bucket / Olodo (4kg)",
        "northern_crop": True,
        "harvest_months": [10, 11, 12, 1],
        "lean_months": [6, 7, 8],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Derica (800g)", "kg_equivalent": 0.8, "is_wholesale": False},
            {"unit_name": "Mudu (1.25kg)", "kg_equivalent": 1.25, "is_wholesale": False},
            {"unit_name": "Paint Bucket / Olodo (4kg)", "kg_equivalent": 4.0, "is_wholesale": False},
            {"unit_name": "50kg Bag", "kg_equivalent": 47.0, "is_wholesale": True},
            {"unit_name": "100kg Jute Bag", "kg_equivalent": 92.0, "is_wholesale": True},
        ],
    },
    "gari_fao": {
        "id": "gari_fao",
        "display_name": "Garri (White & Yellow IJebu/Bendel)",
        "short_name": "Garri",
        "category": "Tubers & Roots",
        "base_unit": "1 kg",
        "default_retail_unit": "Paint Bucket / Olodo (3.5kg)",
        "northern_crop": False,
        "harvest_months": [7, 8, 9, 10],
        "lean_months": [2, 3, 4],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Derica (750g)", "kg_equivalent": 0.75, "is_wholesale": False},
            {"unit_name": "Paint Bucket / Olodo (3.5kg)", "kg_equivalent": 3.5, "is_wholesale": False},
            {"unit_name": "50kg Bag", "kg_equivalent": 46.0, "is_wholesale": True},
        ],
    },
    "maize_fao": {
        "id": "maize_fao",
        "display_name": "Maize (Yellow & White Dry Grain)",
        "short_name": "Maize",
        "category": "Grains & Cereals",
        "base_unit": "1 kg",
        "default_retail_unit": "Paint Bucket / Olodo (4kg)",
        "northern_crop": True,
        "harvest_months": [8, 9, 10, 11],
        "lean_months": [4, 5, 6],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Mudu (1.3kg)", "kg_equivalent": 1.3, "is_wholesale": False},
            {"unit_name": "Paint Bucket / Olodo (4kg)", "kg_equivalent": 4.0, "is_wholesale": False},
            {"unit_name": "50kg Bag", "kg_equivalent": 47.0, "is_wholesale": True},
            {"unit_name": "100kg Bag", "kg_equivalent": 92.0, "is_wholesale": True},
        ],
    },
    "yam": {
        "id": "yam",
        "display_name": "Yam (Benue / Abuja White Tuber)",
        "short_name": "Yam",
        "category": "Tubers & Roots",
        "base_unit": "1 kg",
        "default_retail_unit": "Medium Tuber (~2.5kg)",
        "northern_crop": False,
        "harvest_months": [8, 9, 10, 11],
        "lean_months": [4, 5, 6],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Medium Tuber (~2.5kg)", "kg_equivalent": 2.5, "is_wholesale": False},
            {"unit_name": "Large Tuber (~4kg)", "kg_equivalent": 4.0, "is_wholesale": False},
            {"unit_name": "5 Tubers Heap", "kg_equivalent": 12.0, "is_wholesale": True},
            {"unit_name": "100 Tubers (Wholesale Pile)", "kg_equivalent": 225.0, "is_wholesale": True},
        ],
    },
    "onions": {
        "id": "onions",
        "display_name": "Onions (Red Sokoto / Kano Bulb)",
        "short_name": "Onions",
        "category": "Vegetables & Perishables",
        "base_unit": "1 kg",
        "default_retail_unit": "Small Basket (~5kg)",
        "northern_crop": True,
        "harvest_months": [2, 3, 4, 12],
        "lean_months": [7, 8, 9],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Paint Bucket (~3kg)", "kg_equivalent": 3.0, "is_wholesale": False},
            {"unit_name": "Small Basket (~5kg)", "kg_equivalent": 5.0, "is_wholesale": False},
            {"unit_name": "25kg Mesh Bag", "kg_equivalent": 23.5, "is_wholesale": True},
            {"unit_name": "Large Raffia Bag (~70kg)", "kg_equivalent": 65.0, "is_wholesale": True},
        ],
    },
    "groundnuts": {
        "id": "groundnuts",
        "display_name": "Groundnuts (Shelled Raw)",
        "short_name": "Groundnuts",
        "category": "Legumes & Pulses",
        "base_unit": "1 kg",
        "default_retail_unit": "Paint Bucket / Olodo (3.8kg)",
        "northern_crop": True,
        "harvest_months": [9, 10, 11],
        "lean_months": [4, 5, 6],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Mudu (1.2kg)", "kg_equivalent": 1.2, "is_wholesale": False},
            {"unit_name": "Paint Bucket / Olodo (3.8kg)", "kg_equivalent": 3.8, "is_wholesale": False},
            {"unit_name": "50kg Bag", "kg_equivalent": 46.5, "is_wholesale": True},
        ],
    },
    "meat_beef": {
        "id": "meat_beef",
        "display_name": "Beef (Boneless Fresh)",
        "short_name": "Beef",
        "category": "Livestock & Protein",
        "base_unit": "1 kg",
        "default_retail_unit": "1 kg",
        "northern_crop": True,
        "harvest_months": [11, 12, 1],
        "lean_months": [5, 6, 7],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "5 kg Catering Pack", "kg_equivalent": 4.8, "is_wholesale": True},
            {"unit_name": "Quarter Cow Share (~35kg)", "kg_equivalent": 32.0, "is_wholesale": True},
        ],
    },
    "fish": {
        "id": "fish",
        "display_name": "Fish (Titus / Smoked Catfish Base)",
        "short_name": "Fish",
        "category": "Livestock & Protein",
        "base_unit": "1 kg",
        "default_retail_unit": "1 kg",
        "northern_crop": False,
        "harvest_months": [10, 11, 12],
        "lean_months": [6, 7],
        "units": [
            {"unit_name": "1 kg", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "5 kg Pack", "kg_equivalent": 4.85, "is_wholesale": False},
            {"unit_name": "20kg Frozen Carton", "kg_equivalent": 18.8, "is_wholesale": True},
        ],
    },
    "eggs": {
        "id": "eggs",
        "display_name": "Eggs (Medium Poultry Crate)",
        "short_name": "Eggs",
        "category": "Livestock & Protein",
        "base_unit": "Crate (30 Eggs)",
        "default_retail_unit": "Crate (30 Eggs)",
        "northern_crop": False,
        "harvest_months": [1, 2, 10, 11],
        "lean_months": [5, 6, 7],
        "units": [
            {"unit_name": "Crate (30 Eggs)", "kg_equivalent": 1.0, "is_wholesale": False},
            {"unit_name": "Half Crate (15 Eggs)", "kg_equivalent": 0.52, "is_wholesale": False},
            {"unit_name": "10 Crates Bundle (Wholesale)", "kg_equivalent": 9.5, "is_wholesale": True},
        ],
    },
}


def build_datasets():
    print("Loading raw World Bank dataset...")
    df_raw = pd.read_csv(RAW_DATA_PATH)
    df_raw = df_raw.loc[:, ~df_raw.columns.str.startswith("Unnamed:")]
    df_raw["Date"] = pd.to_datetime(df_raw["Date"], errors="coerce")
    for col in ["Open", "High", "Low", "Close"]:
        df_raw[col] = pd.to_numeric(df_raw[col], errors="coerce")

    df_raw = df_raw.dropna(subset=["Date", "Product", "Close"]).copy()

    # Keep our 10 core staple commodities
    core_products = list(COMMODITIES.keys())
    df_core = df_raw[df_raw["Product"].isin(core_products)].copy()
    df_core = df_core.sort_values(["Product", "Date"]).reset_index(drop=True)

    # Save clean rice dataset for backward compatibility with inspect-data.ipynb
    rice_clean = df_core[df_core["Product"] == "rice"][
        ["Date", "Country", "Market", "Product", "Close", "Currency"]
    ].drop_duplicates(subset=["Date"], keep="last")
    rice_clean.to_csv(PROCESSED_DIR / "rice_prices_clean.csv", index=False)

    # Expand across the 11 regional markets + National Average
    # Using economically realistic regional multipliers, transport spreads, and seasonal variations
    expanded_rows = []
    for mkt in MARKETS:
        mkt_id = mkt["market_id"]
        mkt_name = mkt["name"]
        state = mkt["state"]
        base_mult = mkt["base_multiplier"]
        prod_disc = mkt["produce_discount"]

        for prod_id, group in df_core.groupby("Product"):
            c_meta = COMMODITIES[prod_id]
            is_northern = c_meta["northern_crop"]

            # Adjust multiplier based on whether commodity originates in the North vs South
            adj_mult = base_mult
            if is_northern and state in ["Kano", "Plateau"]:
                adj_mult += prod_disc  # Cheaper at producer source
            elif not is_northern and state in ["Oyo", "Enugu", "Rivers", "Lagos"]:
                adj_mult -= 0.04  # Garri, Yam, Eggs, Fish cheaper in South/Middle Belt
            elif not is_northern and state == "Kano":
                adj_mult += 0.08  # Southern/coastal items cost more in Kano

            # Specialized market discounts (e.g., Daleko for Rice, Mile 12 for Onions/Yam)
            if mkt_id == "mkt_daleko" and prod_id in ["rice", "beans", "maize_fao"]:
                adj_mult -= 0.04
            if mkt_id == "mkt_mile12" and prod_id in ["onions", "yam", "gari_fao"]:
                adj_mult -= 0.05

            n = len(group)
            # Smooth AR(1) local market supply shock so markets aren't simple linear multiples
            if mkt_id == "mkt_national":
                local_shock = np.zeros(n)
            else:
                ar_noise = np.zeros(n)
                eps = np.random.normal(0, 0.018, size=n)
                for i in range(1, n):
                    ar_noise[i] = 0.65 * ar_noise[i - 1] + eps[i]
                local_shock = ar_noise

            for idx, (_, row) in enumerate(group.iterrows()):
                month = row["Date"].month
                # Regional harvest effect
                seasonal_adj = 0.0
                if mkt_id != "mkt_national":
                    if month in c_meta["harvest_months"]:
                        seasonal_adj = -0.025 if is_northern and state in ["Kano", "Plateau"] else -0.012
                    elif month in c_meta["lean_months"]:
                        seasonal_adj = 0.022 if state in ["Lagos", "Rivers", "Abuja (FCT)"] else 0.01

                total_factor = max(0.65, adj_mult + seasonal_adj + local_shock[idx])
                close_p = round(float(row["Close"]) * total_factor, 2)
                open_p = round(float(row["Open"]) * total_factor, 2)
                high_p = round(max(close_p, open_p, float(row["High"]) * total_factor), 2)
                low_p = round(min(close_p, open_p, float(row["Low"]) * total_factor), 2)

                expanded_rows.append(
                    {
                        "Date": row["Date"].strftime("%Y-%m-%d"),
                        "Country": "Nigeria",
                        "Region": state,
                        "Market_ID": mkt_id,
                        "Market": mkt_name,
                        "Product": prod_id,
                        "Product_Name": c_meta["short_name"],
                        "Category": c_meta["category"],
                        "Base_Unit": c_meta["base_unit"],
                        "Open": open_p,
                        "High": high_p,
                        "Low": low_p,
                        "Close": close_p,
                        "Currency": "NGN",
                    }
                )

    df_expanded = pd.DataFrame(expanded_rows)
    history_path = PROCESSED_DIR / "market_prices_history.csv"
    df_expanded.to_csv(history_path, index=False)
    print(f"Saved {len(df_expanded):,} historical market rows to {history_path}")

    # Save metadata JSONs
    with open(PROCESSED_DIR / "markets_metadata.json", "w", encoding="utf-8") as f:
        json.dump(MARKETS, f, indent=2)

    with open(PROCESSED_DIR / "commodities_metadata.json", "w", encoding="utf-8") as f:
        json.dump(COMMODITIES, f, indent=2)

    # 3. Generate Dataset B: Crowdsourced Staple-Food Prices (2025-2026 daily submissions)
    # Includes realistic retailer/trader submissions in local units + 7% anomalous submissions for Model 3 validation
    print("Generating crowdsourced daily submissions dataset (Dataset B)...")
    latest_prices = (
        df_expanded[df_expanded["Date"] >= "2026-07-01"]
        .sort_values("Date")
        .groupby(["Market_ID", "Product"])
        .last()
        .reset_index()
    )

    reporters = [
        "Mama Ngozi Stores",
        "Alhaji Musa Grains",
        "Chinedu Bulk Foods",
        "Iya Bose Provision",
        "Bala Agro Traders",
        "Adaeze Kitchen Supply",
        "Tunde Retail Mart",
        "Hajiya Amina Staples",
        "Kemi Supermarket",
        "Obinna Foodstuff",
    ]

    crowd_rows = []
    sub_id = 1001
    dates_pool = pd.date_range("2026-09-01", "2026-10-20", freq="D")

    for _, row in latest_prices.iterrows():
        if row["Market_ID"] == "mkt_national":
            continue
        mkt_id = row["Market_ID"]
        mkt_name = row["Market"]
        state = row["Region"]
        prod_id = row["Product"]
        base_close = float(row["Close"])
        c_meta = COMMODITIES[prod_id]
        units_list = c_meta["units"]

        # Create 8 normal submissions + 1 anomalous submission per market-product pair
        for k in range(9):
            obs_date = np.random.choice(dates_pool)
            obs_date_str = pd.Timestamp(obs_date).strftime("%Y-%m-%d")
            unit_obj = units_list[k % len(units_list)]
            unit_name = unit_obj["unit_name"]
            kg_eq = unit_obj["kg_equivalent"]

            expected_unit_price = base_close * kg_eq

            is_anomaly = 1 if k == 8 else 0
            anomaly_reason = "None"

            if not is_anomaly:
                # Normal daily retail variation (-5% to +6%)
                noise_factor = np.random.normal(1.005, 0.028)
                submitted_price = round(expected_unit_price * noise_factor / 50.0) * 50.0
                if submitted_price <= 0:
                    submitted_price = round(expected_unit_price, 0)
                status = "verified"
            else:
                # Realistic anomaly types:
                # Type 1: Entered 50kg bag price while selecting 1kg unit (or vice versa)
                # Type 2: Missing a zero / extra zero typo
                # Type 3: Extreme price gouging / fake entry (+140% spike)
                anom_type = sub_id % 3
                if anom_type == 0:
                    submitted_price = round(expected_unit_price * np.random.uniform(2.3, 3.8) / 100.0) * 100.0
                    anomaly_reason = "Severe upward spike (>2.3x market benchmark)"
                elif anom_type == 1:
                    submitted_price = round(expected_unit_price * np.random.uniform(0.18, 0.35) / 50.0) * 50.0
                    anomaly_reason = "Unusually low price (<35% of market benchmark / unit mismatch)"
                else:
                    submitted_price = round(expected_unit_price * 10.0)
                    anomaly_reason = "Order-of-magnitude typo (10x expected unit price)"
                status = "flagged"

            price_per_base_unit = round(submitted_price / kg_eq, 2)

            crowd_rows.append(
                {
                    "submission_id": f"SUB-{sub_id}",
                    "observation_date": obs_date_str,
                    "state": state,
                    "market_id": mkt_id,
                    "market_name": mkt_name,
                    "product_id": prod_id,
                    "product_name": c_meta["short_name"],
                    "unit_name": unit_name,
                    "kg_equivalent": kg_eq,
                    "submitted_price_ngn": float(submitted_price),
                    "normalized_price_per_kg": price_per_base_unit,
                    "expected_benchmark_per_kg": round(base_close, 2),
                    "reporter_name": np.random.choice(reporters),
                    "reporter_role": np.random.choice(["Retailer", "Wholesaler", "Market Agent", "Consumer"], p=[0.5, 0.25, 0.15, 0.10]),
                    "is_anomaly_ground_truth": is_anomaly,
                    "verification_status": status,
                    "anomaly_note": anomaly_reason,
                }
            )
            sub_id += 1

    df_crowd = pd.DataFrame(crowd_rows).sort_values("observation_date", ascending=False).reset_index(drop=True)
    crowd_path = PROCESSED_DIR / "crowdsourced_submissions.csv"
    df_crowd.to_csv(crowd_path, index=False)
    print(f"Saved {len(df_crowd):,} crowdsourced submissions to {crowd_path}")


if __name__ == "__main__":
    build_datasets()
