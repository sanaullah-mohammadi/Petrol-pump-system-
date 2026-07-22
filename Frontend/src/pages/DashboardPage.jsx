import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";

import {
  FiTrendingUp,
  FiTrendingDown,
  FiDollarSign,
  FiDroplet,
  FiUsers,
  FiAlertTriangle,
  FiShoppingCart,
  FiCreditCard,
  FiActivity,
  FiZap,
  FiHome,
  FiWifi,
  FiTool,
  FiTruck,
  FiMonitor,
  FiShield,
  FiPackage,
  FiMoreHorizontal,
} from "react-icons/fi";

import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { format } from "date-fns";

import {
  salesApi,
  expensesApi,
  purchasesApi,
  tanksApi,
  customersApi,
  fuelTypesApi,
} from "@/services/api";

import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency } from "@/components/context/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const COLORS = [
  "hsl(183,76%,26%)",
  "hsl(22,85%,52%)",
  "hsl(280,60%,50%)",
  "hsl(142,72%,29%)",
];

// ── Same icon/color map as ExpensesPage ───────────────────────────────────────
const TYPE_META = {
  "Electricity":      { icon: FiZap,           color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/30" },
  "Salaries":         { icon: FiUsers,          color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  "Rent":             { icon: FiHome,           color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30" },
  "Internet":         { icon: FiWifi,           color: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-100 dark:bg-cyan-900/30" },
  "Internet & Phone": { icon: FiWifi,           color: "text-cyan-600 dark:text-cyan-400",    bg: "bg-cyan-100 dark:bg-cyan-900/30" },
  "Maintenance":      { icon: FiTool,           color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },
  "Transport":        { icon: FiTruck,          color: "text-green-600 dark:text-green-400",  bg: "bg-green-100 dark:bg-green-900/30" },
  "IT / Software":    { icon: FiMonitor,        color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/30" },
  "Security":         { icon: FiShield,         color: "text-red-600 dark:text-red-400",      bg: "bg-red-100 dark:bg-red-900/30" },
  "Office Supplies":  { icon: FiPackage,        color: "text-teal-600 dark:text-teal-400",    bg: "bg-teal-100 dark:bg-teal-900/30" },
  "Fuel":             { icon: FiDroplet,        color: "text-red-500",                         bg: "bg-red-100 dark:bg-red-900/30" },
  "Other":            { icon: FiMoreHorizontal, color: "text-muted-foreground",               bg: "bg-muted" },
};
function getExpTypeMeta(type) {
  return TYPE_META[type] ?? { icon: FiMoreHorizontal, color: "text-muted-foreground", bg: "bg-muted" };
}

function KPICard({ title, value, sub, icon: Icon, trend, trendLabel, color, accent }) {
  return (
    <Card className={`h-full border-l-4 ${accent ?? "border-l-primary"}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-pretty text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-balance text-2xl font-bold text-foreground">
              {value}
            </p>
            {sub && (
              <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
            )}
            {trendLabel && (
              <div
                className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${trend === "up" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
              >
                {trend === "up" ? (
                  <FiTrendingUp className="h-3 w-3" />
                ) : (
                  <FiTrendingDown className="h-3 w-3" />
                )}
                {trendLabel}
              </div>
            )}
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TankCard({ tank, fuelType }) {
  const pct = Math.round((tank.currentStock / tank.capacity) * 100);
  const isLow = tank.currentStock < tank.minimumLevel;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {tank.name}
          </span>
          {isLow && (
            <Badge variant="destructive" className="px-1.5 py-0 text-xs">
              Low Stock
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {fuelType?.name ?? "-"} • {tank.currentStock.toLocaleString()}L /{" "}
          {tank.capacity.toLocaleString()}L
        </p>
        <Progress
          value={pct}
          className={`mt-1.5 h-1.5 ${isLow ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
        />
      </div>
      <span
        className={`shrink-0 text-sm font-semibold ${isLow ? "text-destructive" : "text-foreground"}`}
      >
        {pct}%
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { t, lang } = useI18n();
  const { data: sales = [] } = useQuery({
    queryKey: ["sales"],
    queryFn: salesApi.getAll,
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: expensesApi.getAll,
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: purchasesApi.getAll,
  });
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks"],
    queryFn: tanksApi.getAll,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: customersApi.getAll,
  });
  const { data: fuelTypes = [] } = useQuery({
    queryKey: ["fuelTypes"],
    queryFn: fuelTypesApi.getAll,
  });

  // ── Today / Yesterday helpers ─────────────────────────────────────────────
  const yesterday = format(
    new Date(new Date().setDate(new Date().getDate() - 1)),
    "yyyy-MM-dd",
  );

  // ── Today's Revenue ───────────────────────────────────────────────────────
  const todaySales     = sales.filter((s) => s.date.startsWith(today));
  const todayRevenue   = todaySales.reduce((a, s) => a + s.totalAmount, 0);

  const yesterdaySales   = sales.filter((s) => s.date.startsWith(yesterday));
  const yesterdayRevenue = yesterdaySales.reduce((a, s) => a + s.totalAmount, 0);

  // ── Today's Expenses ──────────────────────────────────────────────────────
  const todayExpenseList = expenses.filter((e) => e.date === today);
  const todayExpenses    = todayExpenseList.reduce((a, e) => a + e.amount, 0);

  const yesterdayExpenses = expenses
    .filter((e) => e.date === yesterday)
    .reduce((a, e) => a + e.amount, 0);

  // ── Cost of fuel sold today ───────────────────────────────────────────────
  // For each today sale: find the purchase price per litre for that fuel type
  // (latest purchase cost), then multiply by litres sold.
  const latestCostByFuelType = purchases.reduce((acc, p) => {
    // keep the latest purchase per fuel type as the cost reference
    if (!acc[p.fuelTypeId] || p.purchaseDate > acc[p.fuelTypeId].purchaseDate) {
      acc[p.fuelTypeId] = p;
    }
    return acc;
  }, {});

  const todayFuelCost = todaySales.reduce((a, s) => {
    const purchase = latestCostByFuelType[s.fuelTypeId];
    const costPerLitre = purchase
      ? (purchase.totalAmount / (purchase.quantity || 1))
      : 0;
    return a + costPerLitre * (s.liters || 0);
  }, 0);

  const yesterdayFuelCost = yesterdaySales.reduce((a, s) => {
    const purchase = latestCostByFuelType[s.fuelTypeId];
    const costPerLitre = purchase
      ? (purchase.totalAmount / (purchase.quantity || 1))
      : 0;
    return a + costPerLitre * (s.liters || 0);
  }, 0);

  // ── Gross Profit = Revenue - Fuel Cost ────────────────────────────────────
  const todayGrossProfit    = todayRevenue   - todayFuelCost;
  const yesterdayGrossProfit = yesterdayRevenue - yesterdayFuelCost;

  // ── Net Profit = Gross Profit - Expenses ──────────────────────────────────
  const todayNetProfit    = todayGrossProfit - todayExpenses;
  const yesterdayNetProfit = yesterdayGrossProfit - yesterdayExpenses;

  // ── % change vs yesterday helper ─────────────────────────────────────────
  const pctVsYesterday = (today, yesterday) => {
    if (yesterday === 0) return today > 0 ? 100 : 0;
    return ((today - yesterday) / Math.abs(yesterday)) * 100;
  };

  const grossProfitPct = pctVsYesterday(todayGrossProfit, yesterdayGrossProfit);
  const netProfitPct   = pctVsYesterday(todayNetProfit,   yesterdayNetProfit);

  // ── All-time totals (for second row) ─────────────────────────────────────
  const totalFuelCost    = purchases.reduce((a, p) => a + p.totalAmount, 0);
  const totalRevenue     = sales.reduce((a, s) => a + s.totalAmount, 0);
  const totalExpensesSum = expenses.reduce((a, e) => a + e.amount, 0);
  const netProfit        = totalRevenue - totalFuelCost - totalExpensesSum;

  const creditCustomers = customers.filter((c) => c.type === "credit");
  const outstandingCredit = creditCustomers.reduce(
    (a, c) => a + c.creditBalance,
    0,
  );
  const lowTanks = tanks.filter((t) => t.currentStock < t.minimumLevel);

  // Last 7 days sales chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = format(d, "yyyy-MM-dd");
    const daySales   = sales.filter((s) => s.date.startsWith(dateStr));
    const dayExpense = expenses.filter((e) => e.date === dateStr);
    const rev = daySales.reduce((a, s) => a + s.totalAmount, 0);
    const exp = dayExpense.reduce((a, e) => a + e.amount, 0);
    return {
      date:     format(d, "d MMM"),
      revenue:  rev,
      expenses: exp,
      profit:   rev - exp,
    };
  });

  // Fuel sales by type
  const fuelSalesData = fuelTypes
    .map((ft) => {
      const ftSales = sales.filter((s) => s.fuelTypeId === ft.id);
      return {
        name: ft.name,
        liters: ftSales.reduce((a, s) => a + s.liters, 0),
        revenue: ftSales.reduce((a, s) => a + s.totalAmount, 0),
      };
    })
    .filter((d) => d.liters > 0);

  // Payment method breakdown — TODAY only
  const todayPayMethods = ["cash", "card", "credit", "bank_transfer"].map((m, i) => {
    const label =
      m === "cash"         ? (lang === "ps" ? "نقده"        : "Cash")
      : m === "card"       ? (lang === "ps" ? "کریډیټ کارت" : "Credit Card")
      : m === "credit"     ? (lang === "ps" ? "قرض"         : "Credit")
      :                      (lang === "ps" ? "د بانک لیږد" : "Bank Transfer");
    const value = todaySales
      .filter((s) => s.paymentMethod === m)
      .reduce((a, s) => a + s.totalAmount, 0);
    return { key: m, name: label, value, color: COLORS[i % COLORS.length] };
  }).filter((d) => d.value > 0);

  const todayPayTotal = todayPayMethods.reduce((a, d) => a + d.value, 0);

  // Payment method breakdown (all-time, kept for backward compat)
  const payMethods = ["cash", "card", "credit"]
    .map((m) => ({
      name: m.charAt(0).toUpperCase() + m.slice(1),
      value: sales
        .filter((s) => s.paymentMethod === m)
        .reduce((a, s) => a + s.totalAmount, 0),
    }))
    .filter((d) => d.value > 0);

  // ── Fuel Type Performance table ──────────────────────────────────────────
  const [perfPeriod,   setPerfPeriod]   = useState("today");   // today|week|month|year|custom
  const [perfFrom,     setPerfFrom]     = useState("");
  const [perfTo,       setPerfTo]       = useState("");
  const [perfFuelType, setPerfFuelType] = useState("all");

  const perfSales = useMemo(() => {
    const now   = new Date();
    let fromStr = "";
    let toStr   = today;

    if (perfPeriod === "today") {
      fromStr = today;
    } else if (perfPeriod === "week") {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      fromStr = format(d, "yyyy-MM-dd");
    } else if (perfPeriod === "month") {
      const d = new Date(now); d.setDate(1);
      fromStr = format(d, "yyyy-MM-dd");
    } else if (perfPeriod === "year") {
      fromStr = format(new Date(now.getFullYear(), 0, 1), "yyyy-MM-dd");
    } else {
      fromStr = perfFrom;
      toStr   = perfTo || today;
    }

    return sales.filter((s) => {
      const d = String(s.date).substring(0, 10);
      if (fromStr && d < fromStr) return false;
      if (toStr   && d > toStr)   return false;
      return true;
    });
  }, [sales, perfPeriod, perfFrom, perfTo, today]);

  // expenses inside the same period
  const perfExpensesTotal = useMemo(() => {
    const now = new Date();
    let fromStr = ""; let toStr = today;
    if (perfPeriod === "today")      { fromStr = today; }
    else if (perfPeriod === "week")  { const d = new Date(now); d.setDate(d.getDate()-6); fromStr = format(d,"yyyy-MM-dd"); }
    else if (perfPeriod === "month") { const d = new Date(now); d.setDate(1); fromStr = format(d,"yyyy-MM-dd"); }
    else if (perfPeriod === "year")  { fromStr = format(new Date(now.getFullYear(),0,1),"yyyy-MM-dd"); }
    else { fromStr = perfFrom; toStr = perfTo || today; }
    return expenses
      .filter((e) => { const d = String(e.date).substring(0,10); return (!fromStr||d>=fromStr)&&(!toStr||d<=toStr); })
      .reduce((a,e) => a + (e.amount ?? 0), 0);
  }, [expenses, perfPeriod, perfFrom, perfTo, today]);

  const perfRows = useMemo(() => {
    const activeFuelTypes = perfFuelType === "all"
      ? fuelTypes
      : fuelTypes.filter((ft) => ft.id === perfFuelType);

    const totalRevenue = perfSales.reduce((a,s) => a + (s.totalAmount ?? 0), 0);

    return activeFuelTypes.map((ft) => {
      const ftSales     = perfSales.filter((s) => s.fuelTypeId === ft.id);
      const litres      = ftSales.reduce((a,s) => a + (s.liters      ?? 0), 0);
      const revenue     = ftSales.reduce((a,s) => a + (s.totalAmount ?? 0), 0);
      const p           = latestCostByFuelType[ft.id];
      const costPerL    = p ? (p.totalAmount / (p.quantity || 1)) : 0;
      const fuelCost    = costPerL * litres;
      const grossProfit = revenue - fuelCost;
      const expShare    = totalRevenue > 0 ? (revenue / totalRevenue) * perfExpensesTotal : 0;
      const netProfit   = grossProfit - expShare;
      const margin      = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      return { ft, litres, revenue, fuelCost, grossProfit, netProfit, margin };
    }).filter((r) => r.litres > 0 || r.revenue > 0);
  }, [perfSales, fuelTypes, perfFuelType, latestCostByFuelType, perfExpensesTotal]);

  const perfTotals = useMemo(() => perfRows.reduce(
    (acc, r) => ({
      litres:      acc.litres      + r.litres,
      revenue:     acc.revenue     + r.revenue,
      fuelCost:    acc.fuelCost    + r.fuelCost,
      grossProfit: acc.grossProfit + r.grossProfit,
      netProfit:   acc.netProfit   + r.netProfit,
    }),
    { litres: 0, revenue: 0, fuelCost: 0, grossProfit: 0, netProfit: 0 },
  ), [perfRows]);

  const perfTotalMargin = perfTotals.revenue > 0
    ? (perfTotals.netProfit / perfTotals.revenue) * 100 : 0;

  const PERIOD_LABELS = [
    { key: "today",  label: lang === "ps" ? "نن"     : "Today"   },
    { key: "week",   label: lang === "ps" ? "اونۍ"  : "Weekly"  },
    { key: "month",  label: lang === "ps" ? "میاشت" : "Monthly" },
    { key: "year",   label: lang === "ps" ? "کال"   : "Yearly"  },
    { key: "custom", label: lang === "ps" ? "ټاکلی" : "Custom"  },
  ];

  return (
    <AppLayout title={t("dashboard")}>
      <div className="space-y-6">
        {/* Alerts */}
        {lowTanks.length > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
            <FiAlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">
              {t("lowStockAlert")}: {lowTanks.map((tnk) => tnk.name).join(", ")}{" "}
              {t("needRestocking")}
            </p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* 1. Today's Revenue */}
          <KPICard
            title={t("todayRevenue")}
            value={fmtCurrency(todayRevenue, lang)}
            sub={`${todaySales.length} ${t("transactions")}`}
            icon={FiDollarSign}
            trend="up"
            trendLabel={`↑ ${todaySales.length} ${t("salesToday")}`}
            color="bg-primary/10 text-primary"
            accent="border-l-primary"
          />

          {/* 2. Today's Gross Profit = Revenue - Fuel Cost */}
          <KPICard
            title={lang === "ps" ? "د نن ورځ ناخالص ګټه" : "Today's Gross Profit"}
            value={fmtCurrency(todayGrossProfit, lang)}
            sub={lang === "ps"
              ? `د تیلو لګښت: ${fmtCurrency(todayFuelCost, lang)}`
              : `Fuel cost: ${fmtCurrency(todayFuelCost, lang)}`}
            icon={FiTrendingUp}
            trend={grossProfitPct >= 0 ? "up" : "down"}
            trendLabel={`${grossProfitPct >= 0 ? "↑" : "↓"} ${Math.abs(grossProfitPct).toFixed(2)}% ${t("vsYesterday")}`}
            color="bg-green-500/10 text-green-600 dark:text-green-400"
            accent="border-l-green-500"
          />

          {/* 3. Today's Expenses */}
          <KPICard
            title={t("todayExpenses")}
            value={fmtCurrency(todayExpenses, lang)}
            sub={`${todayExpenseList.length} ${lang === "ps" ? "لګښتونه" : "expenses"}`}
            icon={FiDollarSign}
            color="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
            accent="border-l-yellow-500"
          />

          {/* 4. Today's Net Profit = Gross Profit - Expenses */}
          <KPICard
            title={lang === "ps" ? "د نن ورځ خالص ګټه" : "Today's Net Profit"}
            value={fmtCurrency(todayNetProfit, lang)}
            sub={lang === "ps"
              ? `ناخالص: ${fmtCurrency(todayGrossProfit, lang)} - لګښت: ${fmtCurrency(todayExpenses, lang)}`
              : `Gross ${fmtCurrency(todayGrossProfit, lang)} - Exp. ${fmtCurrency(todayExpenses, lang)}`}
            icon={FiActivity}
            trend={netProfitPct >= 0 ? "up" : "down"}
            trendLabel={`${netProfitPct >= 0 ? "↑" : "↓"} ${Math.abs(netProfitPct).toFixed(2)}% ${t("vsYesterday")}`}
            color="bg-purple-500/10 text-purple-600 dark:text-purple-400"
            accent="border-l-purple-500"
          />
        </div>

        {/* Second row KPIs */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPICard
            title={t("totalSales")}
            value={fmtCurrency(totalRevenue, lang)}
            sub={`${sales.length} ${t("transactions")}`}
            icon={FiShoppingCart}
            color="bg-primary/10 text-primary"
            accent="border-l-primary"
          />
          <KPICard
            title={t("totalFuelSold")}
            value={`${sales.reduce((a, s) => a + s.liters, 0).toLocaleString()}L`}
            icon={FiDroplet}
            color="bg-orange-500/10 text-orange-600 dark:text-orange-400"
            accent="border-l-orange-500"
          />
          <KPICard
            title={t("creditCustomers")}
            value={`${creditCustomers.length}`}
            sub={`${customers.filter((c) => c.status === "active").length} active`}
            icon={FiUsers}
            color="bg-blue-500/10 text-blue-600 dark:text-blue-400"
            accent="border-l-blue-500"
          />
          <KPICard
            title={t("outstandingCredit")}
            value={fmtCurrency(outstandingCredit, lang)}
            icon={FiCreditCard}
            trend="down"
            trendLabel={t("outstandingCredit")}
            color="bg-red-500/10 text-red-600 dark:text-red-400"
            accent="border-l-red-500"
          />
        </div>

        {/* Charts Row — Recent Expenses (Today) + Payment Methods side by side */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Recent Expenses (Today) — left, 2/3 width */}
          {(() => {
            const recentExpenses = expenses.filter((e) => e.date === today);
            const recentTotal = recentExpenses.reduce((a, e) => a + (e.amount ?? 0), 0);
            return (
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      {lang === "ps" ? "د نن ورځ لګښتونه" : "Recent Expenses (Today)"}
                    </CardTitle>
                    <Link
                      to="/expenses"
                      className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
                    >
                      {lang === "ps" ? "ټول وګورئ" : "View All"}
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {recentExpenses.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                      <FiDollarSign className="h-7 w-7 opacity-30" />
                      <p className="text-sm">
                        {lang === "ps" ? "د نن ورځ لګښت نشته" : "No expenses recorded today"}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                              {lang === "ps" ? "لګښت" : "Expense"}
                            </th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                              {lang === "ps" ? "ډول" : "Category"}
                            </th>
                            <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                              {lang === "ps" ? "مبلغ (AFN)" : "Amount (AFN)"}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentExpenses.map((exp) => {
                            const meta = getExpTypeMeta(exp.type);
                            const Icon = meta.icon;
                            return (
                              <tr key={exp.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.bg}`}>
                                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                    </div>
                                    <span className="text-sm">{exp.description || exp.type}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-sm text-muted-foreground">{exp.type}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-semibold">
                                  {(exp.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/20">
                            <td colSpan={2} className="px-4 py-2.5 text-sm font-bold">
                              {lang === "ps" ? "ټول" : "Total"}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm font-bold">
                              {recentTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Payment Methods (Today) — right, 1/3 width */}
          <Card className="h-full md:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {lang === "ps" ? "د تادیې میتودونه (نن)" : "Payment Methods (Today)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {todayPayMethods.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                  {t("noData")}
                </div>
              ) : (
                <div className="flex items-center gap-3" style={{ minHeight: 200 }}>
                  <div className="shrink-0" style={{ width: 130, height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={todayPayMethods}
                          cx="50%" cy="50%"
                          innerRadius={44} outerRadius={64}
                          dataKey="value" nameKey="name"
                          paddingAngle={2} strokeWidth={0}
                        >
                          {todayPayMethods.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => [fmtCurrency(v, lang), ""]}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
                    {todayPayMethods.map((entry) => {
                      const pct = todayPayTotal > 0 ? ((entry.value / todayPayTotal) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={entry.key} className="flex items-start gap-2">
                          <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: entry.color }} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-tight text-foreground">
                              {entry.name}
                              <span className="ml-1.5 font-normal text-muted-foreground">{pct}%</span>
                            </p>
                            <p className="text-xs leading-tight text-muted-foreground">{fmtCurrency(entry.value, lang)}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div className="mt-0.5 border-t border-border pt-1.5">
                      <p className="text-xs font-semibold text-foreground">
                        {lang === "ps" ? "ټول:" : "Total:"}{"  "}
                        <span className="text-primary">{fmtCurrency(todayPayTotal, lang)}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

          {/* Left col-span-2: Fuel Sales by Type + Revenue vs Expenses stacked */}
          <div className="flex flex-col gap-4 md:col-span-2">

            {/* Fuel Sales by Type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  {t("fuelSalesByType")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={fuelSalesData}
                      margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                      barSize={40}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        axisLine={false}
                        tickLine={false}
                        domain={[0, "auto"]}
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(v) => [`${v.toLocaleString()} L`, lang === "ps" ? "لیتر" : "Litres"]}
                      />
                      <Bar
                        dataKey="liters"
                        fill="hsl(183,76%,26%)"
                        radius={[4, 4, 0, 0]}
                        name={t("liters")}
                      >
                        {fuelSalesData.map((entry, i) => (
                          <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Revenue vs Expenses (Last 7 Days) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  {t("revenueVsExpenses")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="w-full min-w-0 overflow-hidden" style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={last7Days}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      barCategoryGap="30%"
                      barGap={4}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                        formatter={(v, name) => [v.toLocaleString(), name]}
                      />
                      <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="revenue"  name={lang === "ps" ? "عاید"     : "Revenue"}    fill="hsl(221,83%,63%)" radius={[3,3,0,0]} />
                      <Bar dataKey="expenses" name={lang === "ps" ? "لګښتونه" : "Expenses"}   fill="hsl(0,84%,60%)"   radius={[3,3,0,0]} />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        name={lang === "ps" ? "خالص ګټه" : "Net Profit"}
                        stroke="hsl(142,71%,45%)"
                        strokeWidth={2}
                        dot={{ fill: "hsl(142,71%,45%)", r: 4, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

          </div>{/* end left col */}

          {/* Tank Status */}
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  {t("tankLevels")}
                </CardTitle>
                {lowTanks.length > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {lowTanks.length} Low
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1 divide-y divide-border">
                {tanks.map((tank) => (
                  <TankCard
                    key={tank.id}
                    tank={tank}
                    fuelType={fuelTypes.find((f) => f.id === tank.fuelTypeId)}
                  />
                ))}
                {tanks.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("noData")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Fuel Type Performance ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            {/* Title row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold">
                {lang === "ps" ? "د تیلو ډول فعالیت" : "Fuel Type Performance"}
                <span className="ml-2 font-normal text-muted-foreground">
                  ({PERIOD_LABELS.find((p) => p.key === perfPeriod)?.label})
                </span>
              </CardTitle>

              {/* Fuel type filter */}
              <Select value={perfFuelType} onValueChange={setPerfFuelType}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="end"
                  sideOffset={4}
                  className="min-w-[160px]"
                >
                  <SelectItem value="all" textValue={lang === "ps" ? "ټول تیلو ډولونه" : "All Fuel Types"}>
                    <span className="whitespace-nowrap">
                      {lang === "ps" ? "ټول تیلو ډولونه" : "All Fuel Types"}
                    </span>
                  </SelectItem>
                  {fuelTypes.map((ft) => (
                    <SelectItem key={ft.id} value={ft.id} textValue={ft.name}>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                        {ft.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Period toggle + custom date range */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Period buttons */}
              <div className="flex rounded-lg border border-input bg-muted/40 p-0.5 gap-0.5">
                {PERIOD_LABELS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPerfPeriod(p.key)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      perfPeriod === p.key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom date pickers — shown only when custom is selected */}
              {perfPeriod === "custom" && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {lang === "ps" ? "له" : "From"}
                    </span>
                    <Input
                      type="date"
                      value={perfFrom}
                      onChange={(e) => setPerfFrom(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {lang === "ps" ? "تر" : "To"}
                    </span>
                    <Input
                      type="date"
                      value={perfTo}
                      onChange={(e) => setPerfTo(e.target.value)}
                      className="h-8 w-36 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {perfRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <FiDroplet className="h-7 w-7 opacity-30" />
                <p className="text-sm">{t("noData")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {[
                        lang === "ps" ? "د تیلو ډول"    : "Fuel Type",
                        lang === "ps" ? "پلور شوي لیتره" : "Litres Sold",
                        lang === "ps" ? "عاید (AFN)"     : "Revenue (AFN)",
                        lang === "ps" ? "د تیلو لګښت"   : "Fuel Cost (AFN)",
                        lang === "ps" ? "ناخالص ګټه"    : "Gross Profit (AFN)",
                        lang === "ps" ? "خالص ګټه"      : "Net Profit (AFN)",
                        lang === "ps" ? "حاشیه"         : "Margin",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground first:pl-4"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {perfRows.map(({ ft, litres, revenue, fuelCost, grossProfit, netProfit, margin }) => (
                      <tr
                        key={ft.id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                      >
                        {/* Fuel type */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ background: ft.color ?? "#94a3b8" }}
                            />
                            <span className="text-sm font-medium">{ft.name}</span>
                          </div>
                        </td>
                        {/* Litres */}
                        <td className="px-4 py-3 text-sm">
                          {litres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                        </td>
                        {/* Revenue */}
                        <td className="px-4 py-3 text-sm font-medium">
                          {fmtCurrency(revenue, lang)}
                        </td>
                        {/* Fuel Cost */}
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {fmtCurrency(fuelCost, lang)}
                        </td>
                        {/* Gross Profit */}
                        <td className={`px-4 py-3 text-sm font-medium ${grossProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
                          {fmtCurrency(grossProfit, lang)}
                        </td>
                        {/* Net Profit */}
                        <td className={`px-4 py-3 text-sm font-medium ${netProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
                          {fmtCurrency(netProfit, lang)}
                        </td>
                        {/* Margin */}
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            margin >= 15
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : margin >= 5
                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}>
                            {margin.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Totals row */}
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/40">
                      <td className="px-4 py-3 text-sm font-bold">
                        {lang === "ps" ? "ټول" : "Total"}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold">
                        {perfTotals.litres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                      </td>
                      <td className="px-4 py-3 text-sm font-bold">
                        {fmtCurrency(perfTotals.revenue, lang)}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-muted-foreground">
                        {fmtCurrency(perfTotals.fuelCost, lang)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-bold ${perfTotals.grossProfit >= 0 ? "" : "text-destructive"}`}>
                        {fmtCurrency(perfTotals.grossProfit, lang)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-bold ${perfTotals.netProfit >= 0 ? "" : "text-destructive"}`}>
                        {fmtCurrency(perfTotals.netProfit, lang)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          perfTotalMargin >= 15
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : perfTotalMargin >= 5
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {perfTotalMargin.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {t("recentSales")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground">
                      {t("transactionId")}
                    </th>
                    <th className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground">
                      {t("customer")}
                    </th>
                    <th className="py-2 pr-4 text-left text-xs font-medium text-muted-foreground">
                      {t("fuel")}
                    </th>
                    <th className="py-2 pr-4 text-right text-xs font-medium text-muted-foreground">
                      {t("liters")}
                    </th>
                    <th className="py-2 pr-4 text-right text-xs font-medium text-muted-foreground">
                      {t("amount")}
                    </th>
                    <th className="py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("method")}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {[...sales]
                    .sort(
                      (a, b) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime(),
                    )
                    .slice(0, 6)
                    .map((sale) => {
                      const ft = fuelTypes.find(
                        (f) => f.id === sale.fuelTypeId,
                      );
                      return (
                        <tr
                          key={sale.id}
                          className="border-b border-border transition-colors last:border-0 hover:bg-muted/30"
                        >
                          <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                            {sale.transactionId}
                          </td>
                          <td className="py-2 pr-4 text-sm">
                            {sale.customerName}
                          </td>
                          <td className="py-2 pr-4">
                            <span className="inline-flex items-center gap-1 text-xs">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: ft?.color }}
                              />
                              {ft?.name}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right text-sm">
                            {sale.liters}L
                          </td>
                          <td className="py-2 pr-4 text-right text-sm font-semibold">
                            {fmtCurrency(sale.totalAmount, lang)}
                          </td>
                          <td className="py-2 text-xs capitalize">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                              {sale.paymentMethod}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Receipt(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </svg>
  );
}
