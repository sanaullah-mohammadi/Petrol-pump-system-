import { useState, useMemo, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { z } from "zod";

import toast from "react-hot-toast";

import {
  FiPlus, FiTrash2, FiSearch, FiDollarSign, FiAlertCircle,
  FiShoppingCart, FiLock, FiFileText,
} from "react-icons/fi";
import { MdOutlineAccountBalance } from "react-icons/md";

import { format } from "date-fns";

import {
  purchasesApi,
  supplierPaymentsApi,
  fuelTypesApi,
} from "@/services/api";

import { TablePagination } from "@/components/ui/pagination";
import StatusBadge from "@/components/features/common/StatusBadge";
import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency, toArabicNum } from "@/components/context/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import PashtoInput from "@/components/ui/pashto-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const paySchema = z.object({
  supplierName: z.string().min(1),
  amount: z.coerce.number().min(0.01),
  paymentMethod: z.string().min(1),
  purchaseId: z.string().min(1),
  notes: z.string().optional(),
});

export default function AccountsPayablePage() {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const [dialog, setDialog] = useState({ open: false });

  // ── Supplier Balances filters ─────────────────────────────────────────────
  const [supplierSearch,  setSupplierSearch]  = useState("");
  const [balanceStatus,   setBalanceStatus]   = useState("all"); // all|paid|partial|unpaid

  // ── Payment History filters ───────────────────────────────────────────────
  const [historySearch,   setHistorySearch]   = useState("");
  const [methodFilter,    setMethodFilter]    = useState("all");
  const [historyFrom,     setHistoryFrom]     = useState("");
  const [historyTo,       setHistoryTo]       = useState("");
  const [historyPage,     setHistoryPage]     = useState(1);
  const HISTORY_PAGE_SIZE = 10;

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: purchasesApi.getAll,
  });
  const { data: supplierPayments = [] } = useQuery({
    queryKey: ["supplierPayments"],
    queryFn: supplierPaymentsApi.getAll,
  });
  const { data: fuelTypes = [] } = useQuery({
    queryKey: ["fuelTypes"],
    queryFn: fuelTypesApi.getAll,
  });

  const form = useForm({
    resolver: zodResolver(paySchema),
    defaultValues: {
      supplierName: "",
      amount: 0,
      paymentMethod: "bank_transfer",
      purchaseId: "",
      notes: "",
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["supplierPayments"] });
    qc.invalidateQueries({ queryKey: ["purchases"] });
  };

  const payMutation = useMutation({
    mutationFn: async (data) => {
      // Create the payment record
      const result = await supplierPaymentsApi.create(data);

      // Fetch fresh payments to compute accurate totalPaid
      const freshPayments = await supplierPaymentsApi.getAll();
      const freshPurchases = await purchasesApi.getAll();

      const purchase = freshPurchases.find((p) => p.id === data.purchaseId);
      if (purchase) {
        const totalPaid = freshPayments
          .filter((sp) => sp.purchaseId === purchase.id)
          .reduce((a, sp) => a + (sp.amount ?? 0), 0);
        const newStatus = totalPaid >= purchase.totalAmount ? "paid" : "partial";
        await purchasesApi.update(purchase.id, { paymentStatus: newStatus });
      }
      return result;
    },
    onSuccess: () => {
      toast.success(t("paymentAdded"));
      invalidate();
      setDialog({ open: false });
    },
    onError: (e) => toast.error(e?.message || t("failedRecord")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => supplierPaymentsApi.delete(id),
    onSuccess: () => {
      toast.success(t("paymentDeleted"));
      invalidate();
    },
    onError: () => toast.error(t("failedDelete")),
  });

  const onSubmit = (values) => {
    values.amount = toArabicNum(values.amount);
    payMutation.mutate({
      paymentId: `SPAY-${Date.now()}`,
      ...values,
      date: format(new Date(), "yyyy-MM-dd"),
      notes: values.notes ?? "",
    });
  };

  // ── Supplier summary (all, unfiltered — for stats) ───────────────────────
  const allSupplierSummary = useMemo(() => {
    const names = [...new Set(purchases.map((p) => p.supplierName))];
    return names.map((name) => {
      const supPurchases = purchases.filter((p) => p.supplierName === name);
      const supPayments  = supplierPayments.filter((sp) => sp.supplierName === name);
      const totalPurchased = supPurchases.reduce((a, p)  => a + p.totalAmount, 0);
      const totalPaid      = supPayments.reduce((a, sp)  => a + sp.amount,     0);
      const balance        = totalPurchased - totalPaid;
      const status         = balance <= 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid";
      return { name, totalPurchased, totalPaid, balance, status };
    });
  }, [purchases, supplierPayments]);

  // ── Filtered supplier summary ─────────────────────────────────────────────
  const supplierSummary = useMemo(() => {
    return allSupplierSummary.filter((s) => {
      if (supplierSearch) {
        const q = supplierSearch.toLowerCase();
        const haystack = [
          s.name,
          s.status,
          String(s.totalPurchased ?? ""),
          String(s.totalPaid ?? ""),
          String(s.balance ?? ""),
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (balanceStatus !== "all" && s.status !== balanceStatus) return false;
      return true;
    });
  }, [allSupplierSummary, supplierSearch, balanceStatus]);

  // ── Filtered payment history ──────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    return [...supplierPayments]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter((sp) => {
        if (q) {
          const haystack = [
            sp.paymentId ?? "",
            sp.supplierName,
            sp.purchaseId ?? "",
            String(sp.amount ?? ""),
            sp.paymentMethod ?? "",
            sp.date,
            sp.notes ?? "",
          ].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (methodFilter !== "all" && sp.paymentMethod !== methodFilter) return false;
        if (historyFrom && sp.date < historyFrom) return false;
        if (historyTo   && sp.date > historyTo)   return false;
        return true;
      });
  }, [supplierPayments, historySearch, methodFilter, historyFrom, historyTo]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalOwed      = allSupplierSummary.reduce((s, x) => s + x.balance, 0);
  const totalPaidAll   = allSupplierSummary.reduce((s, x) => s + x.totalPaid, 0);
  const unpaidCount    = allSupplierSummary.filter((s) => s.status === "unpaid").length;
  const partialCount   = allSupplierSummary.filter((s) => s.status === "partial").length;

  const hasSupplierFilter = supplierSearch || balanceStatus !== "all";
  const hasHistoryFilter  = historySearch || methodFilter !== "all" || historyFrom || historyTo;

  // ── History pagination ────────────────────────────────────────────────────
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage   = Math.min(historyPage, historyTotalPages);
  const paginatedHistory  = filteredHistory.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE,
  );

  useEffect(() => { setHistoryPage(1); }, [historySearch, methodFilter, historyFrom, historyTo]);

  // ── Purchases with outstanding balance (computed from actual payments) ────
  const unpaidPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const paid = supplierPayments
        .filter((sp) => sp.purchaseId === p.id)
        .reduce((a, sp) => a + (sp.amount ?? 0), 0);
      return paid < p.totalAmount;
    });
  }, [purchases, supplierPayments]);

  return (
    <AppLayout title={t("accountsPayableTitle")}>
      <div className="space-y-5">

        {/* ── Summary stat cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Total owed */}
          <Card className="border-l-4 border-l-destructive">
            <CardContent className="p-4 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ps" ? "ټول پاتې" : "Total Outstanding"}
                  </p>
                  <p className={`mt-1 text-xl font-bold ${totalOwed > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                    {fmtCurrency(totalOwed, lang)}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                  <FiAlertCircle className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total paid */}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4 pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalPaid")}</p>
                  <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">
                    {fmtCurrency(totalPaidAll, lang)}
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
                  <FiDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unpaid suppliers */}
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">{lang === "ps" ? "نه‌تادیه" : "Unpaid Suppliers"}</p>
              <p className="mt-1 text-xl font-bold text-destructive">{unpaidCount}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {partialCount} {lang === "ps" ? "جزوي" : "partial"}
              </p>
            </CardContent>
          </Card>

          {/* Payment history count */}
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4 pt-5">
              <p className="text-xs text-muted-foreground">
                {lang === "ps" ? "د تادیو شمیر" : "Payments Made"}
              </p>
              <p className="mt-1 text-xl font-bold text-foreground">{supplierPayments.length}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lang === "ps" ? "ټول ثبت شوي تادیات" : "total recorded payments"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Supplier Balances ────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {lang === "ps" ? "د عرضه‌کوونکو بیلانس" : "Supplier Balances"}
                <Badge variant="secondary" className="font-mono text-xs">{supplierSummary.length}</Badge>
              </CardTitle>
              <Button size="sm" onClick={() => {
                form.reset({ supplierName: "", amount: 0, paymentMethod: "bank_transfer", purchaseId: "", notes: "" });
                setDialog({ open: true });
              }}>
                <FiPlus className="mr-1 h-4 w-4" />
                {lang === "ps" ? "تادیه ثبت کول" : "Record Payment"}
              </Button>
            </div>

            {/* Supplier filter bar */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative min-w-[160px] flex-1">
                <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder={`${t("supplier")}...`}
                  className="h-8 ps-8 text-sm"
                />
              </div>

              {/* Balance status filter */}
              <Select value={balanceStatus} onValueChange={setBalanceStatus}>
                <SelectTrigger className="h-8 w-[130px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  <SelectItem value="paid">{t("paid")}</SelectItem>
                  <SelectItem value="partial">{t("partial")}</SelectItem>
                  <SelectItem value="unpaid">{t("unpaid")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear */}
              {hasSupplierFilter && (
                <Button variant="ghost" size="sm" className="h-8 text-xs"
                  onClick={() => { setSupplierSearch(""); setBalanceStatus("all"); }}>
                  {lang === "ps" ? "پاکول ×" : "Clear ×"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap">
                <thead>
                  <tr className="border-b border-border">
                    {[t("supplier"), t("totalPurchased"), t("totalPaid"), t("balance"), t("status")].map((h) => (
                      <th key={h} className="py-2 pr-4 ps-4 text-start text-xs font-medium text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplierSummary.map((s) => {
                    // All unpaid/partial purchases for this supplier — not just first
                    const supplierUnpaid = unpaidPurchases.filter(
                      (p) => p.supplierName === s.name,
                    );
                    // Pick the one with the highest outstanding balance
                    const firstUnpaid = supplierUnpaid.reduce((best, p) => {
                      const paid = supplierPayments
                        .filter((sp) => sp.purchaseId === p.id)
                        .reduce((a, sp) => a + (sp.amount ?? 0), 0);
                      const outstanding = p.totalAmount - paid;
                      if (!best) return p;
                      const bestPaid = supplierPayments
                        .filter((sp) => sp.purchaseId === best.id)
                        .reduce((a, sp) => a + (sp.amount ?? 0), 0);
                      return outstanding > (best.totalAmount - bestPaid) ? p : best;
                    }, null);

                    const isClickable = !!firstUnpaid && s.balance > 0;

                    const openPaymentForSupplier = () => {
                      if (!firstUnpaid) return;
                      // Use live supplierPayments from query (not stale closure)
                      const alreadyPaid = supplierPayments
                        .filter((sp) => sp.purchaseId === firstUnpaid.id)
                        .reduce((a, sp) => a + (sp.amount ?? 0), 0);
                      const maxPayable = Math.max(0, firstUnpaid.totalAmount - alreadyPaid);
                      form.reset({
                        supplierName:  firstUnpaid.supplierName,
                        purchaseId:    firstUnpaid.id,
                        amount:        maxPayable,
                        paymentMethod: "bank_transfer",
                        notes: "",
                      });
                      setDialog({ open: true });
                    };

                    return (
                    <tr key={s.name}
                      onClick={isClickable ? openPaymentForSupplier : undefined}
                      className={`border-b border-border transition-colors last:border-0 ${
                        isClickable ? "cursor-pointer hover:bg-primary/5" : "hover:bg-muted/30"
                      } ${s.status === "unpaid" ? "bg-destructive/5" : ""}`}>
                      <td className="py-3 pr-4 ps-4 text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {s.name}
                          {isClickable && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {lang === "ps" ? "تادیه" : "Pay"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-sm">{fmtCurrency(s.totalPurchased, lang)}</td>
                      <td className="py-3 pr-4 text-sm text-green-600 dark:text-green-400">
                        {fmtCurrency(s.totalPaid, lang)}
                      </td>
                      <td className={`py-3 pr-4 text-sm font-semibold ${s.balance > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                        {fmtCurrency(s.balance, lang)}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                    );
                  })}
                  {supplierSummary.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        {lang === "ps" ? "کوم ریکارډ ونه موندل شو" : "No suppliers match the current filters"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Payment History ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {lang === "ps" ? "د تادیو تاریخچه" : "Payment History"}
                <Badge variant="secondary" className="font-mono text-xs">{filteredHistory.length}</Badge>
              </CardTitle>
            </div>

            {/* Payment history filter bar */}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              {/* Search — payment ID, supplier, purchase ref */}
              <div className="relative min-w-[160px] flex-1">
                <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder={`${t("supplier")} / ID / ${t("purchaseRef")}...`}
                  className="h-8 ps-8 text-sm"
                />
              </div>

              {/* Payment method filter */}
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-8 w-[150px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")} — {t("method")}</SelectItem>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                  <SelectItem value="card">{t("card")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Date from */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "له" : "From"}</span>
                <Input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className="h-8 w-36 text-sm" />
              </div>

              {/* Date to */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "تر" : "To"}</span>
                <Input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className="h-8 w-36 text-sm" />
              </div>

              {/* Clear */}
              {hasHistoryFilter && (
                <Button variant="ghost" size="sm" className="h-8 self-end text-xs"
                  onClick={() => { setHistorySearch(""); setMethodFilter("all"); setHistoryFrom(""); setHistoryTo(""); }}>
                  {lang === "ps" ? "پاکول ×" : "Clear ×"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {filteredHistory.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {lang === "ps" ? "کوم تادیه ونه موندل شوه" : "No payments match the current filters"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        "ID", t("supplier"), t("amount"), t("method"),
                        t("date"), t("purchaseRef"), t("notes"), t("actions"),
                      ].map((h) => (
                        <th key={h}
                          className={`py-2 pr-4 text-xs font-medium text-muted-foreground first:ps-4 ${h === t("actions") ? "text-end" : "text-start"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((sp) => (
                      <tr key={sp.id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
                        <td className="py-3 pr-4 ps-4 font-mono text-xs text-muted-foreground">{sp.paymentId}</td>
                        <td className="py-3 pr-4 text-sm font-medium">{sp.supplierName}</td>
                        <td className="py-3 pr-4 text-sm font-semibold text-green-600 dark:text-green-400">
                          {fmtCurrency(sp.amount, lang)}
                        </td>
                        <td className="py-3 pr-4 text-sm capitalize text-muted-foreground">
                          {sp.paymentMethod?.replace("_", " ")}
                        </td>
                        <td className="py-3 pr-4 text-sm text-muted-foreground">{sp.date}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{sp.purchaseId}</td>
                        <td className="py-3 pr-4 max-w-[160px] truncate text-sm text-muted-foreground">
                          {sp.notes || "—"}
                        </td>
                        <td className="py-3 pe-3 text-end">
                          <Button variant="ghost" size="sm"
                            onClick={() => deleteMutation.mutate(sp.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title={t("delete")}>
                            <FiTrash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination
              page={safeHistoryPage}
              totalPages={historyTotalPages}
              total={filteredHistory.length}
              pageSize={HISTORY_PAGE_SIZE}
              onPageChange={setHistoryPage}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MdOutlineAccountBalance className="h-4 w-4 text-primary" />
              {lang === "ps" ? "د عرضه‌کوونکي تادیه ثبت کول" : "Record Supplier Payment"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* ── Purchase selector ── */}
              <FormField
                control={form.control}
                name="purchaseId"
                render={({ field }) => {
                  const selectedPurchase = purchases.find((p) => p.id === field.value);
                  const ft = selectedPurchase
                    ? fuelTypes.find((f) => f.id === selectedPurchase.fuelTypeId)
                    : null;
                  const alreadyPaid = selectedPurchase
                    ? supplierPayments
                        .filter((sp) => sp.purchaseId === selectedPurchase.id)
                        .reduce((a, sp) => a + sp.amount, 0)
                    : 0;
                  const outstanding = selectedPurchase
                    ? Math.max(0, selectedPurchase.totalAmount - alreadyPaid)
                    : 0;

                  return (
                    <>
                      {/* Supplier readonly field */}
                      <FormItem>
                        <FormLabel>{t("supplier")}</FormLabel>
                        <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2">
                          <FiShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 text-sm">
                            {selectedPurchase?.supplierName || (lang === "ps" ? "لومړی پیرودنه غوره کړئ" : "Select a purchase below")}
                          </span>
                          <FiLock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </div>
                      </FormItem>

                      {/* Purchase dropdown */}
                      <FormItem>
                        <FormLabel>{t("purchaseRef")}</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            const p = purchases.find((pu) => pu.id === v);
                            if (p) {
                              form.setValue("supplierName", p.supplierName);
                              // Pre-fill max payable
                              const paid = supplierPayments
                                .filter((sp) => sp.purchaseId === p.id)
                                .reduce((a, sp) => a + sp.amount, 0);
                              const max = Math.max(0, p.totalAmount - paid);
                              form.setValue("amount", max);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={lang === "ps" ? "پیرودنه غوره کړئ" : "Select purchase"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {unpaidPurchases.map((p) => {
                              const f = fuelTypes.find((ft) => ft.id === p.fuelTypeId);
                              return (
                                <SelectItem key={p.id} value={p.id}>
                                  <span className="font-medium">{p.purchaseId}</span>
                                  <span className="ml-1.5 text-muted-foreground">
                                    — {p.supplierName} — {f?.name} ({fmtCurrency(p.totalAmount, lang)})
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>

                      {/* Purchase Details card — only shown once a purchase is selected */}
                      {selectedPurchase && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                          <p className="mb-2 text-xs font-semibold text-primary">
                            {lang === "ps" ? "د پیرودنې جزئیات" : "Purchase Details"}
                          </p>
                          <div className="flex items-start gap-3">
                            {/* Left — purchase identity */}
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <FiShoppingCart className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold leading-tight">{selectedPurchase.purchaseId}</p>
                              <p className="text-xs text-muted-foreground">{selectedPurchase.supplierName}</p>
                              <p className="text-xs text-muted-foreground">{ft?.name ?? "—"}</p>
                            </div>
                            {/* Right — amounts */}
                            <div className="shrink-0 text-right">
                              <div className="mb-0.5 flex items-center justify-end gap-6">
                                <span className="text-xs text-muted-foreground">
                                  {lang === "ps" ? "ټوله مبلغ" : "Total Amount"}
                                </span>
                                <span className="text-sm font-semibold">
                                  {fmtCurrency(selectedPurchase.totalAmount, lang)}
                                </span>
                              </div>
                              <div className="mb-0.5 flex items-center justify-end gap-6">
                                <span className="text-xs text-muted-foreground">
                                  {lang === "ps" ? "تادیه شوی" : "Paid Amount"}
                                </span>
                                <span className="text-sm font-semibold text-destructive">
                                  {fmtCurrency(alreadyPaid, lang)}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-6 border-t border-border pt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {lang === "ps" ? "پاتې بیلانس" : "Outstanding Balance"}
                                </span>
                                <span className="text-sm font-bold text-primary">
                                  {fmtCurrency(outstanding, lang)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                }}
              />

              {/* ── Payment Amount ── */}
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => {
                  const selectedPurchase = purchases.find((p) => p.id === form.watch("purchaseId"));
                  const alreadyPaid = selectedPurchase
                    ? supplierPayments
                        .filter((sp) => sp.purchaseId === selectedPurchase.id)
                        .reduce((a, sp) => a + sp.amount, 0)
                    : 0;
                  const maxPayable = selectedPurchase
                    ? Math.max(0, selectedPurchase.totalAmount - alreadyPaid)
                    : null;

                  return (
                    <FormItem>
                      <FormLabel>
                        {lang === "ps" ? "د تادیې مبلغ (AFN)" : "Payment Amount (AFN)"}
                      </FormLabel>
                      <div className="relative">
                        <FiDollarSign className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <FormControl>
                          <PashtoInput
                            type="number"
                            step="0.01"
                            className="ps-9"
                            onWheel={(e) => e.target.blur()}
                            {...field}
                          />
                        </FormControl>
                      </div>
                      {maxPayable !== null && (
                        <p className="text-xs text-primary">
                          {lang === "ps" ? "اعظمي تادیه:" : "Maximum payable:"}{" "}
                          <span className="font-semibold">{fmtCurrency(maxPayable, lang)}</span>
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              {/* ── Payment Method ── */}
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("paymentMethod")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="cash">{t("cash")}</SelectItem>
                        <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                        <SelectItem value="card">{t("card")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Notes ── */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {lang === "ps" ? "یادداښتونه (اختیاري)" : "Notes (Optional)"}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={lang === "ps" ? "د تادیې یادداښتونه..." : "Add any payment notes..."}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Payment Summary footer bar ── */}
              {(() => {
                const amount = toArabicNum(form.watch("amount")) || 0;
                const selectedPurchase = purchases.find((p) => p.id === form.watch("purchaseId"));
                const alreadyPaid = selectedPurchase
                  ? supplierPayments
                      .filter((sp) => sp.purchaseId === selectedPurchase.id)
                      .reduce((a, sp) => a + sp.amount, 0)
                  : 0;
                const outstanding = selectedPurchase
                  ? Math.max(0, selectedPurchase.totalAmount - alreadyPaid - amount)
                  : 0;

                return (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FiFileText className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">
                        {lang === "ps" ? "د تادیې لنډیز" : "Payment Summary"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <span className="text-muted-foreground">
                        {lang === "ps" ? "تادیه کوئ:" : "You are paying:"}{"  "}
                        <span className="font-semibold text-foreground">{fmtCurrency(amount, lang)}</span>
                      </span>
                      <span className="text-muted-foreground">
                        {lang === "ps" ? "پاتې بیلانس:" : "Remaining Balance:"}{"  "}
                        <span className={`font-semibold ${outstanding > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}`}>
                          {fmtCurrency(outstanding, lang)}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* ── Actions ── */}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" type="button" onClick={() => setDialog({ open: false })}>
                  <span className="mr-1">×</span> {t("cancel")}
                </Button>
                <Button type="submit" disabled={payMutation.isPending} className="gap-1.5">
                  <MdOutlineAccountBalance className="h-4 w-4" />
                  {lang === "ps" ? "تادیه ثبت کول" : "Record Payment"}
                </Button>
              </div>

            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
