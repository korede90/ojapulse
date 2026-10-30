# OjaPulse — Nigerian Food Market Intelligence & Retailer Restocking Platform

**OjaPulse** is a full-stack commodity price intelligence and restocking platform engineered for Nigerian grocery shop owners, market traders, restaurants, and households. It combines historical monthly commodity benchmarks from the World Bank (2007–2026) with live, statistically verified trader price quotes across regional Nigerian markets.

---

## Core Capabilities

1. **Market Overview & Volatility Watchlist**
   - Tracks **10 core Nigerian staples** (`Rice`, `Beans`, `Garri`, `Maize`, `Yam`, `Onions`, `Beef`, `Fish`, `Eggs`, `Groundnuts`) across **11 major regional markets** in **7 states** (`Lagos`, `Kano`, `Abuja (FCT)`, `Oyo`, `Rivers`, `Enugu`, `Plateau`) plus the **National Market Average**.
   - Built-in unit standardization for everyday Nigerian retail and wholesale measurements (`50kg Bag`, `100kg Jute Bag`, `Paint Bucket / Olodo (4kg)`, `Derica`, `Mudu`, `Medium/Large Tuber`, `Small Basket`, `Crate (30 Eggs)`, `1 kg`).
   - Automatic **Unusual Price Increase Watchlist** flagging commodities experiencing sharp month-over-month spikes or wide intra-month trading bands.

2. **Econometric & Tree-Ensemble Price Forecasting**
   - **2-Week (14-Day)**, **1-Month (30-Day)**, and **2-Month (60-Day)** price projections with empirical $10\text{th}–90\text{th}$ percentile confidence ranges (`low_estimate` to `high_estimate`).
   - Benchmarks **XGBoost** and **Random Forest** ratio-stationary panel regressors against **Naive Last-Month** and **3-Month Rolling Average** baselines using strict chronological splits.
   - Generates actionable restocking timing signals (*Buy Now*, *Normal Restock*, or *Hold for Harvest Easing*).

3. **Regional Market Arbitrage & Interactive Map**
   - Compares verified unit prices across producer hubs (e.g., *Dawanau in Kano*, *Farin Gada in Jos*), specialized wholesale terminals (*Daleko*, *Mile 12*), and urban retail markets (*Oyingbo*, *Wuse*, *Mile 1*, *Bodija*, *Ogbete*).
   - Interactive **Leaflet + OpenStreetMap** map color-coded by market price rank, displaying market operating days, transport tiers, and bulk arbitrage savings.

4. **Retailer Restocking & Working-Capital Calculator**
   - Interactive procurement planner where shop owners enter their shopping list, preferred market, restocking horizon (`14` or `30` days), and available working capital.
   - Computes today's cost vs. forecasted cost, budget surplus/deficit, a recommended safe contingency budget, and **One-Stop vs. Split-Market** sourcing savings.

5. **Crowdsourced Trader Price Feed & Outlier Screening**
   - Enables traders and shop owners to submit observed market prices in local units.
   - Screens every quote in real time using a hybrid **Robust Statistical Z-Score (`MAD / IQR`) + Isolation Forest** pipeline to catch unit-mismatch typos (such as entering a `50kg Bag` price under `1 kg`) and artificial price spikes before updating live market rankings.

---

## Repository Structure

```text
├── inspect-data.ipynb                  # Initial exploratory data inspection notebook
├── notebooks/
│   └── train_price_models.ipynb        # End-to-end EDA, ADF stationarity tests, RF/XGBoost & Isolation Forest training
├── data/
│   ├── raw/data.csv                    # World Bank Nigeria monthly food price series (2007–2026)
│   ├── prepare_datasets.py             # Builds multi-market historical series, unit catalog, and crowdsourced dataset
│   └── processed/                      # Processed CSVs, market/commodity JSON metadata, and evaluation figures
├── models/
│   ├── xgb_price_forecaster.joblib     # Trained XGBoost ratio-stationary forecasting pipeline
│   ├── rf_price_forecaster.joblib      # Trained Random Forest comparison pipeline
│   ├── anomaly_detector.joblib         # Hybrid Robust Z-Score + Isolation Forest outlier detector
│   └── model_metadata.json             # Out-of-sample test metrics, confidence intervals, and residual quantiles
├── backend/
│   ├── database.py                     # SQLAlchemy ORM (SQLite locally + PostgreSQL via DATABASE_URL)
│   ├── schemas.py                      # Pydantic request/response validation schemas
│   ├── ml_service.py                   # Forecasting & submission verification service
│   └── main.py                         # FastAPI application and REST endpoints
├── frontend/                           # React 18, Vite, Tailwind CSS, Recharts, and React-Leaflet
├── run_model.py                        # Command-line inference & anomaly verification runner
├── render.yaml                         # Render deployment blueprint (PostgreSQL + FastAPI + Static Web)
├── start_app.bat                       # Windows startup script for Backend + Frontend
└── requirements.txt                    # Python package dependencies
```

---

## Getting Started Locally

### 1. Start Backend & Frontend Together (Windows)
```powershell
.\start_app.bat
```

### 2. Manual Startup
**Backend API (Port 8000):**
```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

**Frontend Web App (Port 5173):**
```powershell
cd frontend
npm install
npm run dev
```

- **Web Application:** `http://localhost:5173`
- **API Documentation (Swagger UI):** `http://127.0.0.1:8000/docs`

---

## Author
**Korede ([@korede90](https://github.com/korede90))**
