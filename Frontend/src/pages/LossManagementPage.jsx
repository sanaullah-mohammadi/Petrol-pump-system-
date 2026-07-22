import { useState, useMemo, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { z } from "zod";

import toast from "react-hot-toast";

import {
  FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiSearch,
  FiDroplet, FiTool, FiTag, FiMoreHorizontal, FiShieldOff,
} from "react-icons/fi";
import { TablePagination } from "@/components/ui/pagination";

import { format } from "date-fns";

import { useAppSelector } from "@/components/context/hooks";

import { lossesApi, fuelTypesApi } from "@/services/api";

import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency, toArabicNum } from "@/components/context/i18n";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import PashtoInput from "@/components/ui/pashto-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Loss type definitions (icon + colour) ─────────────────────────────────────
const LOSS_TYPES = ["Fuel Leakage", "Pump Damage", "Price Difference", "Other"];

const LOSS_META = {
  "Fuel Leakage":     { icon: FiDroplet,       color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-100 dark:bg-blue-900/30",    border: "border-blue-200 dark:border-blue-800" },
  "Pump Damage":      { icon: FiTool,           color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", border: "border-orange-200 dark:border-orange-800" },
  "Price Difference": { icon: FiTag,            color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", border: "border-purple-200 dark:border-purple-800" },
  "Other":            { icon: FiMoreHorizontal, color: "text-muted-foreground",               bg: "bg-muted",                           border: "border-border" },
};

function getLossMeta(type) {
  return LOSS_META[type] ?? LOSS_META["Other"];
}

const schema = z.object({
  lossType:    z.string().min(1, "Loss type required"),
  amount:      z.coerce.number().min(0.01, "Amount must be > 0"),
  date:        z.string().min(1, "Date is required"),
  fuelTypeId:  z.string().nullable().optional(),
  description: z.string().optional(),
});

export default function LossManagementPage() {
  const { user } = useAppSelector((s) => s.auth);
  const { t, lang } = useI18n();
  const qc = useQueryClient();

  const [dialog,   setDialog]   = useState({ open: false });
  const [deleteId, setDeleteId] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState("all");
  const [fuelFilter,  setFuelFilter]  = useState("all");
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [page,        setPage]        = useState(1);
  const PAGE_SIZE = 10;

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: losses = [], isLoading } = useQuery({
    queryKey: ["losses"],
    queryFn: lossesApi.getAll,
  });
  const { data: fuelTypes = [] } = useQuery({
    queryKey: ["fuelTypes"],
    queryFn: fuelTypesApi.getAll,
  });

  // ── Form ──────────────────────────────────────────────────────────────────
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { lossType: "", amount: 0, date: format(new Date(), "yyyy-MM-dd"), fuelTypeId: null, description: "" },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["losses"] });
  const generateId = () => `LOSS-${String(losses.length + 1).padStart(3, "0")}`;

  const createMutation = useMutation({
    mutationFn: (d) => lossesApi.create(d),
    onSuccess: () => { toast.success(t("lossAdded")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedRecord")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => lossesApi.update(id, data),
    onSuccess: () => { toast.success(t("lossUpdated")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedUpdate")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => lossesApi.delete(id),
    onSuccess: () => { toast.success(t("deleteSuccess")); invalidate(); setDeleteId(null); },
    onError: () => toast.error(t("failedDelete")),
  });

  // ── Dialog handlers ───────────────────────────────────────────────────────
  const openCreate = () => {
    form.reset({ lossType: "", amount: 0, date: format(new Date(), "yyyy-MM-dd"), fuelTypeId: null, description: "" });
    setDialog({ open: true });
  };
  const openEdit = (item) => {
    form.reset({ lossType: item.lossType, amount: item.amount, date: item.date, fuelTypeId: item.fuelTypeId, description: item.description });
    setDialog({ open: true, item });
  };

  const onSubmit = (values) => {
    values.amount = toArabicNum(values.amount);
    const data = {
      lossId:      dialog.item?.lossId ?? generateId(),
      lossType:    values.lossType,
      amount:      values.amount,
      date:        values.date,
      fuelTypeId:  values.fuelTypeId ?? null,
      description: values.description ?? "",
      addedBy:     user?.role ?? "admin",
    };
    if (dialog.item) updateMutation.mutate({ id: dialog.item.id, data });
    else createMutation.mutate(data);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...losses]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter((l) => {
        if (q) {
          const ft = fuelTypes.find((f) => f.id === l.fuelTypeId);
          const haystack = [
            l.lossId ?? "",
            l.lossType,
            String(l.amount ?? ""),
            l.date,
            l.description ?? "",
            ft?.name ?? "",
          ].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (typeFilter !== "all" && l.lossType    !== typeFilter)  return false;
        if (fuelFilter !== "all" && l.fuelTypeId  !== fuelFilter)  return false;
        if (dateFrom && l.date < dateFrom) return false;
        if (dateTo   && l.date > dateTo)   return false;
        return true;
      });
  }, [losses, fuelTypes, search, typeFilter, fuelFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [search, typeFilter, fuelFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasFilter = search || typeFilter !== "all" || fuelFilter !== "all" || dateFrom || dateTo;

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalLoss   = losses.reduce((a, l) => a + l.amount, 0);
  const filteredTotal = filtered.reduce((a, l) => a + l.amount, 0);
  const byType = LOSS_TYPES.map((lt) => ({
    type:  lt,
    total: losses.filter((l) => l.lossType === lt).reduce((a, l) => a + l.amount, 0),
    count: losses.filter((l) => l.lossType === lt).length,
  })).filter((bt) => bt.total > 0);

  const canEdit = user?.role === "admin" || user?.role === "manager";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout title={t("lossList")}>
      <div className="space-y-5">

        {/* ── Summary stat cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="h-full border-l-4 border-l-destructive">
            <CardContent className="px-5 pb-5 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{lang === "ps" ? "ټول تاوانونه" : "Total Losses"}</p>
                  <p className="mt-1 text-xl font-bold leading-tight text-destructive">{fmtCurrency(totalLoss, lang)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{losses.length} {lang === "ps" ? "ریکارډونه" : "records"}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 md:h-10 md:w-10">
                  <FiAlertTriangle className="h-4 w-4 text-destructive md:h-5 md:w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          {byType.slice(0, 3).map((item) => {
            const meta = getLossMeta(item.type);
            const Icon = meta.icon;
            const accentMap = { "Fuel Leakage": "border-l-blue-500", "Pump Damage": "border-l-orange-500", "Price Difference": "border-l-purple-500", "Other": "border-l-slate-400" };
            return (
              <Card key={item.type} className={`h-full border-l-4 ${accentMap[item.type] ?? "border-l-slate-400"}`}>
                <CardContent className="px-5 pb-5 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-pretty text-xs text-muted-foreground">{item.type}</p>
                      <p className="mt-1 text-xl font-bold leading-tight text-foreground">{fmtCurrency(item.total, lang)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.count} {lang === "ps" ? "پیښې" : "incidents"}</p>
                    </div>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10 ${meta.bg}`}>
                      <Icon className={`h-4 w-4 md:h-5 md:w-5 ${meta.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Main table card ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {t("lossList")}
                <Badge variant="secondary" className="font-mono text-xs">{filtered.length}</Badge>
                {hasFilter && (
                  <span className="text-xs text-muted-foreground">
                    — {fmtCurrency(filteredTotal, lang)}
                  </span>
                )}
              </CardTitle>
              {canEdit && (
                <Button size="sm" onClick={openCreate}>
                  <FiPlus className="mr-1 h-4 w-4" /> {t("recordLoss")}
                </Button>
              )}
            </div>

            {/* ── Filter bar ───────────────────────────────────────────── */}
            <div className="mt-3">

              {/* Desktop: single row */}
              <div className="hidden md:flex md:flex-wrap md:items-end md:gap-2">
                <div className="relative min-w-[160px] flex-1">
                  <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={`ID / ${t("description")}...`} className="h-8 ps-8 text-sm" />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{lang === "ps" ? "ټول ډولونه" : "All Types"}</SelectItem>
                    {LOSS_TYPES.map((lt) => {
                      const meta = getLossMeta(lt);
                      const Icon = meta.icon;
                      return (
                        <SelectItem key={lt} value={lt}>
                          <div className="flex items-center gap-2">
                            <span className={`flex h-5 w-5 items-center justify-center rounded ${meta.bg}`}>
                              <Icon className={`h-3 w-3 ${meta.color}`} />
                            </span>
                            {lt}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Select value={fuelFilter} onValueChange={setFuelFilter}>
                  <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filterAll")} — {t("fuel")}</SelectItem>
                    {fuelTypes.map((ft) => (
                      <SelectItem key={ft.id} value={ft.id} textValue={ft.name}>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                          {ft.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "له" : "From"}</span>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-[140px] text-sm" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "تر" : "To"}</span>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-[140px] text-sm" />
                </div>
                {hasFilter && (
                  <Button variant="ghost" size="sm" className="h-8 self-end text-xs"
                    onClick={() => { setSearch(""); setTypeFilter("all"); setFuelFilter("all"); setDateFrom(""); setDateTo(""); }}>
                    {lang === "ps" ? "پاکول ×" : "Clear ×"}
                  </Button>
                )}
              </div>

              {/* Mobile: search full-width + selects in 2-col grid + From/To side-by-side */}
              <div className="flex flex-col gap-2 md:hidden">
                {/* Row 1: search */}
                <div className="relative w-full">
                  <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder={`ID / ${t("description")}...`} className="h-8 ps-8 text-sm" />
                </div>

                {/* Row 2: loss type + fuel type */}
                <div className="grid grid-cols-2 gap-2">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "ps" ? "ټول ډولونه" : "All Types"}</SelectItem>
                      {LOSS_TYPES.map((lt) => {
                        const meta = getLossMeta(lt);
                        const Icon = meta.icon;
                        return (
                          <SelectItem key={lt} value={lt}>
                            <div className="flex items-center gap-2">
                              <span className={`flex h-5 w-5 items-center justify-center rounded ${meta.bg}`}>
                                <Icon className={`h-3 w-3 ${meta.color}`} />
                              </span>
                              {lt}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Select value={fuelFilter} onValueChange={setFuelFilter}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("filterAll")} — {t("fuel")}</SelectItem>
                      {fuelTypes.map((ft) => (
                        <SelectItem key={ft.id} value={ft.id} textValue={ft.name}>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                            {ft.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 3: From / To side-by-side */}
                <div className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "له" : "From"}</span>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-full text-sm" />
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "تر" : "To"}</span>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-full text-sm" />
                  </div>
                  {hasFilter && (
                    <Button variant="ghost" size="sm" className="h-8 shrink-0 self-end text-xs"
                      onClick={() => { setSearch(""); setTypeFilter("all"); setFuelFilter("all"); setDateFrom(""); setDateTo(""); }}>
                      {lang === "ps" ? "پاکول ×" : "Clear ×"}
                    </Button>
                  )}
                </div>
              </div>

            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <FiAlertTriangle className="h-8 w-8 opacity-30" />
                <p className="text-sm">
                  {hasFilter
                    ? (lang === "ps" ? "کوم تاوان ونه موندل شو" : "No losses match the current filters")
                    : (lang === "ps" ? "کوم تاوان ثبت نه شوی" : "No losses recorded")}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        t("lossId"),
                        t("lossType"),
                        t("fuel"),
                        t("amount"),
                        t("date"),
                        t("description"),
                        ...(canEdit ? [t("actions")] : []),
                      ].map((h) => (
                        <th
                          key={h}
                          className={`py-2 pr-4 text-xs font-medium text-muted-foreground first:ps-4 ${
                            h === t("actions") ? "text-end" : "text-start"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {paginated.map((l) => {
                      const ft   = fuelTypes.find((f) => f.id === l.fuelTypeId);
                      const meta = getLossMeta(l.lossType);
                      const Icon = meta.icon;
                      return (
                        <tr key={l.id} onClick={() => setViewRecord(l)}
                          className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          {/* Loss ID */}
                          <td className="py-3 pr-4 ps-4 font-mono text-xs text-muted-foreground">
                            {l.lossId}
                          </td>

                          {/* Loss type badge with icon */}
                          <td className="py-3 pr-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.color} ${meta.border}`}>
                              <Icon className="h-3 w-3 shrink-0" />
                              {l.lossType}
                            </span>
                          </td>

                          {/* Fuel type */}
                          <td className="py-3 pr-4">
                            {ft ? (
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                                <span className="text-sm text-muted-foreground">{ft.name}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="py-3 pr-4 text-sm font-semibold text-destructive">
                            {fmtCurrency(l.amount, lang)}
                          </td>

                          {/* Date */}
                          <td className="py-3 pr-4 text-sm text-muted-foreground">{l.date}</td>

                          {/* Description */}
                          <td className="max-w-[220px] truncate py-3 pr-4 text-sm text-muted-foreground">
                            {l.description || "—"}
                          </td>

                          {/* Actions */}
                          {canEdit && (
                            <td className="py-3 pe-3 text-end">
                              <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(l); }} className="h-8 w-8 p-0" title={t("edit")}>
                                <FiEdit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteId(l.id); }} className="h-8 w-8 p-0 text-destructive hover:text-destructive" title={t("delete")}>
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </CardContent>
        </Card>
      </div>

      {/* ── Loss Detail View ─────────────────────────────────────────────── */}
      <Dialog open={!!viewRecord} onOpenChange={(open) => { if (!open) setViewRecord(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          {viewRecord && (() => {
            const ft   = fuelTypes.find((f) => f.id === viewRecord.fuelTypeId);
            const meta = getLossMeta(viewRecord.lossType);
            const Icon = meta.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.bg} ${meta.color} ${meta.border}`}>
                      <Icon className="h-3 w-3" /> {viewRecord.lossType}
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">{viewRecord.lossId}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  <div className="rounded-xl bg-destructive/5 p-4 text-center">
                    <p className="text-xs text-muted-foreground">{t("amount")}</p>
                    <p className="mt-1 text-3xl font-bold text-destructive">{fmtCurrency(viewRecord.amount, lang)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: t("date"),        value: viewRecord.date },
                      { label: t("fuel"),        value: ft ? <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />{ft.name}</span> : "—" },
                      { label: lang === "ps" ? "اضافه کوونکی" : "Added By", value: viewRecord.addedBy ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <div className="mt-0.5 font-medium">{value}</div>
                      </div>
                    ))}
                  </div>
                  {viewRecord.description && (
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <p className="text-xs text-muted-foreground">{t("description")}</p>
                      <p className="mt-0.5">{viewRecord.description}</p>
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                      <Button variant="outline" size="sm" onClick={() => { setViewRecord(null); setDeleteId(viewRecord.id); }} className="text-destructive hover:text-destructive">
                        <FiTrash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete")}
                      </Button>
                      <Button size="sm" onClick={() => { const r = viewRecord; setViewRecord(null); openEdit(r); }}>
                        <FiEdit2 className="mr-1.5 h-3.5 w-3.5" /> {t("edit")}
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog.item ? t("editLoss") : t("recordLoss")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Loss type */}
              <FormField control={form.control} name="lossType" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("lossType")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder={t("selectType")} /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LOSS_TYPES.map((lt) => {
                        const meta = getLossMeta(lt);
                        const Icon = meta.icon;
                        return (
                          <SelectItem key={lt} value={lt}>
                            <div className="flex items-center gap-2">
                              <span className={`flex h-5 w-5 items-center justify-center rounded ${meta.bg}`}>
                                <Icon className={`h-3 w-3 ${meta.color}`} />
                              </span>
                              {lt}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Amount + Date */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="amount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("amountLabel")}</FormLabel>
                    <FormControl><PashtoInput type="number" step="0.01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="date" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("date")}</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Fuel type (optional) */}
              <FormField control={form.control} name="fuelTypeId" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fuel")} <span className="text-xs text-muted-foreground">(optional)</span></FormLabel>
                  <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {fuelTypes.map((ft) => (
                        <SelectItem key={ft.id} value={ft.id} textValue={ft.name}>
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                            {ft.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Description */}
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("description")}</FormLabel>
                  <FormControl><Input placeholder={t("description")} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setDialog({ open: false })}>{t("cancel")}</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {dialog.item ? t("update") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loss Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this loss record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
