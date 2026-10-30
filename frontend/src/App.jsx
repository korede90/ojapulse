import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  MapPin,
  ShoppingBag,
  PlusCircle,
  CheckCircle2,
  ShieldAlert,
  BarChart3,
  Calculator,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  Info,
  Trash2,
  Layers,
  Award,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const formatNGN = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₦0';
  return '₦' + Number(val).toLocaleString('en-NG', { maximumFractionDigits: 0 });
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [metadata, setMetadata] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Global Filters
  const [selectedState, setSelectedState] = useState('All');
  const [selectedMarket, setSelectedMarket] = useState('mkt_mile12');
  const [selectedProduct, setSelectedProduct] = useState('rice');
  const [selectedUnit, setSelectedUnit] = useState('50kg Bag');
  const [startDate, setStartDate] = useState('2022-01-01');

  // Data States
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [marketComparison, setMarketComparison] = useState(null);
  const [submissionsList, setSubmissionsList] = useState([]);

  // Submission Form State
  const [subForm, setSubForm] = useState({
    market_id: 'mkt_mile12',
    product_id: 'rice',
    unit_name: '50kg Bag',
    submitted_price_ngn: '',
    observation_date: '2026-10-20',
    reporter_name: '',
    reporter_role: 'Retailer',
  });
  const [subFeedback, setSubFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Retailer Restocking Assistant State
  const [restockBudget, setRestockBudget] = useState(850000);
  const [restockHorizon, setRestockHorizon] = useState(14);
  const [restockItems, setRestockItems] = useState([
    { product_id: 'rice', unit_name: '50kg Bag', quantity: 2 },
    { product_id: 'beans', unit_name: '50kg Bag', quantity: 1 },
    { product_id: 'gari_fao', unit_name: '50kg Bag', quantity: 2 },
    { product_id: 'onions', unit_name: '25kg Mesh Bag', quantity: 2 },
    { product_id: 'yam', unit_name: '5 Tubers Heap', quantity: 3 },
  ]);
  const [restockPlan, setRestockPlan] = useState(null);
  const [calculatingRestock, setCalculatingRestock] = useState(false);

  // Load Metadata on Mount
  useEffect(() => {
    fetch(`${API_BASE}/api/metadata`)
      .then((res) => res.json())
      .then((data) => {
        setMetadata(data);
        setLoadingMeta(false);
      })
      .catch((err) => {
        console.error('Failed to load metadata:', err);
        setLoadingMeta(false);
      });
  }, []);

  // Available units when selectedProduct changes
  const availableUnits = useMemo(() => {
    if (!metadata || !metadata.commodities[selectedProduct]) return [];
    return metadata.commodities[selectedProduct].units || [];
  }, [metadata, selectedProduct]);

  // Keep selectedUnit valid for selectedProduct
  useEffect(() => {
    if (!metadata || !metadata.commodities[selectedProduct]) return;
    const cMeta = metadata.commodities[selectedProduct];
    const valid = cMeta.units.some((u) => u.unit_name === selectedUnit);
    if (!valid) {
      setSelectedUnit(cMeta.default_retail_unit);
    }
  }, [selectedProduct, metadata]);

  // Filtered Markets by State
  const filteredMarkets = useMemo(() => {
    if (!metadata) return [];
    return metadata.markets.filter(
      (m) => selectedState === 'All' || m.state === selectedState || m.market_id === 'mkt_national'
    );
  }, [metadata, selectedState]);

  // Fetch Dashboard Summary, History, Forecast, and Market Comparison
  const refreshAllData = () => {
    if (!metadata) return;
    const unitParam = encodeURIComponent(selectedUnit);

    fetch(`${API_BASE}/api/dashboard/summary?market_id=${selectedMarket}&state=${encodeURIComponent(selectedState)}`)
      .then((r) => r.json())
      .then(setDashboardSummary)
      .catch(console.error);

    fetch(
      `${API_BASE}/api/prices/history?product_id=${selectedProduct}&market_id=${selectedMarket}&unit_name=${unitParam}&start_date=${startDate}`
    )
      .then((r) => r.json())
      .then((d) => setPriceHistory(d.series || []))
      .catch(console.error);

    fetch(`${API_BASE}/api/forecast?product_id=${selectedProduct}&market_id=${selectedMarket}&unit_name=${unitParam}`)
      .then((r) => r.json())
      .then(setForecastData)
      .catch(console.error);

    fetch(
      `${API_BASE}/api/markets/compare?product_id=${selectedProduct}&unit_name=${unitParam}&state=${encodeURIComponent(
        selectedState
      )}`
    )
      .then((r) => r.json())
      .then(setMarketComparison)
      .catch(console.error);

    fetch(`${API_BASE}/api/submissions?limit=35`)
      .then((r) => r.json())
      .then((d) => setSubmissionsList(d.submissions || []))
      .catch(console.error);
  };

  useEffect(() => {
    refreshAllData();
  }, [metadata, selectedMarket, selectedProduct, selectedUnit, selectedState, startDate]);

  // Calculate Restocking Plan
  const runRestockAssistant = () => {
    if (!restockItems.length) return;
    setCalculatingRestock(true);
    fetch(`${API_BASE}/api/retailer/restock-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferred_market_id: selectedMarket === 'mkt_national' ? 'mkt_mile12' : selectedMarket,
        state_filter: selectedState,
        budget_ngn: Number(restockBudget),
        horizon_days: Number(restockHorizon),
        items: restockItems,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setRestockPlan(data);
        setCalculatingRestock(false);
      })
      .catch((err) => {
        console.error(err);
        setCalculatingRestock(false);
      });
  };

  useEffect(() => {
    if (metadata) {
      runRestockAssistant();
    }
  }, [metadata, selectedMarket, selectedState, restockHorizon]);

  // Handle Community Price Submission
  const handleSubmissionSubmit = (e) => {
    e.preventDefault();
    if (!subForm.submitted_price_ngn || Number(subForm.submitted_price_ngn) <= 0) return;
    setSubmitting(true);
    setSubFeedback(null);

    fetch(`${API_BASE}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...subForm,
        submitted_price_ngn: Number(subForm.submitted_price_ngn),
        reporter_name: subForm.reporter_name.trim() || 'Local Market Trader',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSubFeedback(data);
        setSubmitting(false);
        setSubForm((prev) => ({ ...prev, submitted_price_ngn: '' }));
        refreshAllData();
      })
      .catch((err) => {
        console.error(err);
        setSubmitting(false);
      });
  };

  // Fill Quick Demo Submission (Normal vs Anomaly)
  const fillQuickTestSubmission = (type) => {
    const prod = subForm.product_id;
    const cMeta = metadata?.commodities[prod];
    const defaultU = cMeta ? cMeta.default_retail_unit : '50kg Bag';
    if (type === 'normal') {
      setSubForm({
        market_id: 'mkt_mile12',
        product_id: 'rice',
        unit_name: '50kg Bag',
        submitted_price_ngn: '211500',
        observation_date: '2026-10-20',
        reporter_name: 'Iya Latifat Provisions (Kosofe)',
        reporter_role: 'Retailer',
      });
    } else {
      setSubForm({
        market_id: 'mkt_mile12',
        product_id: 'rice',
        unit_name: '1 kg',
        submitted_price_ngn: '210000',
        observation_date: '2026-10-20',
        reporter_name: 'Unverified Entry (Unit Typo Test)',
        reporter_role: 'Consumer',
      });
    }
  };

  if (loadingMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-lg font-semibold tracking-wide">Loading OjaPulse Market Terminal...</p>
        </div>
      </div>
    );
  }

  const currentMarketObj = metadata?.markets.find((m) => m.market_id === selectedMarket);
  const currentProductObj = metadata?.commodities[selectedProduct];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-900/50">
              <Store className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">OjaPulse</h1>
                <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Market & Restocking Intelligence
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Nigerian Commodity Benchmarks (2007–2026) & Verified Trader Price Index
              </p>
            </div>
          </div>

          {/* Navigation Pills */}
          <nav className="flex flex-wrap items-center gap-1.5 bg-slate-800/90 p-1.5 rounded-xl border border-slate-700">
            {[
              { id: 'dashboard', label: 'Market Overview', icon: BarChart3 },
              { id: 'forecast', label: 'Price Forecasts', icon: TrendingUp },
              { id: 'compare', label: 'Regional Arbitrage & Map', icon: MapPin },
              { id: 'restock', label: 'Restocking Calculator', icon: Calculator },
              { id: 'submissions', label: 'Trader Price Feed', icon: PlusCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    active
                      ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-slate-800/80 border-t border-slate-700/80 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-3 items-center">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                State Filter
              </label>
              <select
                value={selectedState}
                onChange={(e) => {
                  const st = e.target.value;
                  setSelectedState(st);
                  if (st !== 'All') {
                    const firstM = metadata?.markets.find((m) => m.state === st);
                    if (firstM) setSelectedMarket(firstM.market_id);
                  }
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="All">All Nigerian States (7 Hubs)</option>
                {metadata?.states.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                Selected Market Hub
              </label>
              <select
                value={selectedMarket}
                onChange={(e) => setSelectedMarket(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                {filteredMarkets.map((m) => (
                  <option key={m.market_id} value={m.market_id}>
                    {m.name} ({m.state})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                Staple Commodity
              </label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                {metadata &&
                  Object.values(metadata.commodities).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                Market Measurement Unit
              </label>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="w-full bg-slate-900 border border-emerald-500/50 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-emerald-300 font-medium focus:outline-none focus:border-emerald-400"
              >
                {availableUnits.map((u) => (
                  <option key={u.unit_name} value={u.unit_name}>
                    {u.unit_name} ({u.is_wholesale ? 'Wholesale' : 'Retail'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                History Window
              </label>
              <select
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="2024-01-01">Last 3 Years (2024–2026)</option>
                <option value="2020-01-01">Last 6 Years (2020–2026)</option>
                <option value="2015-01-01">Last 11 Years (2015–2026)</option>
                <option value="2007-01-01">Full World Bank Series (2007–2026)</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Unusual Price Spike Banner (Answers: "Which products have experienced unusual price increases?") */}
        {dashboardSummary?.unusual_price_increases?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-700 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-amber-950">
                    Unusual Price Increase Watchlist — {currentMarketObj?.name}
                  </h3>
                  <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    {dashboardSummary.unusual_price_increases.length} Commodities Flagged for High Volatility
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {dashboardSummary.unusual_price_increases.slice(0, 3).map((sp) => (
                    <div
                      key={sp.product_id}
                      onClick={() => setSelectedProduct(sp.product_id)}
                      className="cursor-pointer bg-white/90 hover:bg-white border border-amber-200/80 rounded-xl p-2.5 transition flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-900">{sp.product_name}</p>
                        <p className="text-[11px] text-slate-600">
                          {formatNGN(sp.unit_price)} / {sp.unit_name}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        +{sp.mom_change_pct}% MoM
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB A: FOOD-PRICE DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Spotlight KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Current {currentProductObj?.short_name} Price
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <p className="text-2xl font-extrabold text-slate-900">
                    {formatNGN(forecastData?.current_benchmark_price)}
                  </p>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    per {selectedUnit}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {currentMarketObj?.name} ({currentMarketObj?.state})
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  2-Week Price Projection
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <p className="text-2xl font-extrabold text-slate-900">
                    {formatNGN(forecastData?.forecast_2_weeks?.predicted_price)}
                  </p>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      (forecastData?.forecast_2_weeks?.expected_change_pct || 0) > 0
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {(forecastData?.forecast_2_weeks?.expected_change_pct || 0) >= 0 ? '+' : ''}
                    {forecastData?.forecast_2_weeks?.expected_change_pct}%
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Range: {formatNGN(forecastData?.forecast_2_weeks?.low_estimate)} –{' '}
                  {formatNGN(forecastData?.forecast_2_weeks?.high_estimate)}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Best Market Deal Today
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <p className="text-2xl font-extrabold text-emerald-700">
                    {formatNGN(marketComparison?.cheapest_market?.equivalent_unit_price)}
                  </p>
                  <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                    Lowest Verified
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 font-medium truncate">
                  {marketComparison?.cheapest_market?.market_name} ({marketComparison?.cheapest_market?.state})
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Community Verification Status
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <p className="text-2xl font-extrabold text-slate-900">
                    {dashboardSummary?.platform_stats?.verified_submissions || 0}
                  </p>
                  <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                    {dashboardSummary?.platform_stats?.flagged_anomalies || 0} Outliers Blocked
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Hybrid Z-Score + Isolation Forest Active
                </p>
              </div>
            </div>

            {/* Commodity Price Cards Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Staple Commodity Prices in {currentMarketObj?.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Click any staple card below to inspect its historical trend, unit conversions, and 2-week forecast
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {dashboardSummary?.commodity_cards?.map((card) => {
                  const isSelected = card.product_id === selectedProduct;
                  return (
                    <div
                      key={card.product_id}
                      onClick={() => setSelectedProduct(card.product_id)}
                      className={`cursor-pointer rounded-2xl p-4 border transition-all ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-emerald-500'
                          : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            isSelected ? 'bg-slate-800 text-emerald-300' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {card.category.split(' ')[0]}
                        </span>
                        <span
                          className={`inline-flex items-center text-xs font-bold ${
                            card.mom_change_pct > 2.5
                              ? isSelected
                                ? 'text-rose-400'
                                : 'text-rose-600'
                              : isSelected
                              ? 'text-emerald-400'
                              : 'text-emerald-600'
                          }`}
                        >
                          {card.mom_change_pct >= 0 ? '+' : ''}
                          {card.mom_change_pct}%
                        </span>
                      </div>

                      <h3 className="mt-2 font-bold text-base">{card.product_name}</h3>
                      <p className={`text-xl font-extrabold mt-1 ${isSelected ? 'text-emerald-400' : 'text-slate-900'}`}>
                        {formatNGN(card.default_unit_price)}
                      </p>
                      <p className={`text-xs mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        per {card.default_unit}
                      </p>
                      <div
                        className={`mt-2.5 pt-2 border-t text-[11px] flex items-center justify-between ${
                          isSelected ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-400'
                        }`}
                      >
                        <span>1 kg base: {formatNGN(card.base_price_per_kg)}</span>
                        {card.is_unusual_spike && (
                          <span className="text-amber-500 font-semibold">Spike Alert</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historical Price Trajectory Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Historical Price Trend: {currentProductObj?.display_name} ({selectedUnit})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Comparing {currentMarketObj?.name} ({currentMarketObj?.state}) against the World Bank National Market
                    Average & Monthly High/Low Volatility Band
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('forecast')}
                    className="text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
                  >
                    View Price Projections →
                  </button>
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={priceHistory} margin={{ top: 10, right: 20, left: 15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis
                      tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                      width={65}
                    />
                    <Tooltip
                      formatter={(value, name) => [formatNGN(value), name]}
                      labelFormatter={(l) => `Month: ${l}`}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="high"
                      name="Monthly High Bound"
                      fill="#10b981"
                      fillOpacity={0.12}
                      stroke="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="close"
                      name={`${currentMarketObj?.name} (${selectedUnit})`}
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="national_avg_close"
                      name="National Market Average"
                      stroke="#64748b"
                      strokeWidth={1.8}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB B: AI PRICE FORECASTING */}
        {activeTab === 'forecast' && forecastData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Forecast Horizons Summary */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                      XGBoost Ratio-Stationary Panel Forecaster
                    </span>
                    <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                      {forecastData.product_name} — {forecastData.market_name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Unit: <strong>{forecastData.unit_name}</strong> ({forecastData.kg_equivalent} kg base equivalent) |
                      Last Benchmark Date: {forecastData.last_historical_date}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Current Benchmark</span>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {formatNGN(forecastData.current_benchmark_price)}
                    </span>
                  </div>
                </div>

                {/* 3 Forecast Horizon Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">2-Week Forecast</span>
                      <Calendar className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Target Date: <strong>{forecastData.forecast_2_weeks.target_date}</strong>
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-2">
                      {formatNGN(forecastData.forecast_2_weeks.predicted_price)}
                    </p>
                    <p className="text-xs font-semibold text-emerald-800 mt-1">
                      Est. Range: {formatNGN(forecastData.forecast_2_weeks.low_estimate)} –{' '}
                      {formatNGN(forecastData.forecast_2_weeks.high_estimate)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">1-Month Forecast</span>
                      <Calendar className="w-4 h-4 text-slate-500" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Target Date: <strong>{forecastData.forecast_1_month.target_date}</strong>
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-2">
                      {formatNGN(forecastData.forecast_1_month.predicted_price)}
                    </p>
                    <p className="text-xs font-medium text-slate-600 mt-1">
                      Est. Range: {formatNGN(forecastData.forecast_1_month.low_estimate)} –{' '}
                      {formatNGN(forecastData.forecast_1_month.high_estimate)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">2-Month Outlook</span>
                      <Calendar className="w-4 h-4 text-slate-500" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Target Date: <strong>{forecastData.forecast_2_months.target_date}</strong>
                    </p>
                    <p className="text-2xl font-extrabold text-slate-900 mt-2">
                      {formatNGN(forecastData.forecast_2_months.predicted_price)}
                    </p>
                    <p className="text-xs font-medium text-slate-600 mt-1">
                      Est. Range: {formatNGN(forecastData.forecast_2_months.low_estimate)} –{' '}
                      {formatNGN(forecastData.forecast_2_months.high_estimate)}
                    </p>
                  </div>
                </div>

                {/* Forecast Chart with Confidence Fan */}
                <div className="h-80 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={forecastData.chart_series} margin={{ top: 10, right: 20, left: 15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11 }}
                        width={65}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip formatter={(val, name) => [formatNGN(val), name]} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="high_estimate"
                        name="Forecast Upper Range (90th Pct)"
                        fill="#10b981"
                        fillOpacity={0.18}
                        stroke="#10b981"
                        strokeDasharray="2 2"
                      />
                      <Line
                        type="monotone"
                        dataKey="actual_price"
                        name="Historical Recorded Price"
                        stroke="#0f172a"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="predicted_price"
                        name="XGBoost Forecast"
                        stroke="#059669"
                        strokeWidth={3}
                        dot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="rf_predicted"
                        name="Random Forest Forecast"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="monotone"
                        dataKey="baseline_naive"
                        name="Baseline (Last Month)"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right Column: Retailer Advisory, Model Comparison & Limitations */}
              <div className="space-y-4">
                <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    Retailer Restocking Signal
                  </span>
                  <h3 className="text-base font-bold mt-1">{forecastData.retailer_advisory.recommendation}</h3>
                  <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span>Selected Model:</span>
                      <span className="font-semibold text-white">XGBoost Regressor</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Commodity Out-of-Sample MAPE:</span>
                      <span className="font-semibold text-emerald-400">
                        {forecastData.retailer_advisory.commodity_test_mape_pct}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Random Forest 1M Estimate:</span>
                      <span className="font-semibold text-amber-300">
                        {formatNGN(forecastData.forecast_1_month.rf_predicted_price)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Naive Baseline (Last Month):</span>
                      <span className="font-semibold text-slate-400">
                        {formatNGN(forecastData.forecast_1_month.baseline_naive_price)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>3-Month Rolling Avg Baseline:</span>
                      <span className="font-semibold text-slate-400">
                        {formatNGN(forecastData.forecast_1_month.baseline_ma3_price)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Model Evaluation Table against Baseline */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    Chronological Test Evaluation (2025–2026)
                  </h3>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Trained in <code>notebooks/train_price_models.ipynb</code> using strict chronological splits
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-1.5">Model</th>
                          <th className="py-1.5 text-right">MAE (₦/kg)</th>
                          <th className="py-1.5 text-right">MAPE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {metadata?.model_metadata?.baseline_comparison?.map((row, i) => (
                          <tr
                            key={i}
                            className={row.Model.includes('XGBoost') ? 'font-bold text-emerald-700 bg-emerald-50/50' : ''}
                          >
                            <td className="py-2 pr-2">{row.Model.replace('Model 2B: ', '').replace('Model 2A: ', '')}</td>
                            <td className="py-2 text-right">₦{row['MAE (NGN/kg)']}</td>
                            <td className="py-2 text-right">{row['MAPE (%)']}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Explicit Model Limitations Card */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-xs text-amber-950 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>Model Scope & Practical Limitations</span>
                  </div>
                  <p className="leading-relaxed text-amber-900/90">
                    {forecastData.retailer_advisory.limitations_note}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB D: MARKET COMPARISON & INTERACTIVE LEAFLET MAP */}
        {activeTab === 'compare' && marketComparison && (
          <div className="space-y-6">
            {/* Top Arbitrage Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-emerald-900 text-white rounded-2xl p-4 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  Cheapest Verified Market ({selectedUnit})
                </span>
                <p className="text-xl font-extrabold mt-1">
                  {marketComparison.cheapest_market?.market_name} ({marketComparison.cheapest_market?.state})
                </p>
                <p className="text-2xl font-black text-emerald-400 mt-1">
                  {formatNGN(marketComparison.cheapest_market?.equivalent_unit_price)}
                </p>
                <p className="text-xs text-emerald-200 mt-1">
                  Tier: {marketComparison.cheapest_market?.transport_tier}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Highest Priced Market ({selectedUnit})
                </span>
                <p className="text-xl font-bold text-slate-900 mt-1">
                  {marketComparison.most_expensive_market?.market_name} ({marketComparison.most_expensive_market?.state})
                </p>
                <p className="text-2xl font-extrabold text-rose-600 mt-1">
                  {formatNGN(marketComparison.most_expensive_market?.equivalent_unit_price)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Tier: {marketComparison.most_expensive_market?.transport_tier}
                </p>
              </div>

              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Max Bulk Savings Per {selectedUnit}
                </span>
                <p className="text-2xl font-extrabold text-emerald-600 mt-2">
                  {formatNGN(marketComparison.max_potential_savings_per_unit)}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Average Across Markets: <strong>{formatNGN(marketComparison.average_market_price)}</strong>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Standardized to {marketComparison.kg_equivalent} kg equivalent per unit
                </p>
              </div>
            </div>

            {/* Interactive Map + Bar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Leaflet Map */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col">
                <div className="mb-3">
                  <h3 className="text-base font-bold text-slate-900">
                    Interactive Nigerian Market Price Map — {currentProductObj?.short_name} ({selectedUnit})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Green markers indicate the lowest-priced wholesale/producer hubs; click any market circle for details
                  </p>
                </div>
                <div className="h-96 w-full rounded-xl overflow-hidden border border-slate-200">
                  <MapContainer center={[8.6753, 7.0]} zoom={6} scrollWheelZoom={false}>
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {marketComparison.markets.map((m) => {
                      const isCheapest = m.rank <= 3;
                      const isExpensive = m.rank >= marketComparison.markets.length - 2;
                      const color = isCheapest ? '#059669' : isExpensive ? '#e11d48' : '#d97706';
                      return (
                        <CircleMarker
                          key={m.market_id}
                          center={[m.latitude, m.longitude]}
                          radius={11}
                          pathOptions={{
                            color,
                            fillColor: color,
                            fillOpacity: 0.8,
                            weight: 2,
                          }}
                        >
                          <Popup>
                            <div className="text-xs space-y-1">
                              <p className="font-bold text-sm text-slate-900">{m.market_name}</p>
                              <p className="text-slate-600">
                                {m.city}, {m.state} ({m.market_type})
                              </p>
                              <p className="font-extrabold text-emerald-700 text-sm">
                                {formatNGN(m.equivalent_unit_price)} / {m.unit_name}
                              </p>
                              <p className="text-slate-500">Market Days: {m.market_days}</p>
                              <p className="text-slate-500">Latest Source: {m.latest_reporter}</p>
                            </div>
                          </Popup>
                        </CircleMarker>
                      );
                    })}
                  </MapContainer>
                </div>
              </div>

              {/* Market Comparison Bar Chart */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col">
                <div className="mb-3">
                  <h3 className="text-base font-bold text-slate-900">
                    Verified Price Ranking Across Markets ({selectedUnit})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Equivalent quantity comparison combining recent verified trader submissions & market benchmarks
                  </p>
                </div>
                <div className="h-96 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={marketComparison.markets}
                      layout="vertical"
                      margin={{ top: 5, right: 25, left: 35, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="market_name"
                        width={150}
                        tick={{ fontSize: 11, fontWeight: 600 }}
                      />
                      <Tooltip formatter={(v) => [formatNGN(v), `Price per ${selectedUnit}`]} />
                      <Bar dataKey="equivalent_unit_price" radius={[0, 6, 6, 0]}>
                        {marketComparison.markets.map((entry, idx) => (
                          <Cell
                            key={entry.market_id}
                            fill={idx === 0 ? '#059669' : idx < 4 ? '#10b981' : '#334155'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Detailed Market Comparison Table */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-x-auto">
              <h3 className="text-base font-bold text-slate-900 mb-3">
                Full Market-by-Market Arbitrage & Verification Table
              </h3>
              <table className="w-full text-xs sm:text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase">
                    <th className="py-2.5 px-2">Rank</th>
                    <th className="py-2.5 px-2">Market & State</th>
                    <th className="py-2.5 px-2">Market Type & Days</th>
                    <th className="py-2.5 px-2 text-right">Verified Price ({selectedUnit})</th>
                    <th className="py-2.5 px-2 text-right">Savings vs Highest</th>
                    <th className="py-2.5 px-2">Latest Verified Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {marketComparison.markets.map((m) => (
                    <tr key={m.market_id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-2 font-bold">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                            m.rank === 1
                              ? 'bg-emerald-500 text-white'
                              : m.rank <= 3
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {m.rank}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <p className="font-bold text-slate-900">{m.market_name}</p>
                        <p className="text-xs text-slate-500">
                          {m.city}, {m.state}
                        </p>
                      </td>
                      <td className="py-3 px-2">
                        <p className="text-xs font-medium text-slate-700">{m.market_type}</p>
                        <p className="text-[11px] text-slate-400">{m.market_days}</p>
                      </td>
                      <td className="py-3 px-2 text-right font-extrabold text-slate-900">
                        {formatNGN(m.equivalent_unit_price)}
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-emerald-600">
                        {m.savings_vs_highest_ngn > 0 ? `Save ${formatNGN(m.savings_vs_highest_ngn)}` : '—'}
                      </td>
                      <td className="py-3 px-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-800">{m.latest_reporter}</span>
                        <span className="block text-[11px] text-slate-400">Updated: {m.last_updated}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB E: RETAILER RESTOCKING ASSISTANT */}
        {activeTab === 'restock' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Shopping List & Budget Builder */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                    Shop Owner Planning Tool
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-0.5">Retailer Restocking List & Budget</h2>
                  <p className="text-xs text-slate-500">
                    Enter your shop's restocking quantities and working capital budget to forecast costs and find the
                    cheapest market
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Available Budget (NGN)
                    </label>
                    <input
                      type="number"
                      value={restockBudget}
                      onChange={(e) => setRestockBudget(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Restock Horizon
                    </label>
                    <select
                      value={restockHorizon}
                      onChange={(e) => setRestockHorizon(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={14}>In 2 Weeks (14 Days)</option>
                      <option value={30}>In 1 Month (30 Days)</option>
                    </select>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase text-slate-500">Shopping List Items</span>
                    <button
                      type="button"
                      onClick={() =>
                        setRestockItems([
                          ...restockItems,
                          { product_id: 'maize_fao', unit_name: '50kg Bag', quantity: 1 },
                        ])
                      }
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>

                  {restockItems.map((item, idx) => {
                    const pMeta = metadata?.commodities[item.product_id];
                    const uList = pMeta?.units || [];
                    return (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={item.product_id}
                            onChange={(e) => {
                              const newProd = e.target.value;
                              const newDefaultUnit = metadata?.commodities[newProd]?.default_retail_unit || '1 kg';
                              const updated = [...restockItems];
                              updated[idx] = { ...item, product_id: newProd, unit_name: newDefaultUnit };
                              setRestockItems(updated);
                            }}
                            className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                          >
                            {metadata &&
                              Object.values(metadata.commodities).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.short_name}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setRestockItems(restockItems.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-2">
                            <select
                              value={item.unit_name}
                              onChange={(e) => {
                                const updated = [...restockItems];
                                updated[idx] = { ...item, unit_name: e.target.value };
                                setRestockItems(updated);
                              }}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700"
                            >
                              {uList.map((u) => (
                                <option key={u.unit_name} value={u.unit_name}>
                                  {u.unit_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...restockItems];
                                updated[idx] = { ...item, quantity: Math.max(1, Number(e.target.value)) };
                                setRestockItems(updated);
                              }}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-center"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={runRestockAssistant}
                  disabled={calculatingRestock}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${calculatingRestock ? 'animate-spin' : ''}`} />
                  <span>Calculate Restocking Cost & Forecast</span>
                </button>
              </div>

              {/* Right 2 Columns: Restocking Budget Results & Market Basket Optimization */}
              {restockPlan && (
                <div className="lg:col-span-2 space-y-5">
                  {/* Budget Status KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        Cost Today ({currentMarketObj?.name})
                      </span>
                      <p className="text-2xl font-extrabold text-slate-900 mt-1">
                        {formatNGN(restockPlan.summary.total_current_cost_ngn)}
                      </p>
                      <p
                        className={`text-xs font-bold mt-1 ${
                          restockPlan.summary.within_budget_now ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {restockPlan.summary.within_budget_now
                          ? `${formatNGN(restockPlan.summary.budget_surplus_or_deficit_current)} Under Budget`
                          : `${formatNGN(Math.abs(restockPlan.summary.budget_surplus_or_deficit_current))} Over Budget`}
                      </p>
                    </div>

                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        Forecasted Cost ({restockPlan.horizon_days} Days)
                      </span>
                      <p className="text-2xl font-extrabold text-slate-900 mt-1">
                        {formatNGN(restockPlan.summary.total_forecast_cost_ngn)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Range: {formatNGN(restockPlan.summary.forecast_range_low_ngn)} –{' '}
                        {formatNGN(restockPlan.summary.forecast_range_high_ngn)}
                      </p>
                    </div>

                    <div className="bg-emerald-900 text-white rounded-2xl p-4 shadow-sm">
                      <span className="text-xs font-semibold uppercase text-emerald-300">
                        Optimal Split-Market Cost
                      </span>
                      <p className="text-2xl font-black text-emerald-400 mt-1">
                        {formatNGN(restockPlan.summary.optimal_split_market_cost_ngn)}
                      </p>
                      <p className="text-xs text-emerald-200 mt-1">
                        Save <strong>{formatNGN(restockPlan.summary.potential_arbitrage_savings_ngn)}</strong> by
                        sourcing items from lowest-cost hubs
                      </p>
                    </div>
                  </div>

                  {/* Line-by-Line Breakdown Table */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-x-auto">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h3 className="text-base font-bold text-slate-900">
                        Itemized Restocking Forecast & Best Market Arbitrage
                      </h3>
                      <span className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg">
                        Recommended Safe Contingency Budget:{' '}
                        <strong>{formatNGN(restockPlan.summary.recommended_safe_budget_ngn)}</strong>
                      </span>
                    </div>

                    <table className="w-full text-xs sm:text-sm text-left">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase">
                          <th className="py-2 px-2">Item & Quantity</th>
                          <th className="py-2 px-2 text-right">Today Subtotal</th>
                          <th className="py-2 px-2 text-right">Forecast ({restockPlan.horizon_days}d)</th>
                          <th className="py-2 px-2">Timing Signal</th>
                          <th className="py-2 px-2">Best Market for Item</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {restockPlan.items.map((it, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-3 px-2">
                              <p className="font-bold text-slate-900">
                                {it.quantity} × {it.product_name}
                              </p>
                              <p className="text-xs text-slate-500">{it.unit_name}</p>
                            </td>
                            <td className="py-3 px-2 text-right font-semibold text-slate-800">
                              {formatNGN(it.current_subtotal)}
                              <span className="block text-[11px] text-slate-400">
                                {formatNGN(it.current_unit_price)} / unit
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right font-bold text-slate-900">
                              {formatNGN(it.forecast_subtotal)}
                              <span
                                className={`block text-[11px] ${
                                  it.expected_change_pct > 0 ? 'text-rose-600' : 'text-emerald-600'
                                }`}
                              >
                                {it.expected_change_pct >= 0 ? '+' : ''}
                                {it.expected_change_pct}%
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <span
                                className={`inline-block text-xs font-semibold px-2 py-1 rounded-lg ${
                                  it.buy_timing_advice.includes('Buy Now')
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-emerald-50 text-emerald-800'
                                }`}
                              >
                                {it.buy_timing_advice}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-xs">
                              <p className="font-bold text-emerald-700">{it.cheapest_market_for_item}</p>
                              {it.potential_item_savings > 0 && (
                                <p className="text-[11px] text-emerald-600">
                                  Save {formatNGN(it.potential_item_savings)}
                                </p>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Single-Stop Market Ranking for Entire Basket */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 mb-1">
                      Total Shopping Basket Cost by Market (One-Stop Restocking Comparison)
                    </h3>
                    <p className="text-xs text-slate-500 mb-3">
                      If you prefer to buy your entire shopping list in a single market trip, here is how markets rank
                      today:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {restockPlan.market_basket_comparison.slice(0, 6).map((m, idx) => (
                        <div
                          key={m.market_id}
                          className={`p-3 rounded-xl border ${
                            idx === 0 ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              #{idx + 1} {m.market_name}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">{m.state}</span>
                          </div>
                          <p className="text-lg font-extrabold text-slate-900 mt-1">
                            {formatNGN(m.current_total_ngn)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {restockPlan.horizon_days}d Forecast: {formatNGN(m.forecast_total_ngn)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB C: COMMUNITY PRICE SUBMISSIONS & ANOMALY DETECTION */}
        {activeTab === 'submissions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Submission Form */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Crowdsourced Market Intelligence
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">Submit Local Market Price</h2>
                <p className="text-xs text-slate-500">
                  Every submission is screened in real time by <strong>Model 3 (Statistical Z-Score/IQR + Isolation Forest)</strong> before updating market comparisons.
                </p>
              </div>

              {/* Quick Demo Presets */}
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-1.5">
                <span className="text-[11px] font-bold uppercase text-slate-500 block">
                  Quick Sample Entries (Outlier Screening Demo):
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fillQuickTestSubmission('normal')}
                    className="text-xs font-semibold bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg py-1.5 px-2 transition"
                  >
                    Sample Verified Trader Quote
                  </button>
                  <button
                    type="button"
                    onClick={() => fillQuickTestSubmission('anomaly')}
                    className="text-xs font-semibold bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 rounded-lg py-1.5 px-2 transition"
                  >
                    Sample Unit-Mismatch Outlier
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmissionSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Market Location</label>
                  <select
                    value={subForm.market_id}
                    onChange={(e) => setSubForm({ ...subForm, market_id: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm"
                  >
                    {metadata?.markets
                      .filter((m) => m.market_id !== 'mkt_national')
                      .map((m) => (
                        <option key={m.market_id} value={m.market_id}>
                          {m.name} ({m.state})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Commodity</label>
                  <select
                    value={subForm.product_id}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const defU = metadata?.commodities[pid]?.default_retail_unit || '1 kg';
                      setSubForm({ ...subForm, product_id: pid, unit_name: defU });
                    }}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm"
                  >
                    {metadata &&
                      Object.values(metadata.commodities).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Unit / Quantity</label>
                    <select
                      value={subForm.unit_name}
                      onChange={(e) => setSubForm({ ...subForm, unit_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs sm:text-sm"
                    >
                      {(metadata?.commodities[subForm.product_id]?.units || []).map((u) => (
                        <option key={u.unit_name} value={u.unit_name}>
                          {u.unit_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Observed Price (NGN)</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 210000"
                      value={subForm.submitted_price_ngn}
                      onChange={(e) => setSubForm({ ...subForm, submitted_price_ngn: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Your Shop / Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Alhaji Musa Stores"
                      value={subForm.reporter_name}
                      onChange={(e) => setSubForm({ ...subForm, reporter_name: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reporter Role</label>
                    <select
                      value={subForm.reporter_role}
                      onChange={(e) => setSubForm({ ...subForm, reporter_role: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs sm:text-sm"
                    >
                      <option value="Retailer">Retailer / Shop Owner</option>
                      <option value="Wholesaler">Market Wholesaler</option>
                      <option value="Market Agent">Market Association Agent</option>
                      <option value="Consumer">Household Consumer</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-bold text-sm transition shadow-sm"
                >
                  {submitting ? 'Running Statistical Verification...' : 'Verify & Publish Market Quote'}
                </button>
              </form>

              {/* Real-Time AI Validation Result Banner */}
              {subFeedback && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                    subFeedback.submission.is_anomaly
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {subFeedback.submission.is_anomaly ? (
                      <>
                        <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                        <span>Flagged as Suspicious Outlier ({subFeedback.submission.submission_code})</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span>Verified & Added to Live Comparisons ({subFeedback.submission.submission_code})</span>
                      </>
                    )}
                  </div>
                  <p className="leading-relaxed">{subFeedback.submission.anomaly_reason}</p>
                  <div className="pt-1 flex items-center justify-between text-[11px] opacity-80">
                    <span>Expected Unit Benchmark: {formatNGN(subFeedback.submission.expected_unit_benchmark_ngn)}</span>
                    <span>Robust Z-Score: {subFeedback.submission.robust_z_score}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right 2 Columns: Live Crowdsourced Submissions Feed */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Live Community Price Submissions & Verification Log
                  </h3>
                  <p className="text-xs text-slate-500">
                    Showing recent crowdsourced prices across Nigerian markets with automated outlier screening
                  </p>
                </div>
              </div>

              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase">
                    <th className="py-2 px-2">Date & ID</th>
                    <th className="py-2 px-2">Market & State</th>
                    <th className="py-2 px-2">Commodity & Unit</th>
                    <th className="py-2 px-2 text-right">Submitted Price</th>
                    <th className="py-2 px-2 text-right">Benchmark</th>
                    <th className="py-2 px-2">Verification Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {submissionsList.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2">
                        <span className="font-bold text-slate-800">{s.observation_date}</span>
                        <span className="block text-[10px] text-slate-400">{s.submission_code}</span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-semibold text-slate-900">{s.market_name}</span>
                        <span className="block text-[11px] text-slate-500">
                          {s.state} • {s.reporter_name}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="font-bold text-slate-900">{s.product_name}</span>
                        <span className="block text-[11px] text-slate-500">{s.unit_name}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-extrabold text-slate-900">
                        {formatNGN(s.submitted_price_ngn)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-500">
                        {formatNGN(s.expected_unit_benchmark_ngn)}
                        <span
                          className={`block text-[10px] font-semibold ${
                            Math.abs(s.deviation_pct) > 20 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {s.deviation_pct >= 0 ? '+' : ''}
                          {s.deviation_pct}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        {s.verification_status === 'verified' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Verified
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShieldAlert className="w-3 h-3" /> Flagged Outlier
                            </span>
                            <span className="block text-[10px] text-rose-600 mt-0.5 max-w-xs">
                              {s.anomaly_reason}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>
            <strong>OjaPulse</strong> — Commodity Price & Restocking Intelligence for Nigerian Retailers, Traders & Households.
          </p>
          <p>
            Engineered by <strong>Korede (CozzyCodes)</strong> • Econometric & Tree-Ensemble Forecasting Pipeline
          </p>
        </div>
      </footer>
    </div>
  );
}
