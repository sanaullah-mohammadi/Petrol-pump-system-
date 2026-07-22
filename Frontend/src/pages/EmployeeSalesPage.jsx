/**
 * EmployeeSalesPage — Per-employee daily sales tracking.
 *
 * Roles:
 *  Admin / Manager → see all employees, pick any employee, full history
 *  Operator        → sees only their own sales (My Sales view)
 *
 * Features:
 *  • Employee selector (admin/manager only)
 *  • Date range filter (from / to)
 *  • Summary cards: total transactions, total cash, total credit, total liters
 *  • Daily breakdown table: date → transactions, liters, cash, credit, total
 *  • Transaction drill-down dialog per day
 *  • Full i18n Pashto / English
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { FiChevronDown, FiChevronRight, FiSearch, FiUsers, FiHash, FiTrendingUp, FiCreditCard, FiDroplet } from "react-icons/fi";
import { MdReceiptLong } from "react-icons/md";

import { TablePagination } from "@/components/ui/pagination";
import { useAppSelector } from "@/components/context/hooks";
import { salesApi, employeesApi, fuelTypesApi } from "@/services/api";
import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency } from "@/components/context/i18n";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Small stat card ───────────────────────────────────────────────────────────
function StatCard({ label, value, color, bg, accent, icon: Icon }) {
  return (
    <Card className={`h-full border-l-4 ${accent ?? "border-l-primary"}`}>
      <CardContent className="px-5 pb-5 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-bold leading-tight ${color ?? "text-foreground"}`}>{value}</p>
          </div>
          {Icon && (
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10 ${bg ?? "bg-primary/10"}`}>
              <Icon className={`h-4 w-4 md:h-5 md:w-5 ${color ?? "text-primary"}`} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function EmployeeSalesPage() {
  const { user } = useAppSelector((s) => s.auth);
  const { t, lang } = useI18n();

  const isAdmin   = user?.role === "admin";
  const isManager = user?.role === "manager";
  const canSeeAll = isAdmin || isManager;

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedEmpId, setSelectedEmpId] = useState("all");
  const [dateFrom, setDateFrom]           = useState("");
  const [dateTo,   setDateTo]             = useState("");
  const [expanded, setExpanded]           = useState(null);
  const [drillDialog, setDrillDialog]     = useState({ open: false, rows: [], date: "" });
  const [page, setPage]                   = useState(1);
  const PAGE_SIZE = 10;

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: sales     = [], isLoading } = useQuery({ queryKey: ["sales"],     queryFn: salesApi.getAll });
  const { data: employees = [] }            = useQuery({ queryKey: ["employees"], queryFn: employeesApi.getAll });
  const { data: fuelTypes = [] }            = useQuery({ queryKey: ["fuelTypes"], queryFn: fuelTypesApi.getAll });

  // ── Resolve current employee id from logged-in user's employeeId ──────────
  const myEmployee = employees.find((e) => e.employeeId === user?.employeeId);

  // Active employees list for selector
  const activeEmployees = employees.filter((e) => e.status === "active");

  // ── Filtered sales ────────────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // Role filter: operator sees only their own
      if (!canSeeAll) {
        if (!myEmployee || s.employeeId !== myEmployee.id) return false;
      } else if (selectedEmpId !== "all") {
        if (s.employeeId !== selectedEmpId) return false;
      }

      // Date range filter
      if (dateFrom || dateTo) {
        const saleDate = new Date(s.date);
        if (dateFrom && saleDate < startOfDay(parseISO(dateFrom))) return false;
        if (dateTo   && saleDate > endOfDay(parseISO(dateTo)))     return false;
      }

      return true;
    });
  }, [sales, selectedEmpId, dateFrom, dateTo, canSeeAll, myEmployee]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalAmount = filteredSales.reduce((s, x) => s + (x.totalAmount ?? 0), 0);
  const totalCash   = filteredSales
    .filter((x) => x.customerType === "cash")
    .reduce((s, x) => s + (x.totalAmount ?? 0), 0);
  const totalCredit = filteredSales
    .filter((x) => x.customerType === "credit")
    .reduce((s, x) => s + (x.totalAmount ?? 0), 0);
  const totalLiters = filteredSales.reduce((s, x) => s + (x.liters ?? 0), 0);

  // ── Group by date ─────────────────────────────────────────────────────────
  const byDate = useMemo(() => {
    const map = {};
    for (const s of filteredSales) {
      const d = s.date ? format(new Date(s.date), "yyyy-MM-dd") : "—";
      if (!map[d]) map[d] = [];
      map[d].push(s);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredSales]);

  useEffect(() => { setPage(1); }, [filteredSales]);

  const totalDayPages = Math.max(1, Math.ceil(byDate.length / PAGE_SIZE));
  const safeDayPage   = Math.min(page, totalDayPages);
  const paginatedDays = byDate.slice((safeDayPage - 1) * PAGE_SIZE, safeDayPage * PAGE_SIZE);

  // ── Employee lookup ───────────────────────────────────────────────────────
  const empById = Object.fromEntries(employees.map((e) => [e.id, e]));
  const ftById  = Object.fromEntries(fuelTypes.map((f) => [f.id, f]));

  return (
    <AppLayout title={canSeeAll ? t("employeeSales") : t("mySales")}>
      <div className="space-y-5">

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4 pt-5">

            {/* ── Desktop: everything in one row ──────────────────────── */}
            <div className="hidden md:flex md:flex-wrap md:items-end md:gap-3">
              {canSeeAll && (
                <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("employeeName")}</label>
                  <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={lang === "ps" ? "ټول کارمندان" : "All Employees"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" textValue={lang === "ps" ? "ټول کارمندان" : "All Employees"}>
                        {lang === "ps" ? "ټول کارمندان" : "All Employees"}
                      </SelectItem>
                      {activeEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id} textValue={e.fullName}>
                          {e.fullName}
                          <span className="ms-1 text-xs capitalize text-muted-foreground">({e.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{lang === "ps" ? "له" : "From"}</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-38 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">{lang === "ps" ? "تر" : "To"}</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-38 text-sm" />
              </div>
              {(dateFrom || dateTo || selectedEmpId !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 self-end"
                  onClick={() => { setDateFrom(""); setDateTo(""); setSelectedEmpId("all"); }}>
                  {lang === "ps" ? "پاکول" : "Clear"}
                </Button>
              )}
            </div>

            {/* ── Mobile: line 1 = employee selector, line 2 = date range ── */}
            <div className="flex flex-col gap-2 md:hidden">

              {/* Row 1: employee selector (full width) */}
              {canSeeAll && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("employeeName")}</label>
                  <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder={lang === "ps" ? "ټول کارمندان" : "All Employees"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" textValue={lang === "ps" ? "ټول کارمندان" : "All Employees"}>
                        {lang === "ps" ? "ټول کارمندان" : "All Employees"}
                      </SelectItem>
                      {activeEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id} textValue={e.fullName}>
                          {e.fullName}
                          <span className="ms-1 text-xs capitalize text-muted-foreground">({e.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Row 2: From / To dates side by side */}
              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{lang === "ps" ? "له" : "From"}</label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-full text-sm" />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{lang === "ps" ? "تر" : "To"}</label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-full text-sm" />
                </div>
                {(dateFrom || dateTo || selectedEmpId !== "all") && (
                  <Button variant="ghost" size="sm" className="h-8 shrink-0 self-end"
                    onClick={() => { setDateFrom(""); setDateTo(""); setSelectedEmpId("all"); }}>
                    {lang === "ps" ? "پاکول" : "Clear"}
                  </Button>
                )}
              </div>

            </div>

          </CardContent>
        </Card>

        {/* ── Summary stat cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("totalTransactions")} value={filteredSales.length} accent="border-l-primary" icon={FiHash} bg="bg-primary/10" />
          <StatCard label={t("totalCash")}   value={fmtCurrency(totalCash,   lang)} color="text-green-600 dark:text-green-400" accent="border-l-green-500" icon={FiTrendingUp} bg="bg-green-500/10" />
          <StatCard label={t("totalCredit")} value={fmtCurrency(totalCredit, lang)} color="text-blue-600 dark:text-blue-400"  accent="border-l-blue-500"  icon={FiCreditCard} bg="bg-blue-500/10" />
          <StatCard label={t("totalLitersSold")} value={`${totalLiters.toLocaleString()} L`} color="text-orange-600 dark:text-orange-400" accent="border-l-orange-500" icon={FiDroplet} bg="bg-orange-500/10" />
        </div>

        {/* ── Daily breakdown table ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MdReceiptLong className="h-4 w-4 text-primary" />
              {t("dailySalesSummary")}
              <Badge variant="secondary" className="font-mono text-xs">{byDate.length}</Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1,2,3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
              </div>
            ) : byDate.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <FiUsers className="h-8 w-8 opacity-30" />
                <p className="text-sm">{t("noSalesFound")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        t("date"),
                        t("totalTransactions"),
                        `${t("liters")} (L)`,
                        t("totalCash"),
                        t("totalCredit"),
                        t("total"),
                        ...(canSeeAll && selectedEmpId === "all" ? [t("employeeName")] : []),
                        "",
                      ].map((h, i) => (
                        <th key={i}
                          className="py-2 pr-4 text-start text-xs font-medium text-muted-foreground first:ps-4">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDays.map(([date, rows]) => {
                      const dayTotal   = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
                      const dayCash    = rows.filter((r) => r.customerType === "cash")  .reduce((s, r) => s + (r.totalAmount ?? 0), 0);
                      const dayCredit  = rows.filter((r) => r.customerType === "credit").reduce((s, r) => s + (r.totalAmount ?? 0), 0);
                      const dayLiters  = rows.reduce((s, r) => s + (r.liters ?? 0), 0);
                      // Employee names for this day (when "all employees" selected)
                      const empNames = [...new Set(rows.map((r) => empById[r.employeeId]?.fullName ?? "—"))].join(", ");

                      return (
                        <tr key={date}
                          onClick={() => setDrillDialog({ open: true, rows, date })}
                          className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          <td className="py-3 pr-4 ps-4 text-sm font-medium">{date}</td>
                          <td className="py-3 pr-4">
                            <Badge variant="secondary" className="font-mono">{rows.length}</Badge>
                          </td>
                          <td className="py-3 pr-4 text-sm">{dayLiters.toLocaleString()} L</td>
                          <td className="py-3 pr-4 text-sm font-medium text-green-600 dark:text-green-400">
                            {fmtCurrency(dayCash, lang)}
                          </td>
                          <td className="py-3 pr-4 text-sm font-medium text-blue-600 dark:text-blue-400">
                            {fmtCurrency(dayCredit, lang)}
                          </td>
                          <td className="py-3 pr-4 text-sm font-bold">{fmtCurrency(dayTotal, lang)}</td>
                          {canSeeAll && selectedEmpId === "all" && (
                            <td className="py-3 pr-4 max-w-[160px] truncate text-xs text-muted-foreground">{empNames}</td>
                          )}
                          <td className="py-3 pe-3">
                            <Button variant="ghost" size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              onClick={(e) => { e.stopPropagation(); setDrillDialog({ open: true, rows, date }); }}>
                              {lang === "ps" ? "لیدل" : "View"}
                              <FiChevronRight className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination page={safeDayPage} totalPages={totalDayPages} total={byDate.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </CardContent>
        </Card>
      </div>

      {/* ── Transaction drill-down dialog ─────────────────────────────────── */}
      <Dialog open={drillDialog.open} onOpenChange={(open) => setDrillDialog({ open, rows: [], date: "" })}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MdReceiptLong className="h-4 w-4" />
              {lang === "ps" ? "د معاملو تفصیل" : "Transaction Detail"} — {drillDialog.date}
            </DialogTitle>
          </DialogHeader>

          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  {[
                    t("transactionId"), t("pumpNumber"), t("fuel"),
                    t("customer"), `${t("liters")} (L)`, t("pricePerLiter"),
                    t("total"), t("method"), t("employee"),
                  ].map((h) => (
                    <th key={h} className="py-2 pr-4 text-start font-medium first:ps-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drillDialog.rows.map((s) => {
                  const ft  = ftById[s.fuelTypeId];
                  const emp = empById[s.employeeId];
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 ps-3 font-mono text-xs text-muted-foreground">{s.transactionId}</td>
                      <td className="py-2 pr-4">{s.pumpNumber}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: ft?.color ?? "#94a3b8" }} />
                          {ft?.name ?? "—"}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div>
                          <p>{s.customerName}</p>
                          <span className={`rounded-full px-1.5 py-px text-xs ${s.customerType === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-muted text-muted-foreground"}`}>
                            {s.customerType}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4">{s.liters} L</td>
                      <td className="py-2 pr-4">{fmtCurrency(s.pricePerLiter, lang, 3)}</td>
                      <td className="py-2 pr-4 font-semibold">{fmtCurrency(s.totalAmount, lang)}</td>
                      <td className="py-2 pr-4 capitalize text-muted-foreground">{s.paymentMethod}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{emp?.fullName ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30 font-semibold">
                  <td colSpan={4} className="py-2 ps-3 text-xs text-muted-foreground">
                    {t("total")} ({drillDialog.rows.length} {lang === "ps" ? "معاملې" : "transactions"})
                  </td>
                  <td className="py-2 pr-4">{drillDialog.rows.reduce((s,r)=>s+(r.liters??0),0)} L</td>
                  <td></td>
                  <td className="py-2 pr-4">{fmtCurrency(drillDialog.rows.reduce((s,r)=>s+(r.totalAmount??0),0), lang)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
