import { useState, useMemo, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import { z } from "zod";

import toast from "react-hot-toast";

import { FiPlus, FiEdit2, FiTrash2, FiSearch, FiShoppingCart, FiCreditCard, FiTrendingUp } from "react-icons/fi";

import { format } from "date-fns";

import { TablePagination } from "@/components/ui/pagination";

import { useAppSelector } from "@/components/context/hooks";
import {
  salesApi,
  fuelTypesApi,
  fuelPricesApi,
  customersApi,
  employeesApi,
  tanksApi,
  pumpsApi,
} from "@/services/api";

import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency, toArabicNum } from "@/components/context/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const schema = z.object({
  pumpNumber: z.string().min(1, "Pump number is required"),
  fuelTypeId: z.string().min(1, "Fuel required"),
  customerType: z.enum(["cash", "credit"]),
  customerId: z.string().optional(),
  customerName: z.string().min(1, "Customer name is required"),
  liters: z.coerce.number().min(0.01, "Liters must be > 0"),
  pricePerLiter: z.coerce.number().min(0.001),
  paymentMethod: z.enum(["cash", "card", "credit", "bank_transfer"]),
  transactionType: z.enum(["retail", "fleet", "bulk"]),
  notes: z.string().optional(),
});

export default function SalesPage() {
  const { user } = useAppSelector((s) => s.auth);
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState({ open: false });
  const [deleteId, setDeleteId] = useState(null);
  const [viewRecord, setViewRecord] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // ── Sell mode ─────────────────────────────────────────────────────────────
  const [sellMode,   setSellMode]   = useState("liters"); // "liters" | "amount"
  const [amountPaid, setAmountPaid] = useState(0);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState("");   // TXN ID or customer name
  const [fuelFilter,    setFuelFilter]    = useState("all");
  const [custTypeFilter,setCustTypeFilter]= useState("all"); // all | cash | credit
  const [txnTypeFilter, setTxnTypeFilter] = useState("all"); // all | retail | fleet | bulk
  const [methodFilter,  setMethodFilter]  = useState("all");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: salesApi.getAll,
  });
  const { data: fuelTypes = [] } = useQuery({
    queryKey: ["fuelTypes"],
    queryFn: fuelTypesApi.getAll,
  });
  const { data: fuelPrices = [] } = useQuery({
    queryKey: ["fuelPrices"],
    queryFn: fuelPricesApi.getAll,
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: customersApi.getAll,
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: employeesApi.getAll,
  });
  const { data: tanks = [] } = useQuery({
    queryKey: ["tanks"],
    queryFn: tanksApi.getAll,
  });
  const { data: pumps = [] } = useQuery({
    queryKey: ["pumps"],
    queryFn: pumpsApi.getAll,
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      pumpNumber: "",
      fuelTypeId: "",
      customerType: "cash",
      customerId: "",
      customerName: "Walk-in",
      liters: 0,
      pricePerLiter: 0,
      paymentMethod: "cash",
      transactionType: "retail",
      notes: "",
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form is the designated stack
  const fuelTypeId   = form.watch("fuelTypeId");
  const pumpNumber   = form.watch("pumpNumber");
  const customerType = form.watch("customerType");
  const liters       = form.watch("liters");
  const pricePerLiter = form.watch("pricePerLiter");

  // In "amount" mode: liters are derived from amountPaid ÷ pricePerLiter
  const calculatedLiters = sellMode === "amount" && pricePerLiter > 0
    ? Math.floor((amountPaid / pricePerLiter) * 100) / 100   // truncate to 2dp
    : null;

  const totalAmount = sellMode === "amount"
    ? amountPaid
    : (liters || 0) * (pricePerLiter || 0);

  // Derive the selected pump record and its assigned tank for the selected fuel type
  const selectedPump = pumps.find((p) => p.pumpNumber === pumpNumber);
  const assignedTank = (() => {
    if (!selectedPump || !fuelTypeId) return null;
    // New format: tankAssignments array
    if (Array.isArray(selectedPump.tankAssignments) && selectedPump.tankAssignments.length > 0) {
      const assignment = selectedPump.tankAssignments.find((a) => a.fuelTypeId === fuelTypeId);
      return assignment ? tanks.find((t) => t.id === assignment.tankId) ?? null : null;
    }
    // Legacy fallback: single tankId
    if (selectedPump.tankId) {
      const tank = tanks.find((t) => t.id === selectedPump.tankId);
      return tank?.fuelTypeId === fuelTypeId ? tank : null;
    }
    return null;
  })();
  const selectedFuelType = fuelTypes.find((f) => f.id === fuelTypeId);

  // Fuel types allowed for selected pump — all types in pump.fuelTypeIds
  const allowedFuelTypes = selectedPump
    ? fuelTypes.filter((ft) => {
        const ids = Array.isArray(selectedPump.fuelTypeIds)
          ? selectedPump.fuelTypeIds
          : (selectedPump.fuelTypeId ? [selectedPump.fuelTypeId] : []);
        return ids.includes(ft.id);
      })
    : fuelTypes;

  // When pump changes: reset fuel; auto-select only if the pump has exactly 1 fuel type
  const handlePumpChange = (pNum) => {
    form.setValue("pumpNumber", pNum);
    form.setValue("fuelTypeId", "");
    form.setValue("pricePerLiter", 0);
    const pump = pumps.find((p) => p.pumpNumber === pNum);
    if (pump) {
      const ids = Array.isArray(pump.fuelTypeIds)
        ? pump.fuelTypeIds
        : (pump.fuelTypeId ? [pump.fuelTypeId] : []);
      if (ids.length === 1) {
        const ft = fuelTypes.find((f) => f.id === ids[0]);
        if (ft) {
          form.setValue("fuelTypeId", ft.id);
          const fp = fuelPrices.find((p) => p.fuelTypeId === ft.id);
          form.setValue("pricePerLiter", fp?.pricePerLiter ?? ft.pricePerLiter ?? 0);
        }
      }
    }
  };

  // Auto-set price when fuel type changes
  const handleFuelTypeChange = (id) => {
    form.setValue("fuelTypeId", id);
    const fp = fuelPrices.find((p) => p.fuelTypeId === id);
    const ft = fuelTypes.find((f) => f.id === id);
    if (fp) form.setValue("pricePerLiter", fp.pricePerLiter);
    else if (ft) form.setValue("pricePerLiter", ft.pricePerLiter);
  };

  const handleCustomerChange = (id) => {
    form.setValue("customerId", id);
    const c = customers.find((cu) => cu.id === id);
    if (c) form.setValue("customerName", c.fullName);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["tanks"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["pumps"] });
  };

  const generateId = () => `TXN-${String(sales.length + 1).padStart(3, "0")}`;

  const canEdit = user?.role === "admin" || user?.role === "manager";

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Find the pump
      const pump = pumps.find((p) => p.pumpNumber === data.pumpNumber);

      // Find the tank: use the pump's tankAssignments for the chosen fuel type,
      // with a legacy tankId fallback, then a broad active-tank search.
      let tank = null;
      if (pump) {
        // New format: per-fuel tankAssignments
        if (Array.isArray(pump.tankAssignments) && pump.tankAssignments.length > 0) {
          const assignment = pump.tankAssignments.find((a) => a.fuelTypeId === data.fuelTypeId);
          if (assignment?.tankId) tank = tanks.find((t) => t.id === assignment.tankId) ?? null;
        }
        // Legacy fallback: single tankId
        if (!tank && pump.tankId) {
          const candidateTank = tanks.find((t) => t.id === pump.tankId);
          if (candidateTank && candidateTank.fuelTypeId === data.fuelTypeId) tank = candidateTank;
        }
      }
      // Last resort: any active tank for the fuel type
      if (!tank) {
        tank = tanks.find((t) => t.fuelTypeId === data.fuelTypeId && t.status === "active") ?? null;
      }

      if (!tank) throw new Error(lang === "ps" ? "د دې تیلو لپاره ټانک ونه موندل شو" : "No tank found for the selected fuel type");
      if (tank.status !== "active") throw new Error(`Tank "${tank.name}" is not active`);
      if (tank.currentStock < (data.liters ?? 0))
        throw new Error(`Insufficient stock. Available: ${tank.currentStock}L in ${tank.name}`);

      const result = await salesApi.create(data);

      // Deduct from the matched tank
      await tanksApi.patch(tank.id, {
        currentStock: tank.currentStock - (data.liters ?? 0),
      });

      // Update customer balance for credit sales
      if (data.customerType === "credit" && data.customerId) {
        const customer = customers.find((c) => c.id === data.customerId);
        if (customer) {
          if (customer.status === "blocked") throw new Error(t("blocked"));
          await customersApi.update(customer.id, {
            creditBalance: customer.creditBalance + (data.totalAmount ?? 0),
          });
        }
      }
      return result;
    },
    onSuccess: () => {
      toast.success(t("saleRecorded"));
      invalidate();
      setDialog({ open: false });
    },
    onError: (e) => toast.error(e.message || t("failedRecord")),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => salesApi.update(id, data),
    onSuccess: () => {
      toast.success(t("saleUpdated"));
      invalidate();
      setDialog({ open: false });
    },
    onError: () => toast.error(t("failedUpdate")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => salesApi.delete(id),
    onSuccess: () => {
      toast.success(t("deleteSuccess"));
      invalidate();
      setDeleteId(null);
    },
    onError: () => toast.error(t("failedDelete")),
  });

  const openCreate = () => {
    const firstPump = pumps.find((p) => p.status === "active");
    form.reset({
      pumpNumber:      firstPump?.pumpNumber ?? "",
      fuelTypeId:      "",
      customerType:    "cash",
      customerId:      "",
      customerName:    "Walk-in",
      liters:          0,
      pricePerLiter:   0,
      paymentMethod:   "cash",
      transactionType: "retail",
      notes:           "",
    });
    setSellMode("liters");
    setAmountPaid(0);
    setDialog({ open: true });
  };

  const openEdit = (item) => {
    form.reset({
      pumpNumber: item.pumpNumber,
      fuelTypeId: item.fuelTypeId,
      customerType: item.customerType,
      customerId: item.customerId ?? "",
      customerName: item.customerName,
      liters: item.liters,
      pricePerLiter: item.pricePerLiter,
      paymentMethod: item.paymentMethod,
      transactionType: item.transactionType,
      notes: item.notes,
    });
    setSellMode("liters");
    setAmountPaid(0);
    setDialog({ open: true, item });
  };

  const onSubmit = (values) => {
    // Normalize Pashto numerals to ASCII
    values.liters = toArabicNum(values.liters);
    values.pricePerLiter = toArabicNum(values.pricePerLiter);
    // In "amount" mode override liters with the calculated value
    if (sellMode === "amount" && calculatedLiters !== null) {
      values.liters = calculatedLiters;
    }
    const empId = user?.employeeId
      ? (employees.find((e) => e.employeeId === user.employeeId)?.id ?? "1")
      : "1";
    const data = {
      ...values,
      customerId: values.customerId || null,
      totalAmount,
      employeeId: empId,
      date: new Date().toISOString(),
      notes: values.notes ?? "",
      transactionId: dialog.item?.transactionId ?? generateId(),
    };
    if (dialog.item) updateMutation.mutate({ id: dialog.item.id, data });
    else createMutation.mutate(data);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...sales]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .filter((s) => {
        const dateStr = s.date ? String(s.date).substring(0, 10) : "";
        if (q && !s.transactionId.toLowerCase().includes(q) &&
            !s.customerName.toLowerCase().includes(q)) return false;
        if (fuelFilter     !== "all" && s.fuelTypeId     !== fuelFilter)     return false;
        if (custTypeFilter !== "all" && s.customerType   !== custTypeFilter)  return false;
        if (txnTypeFilter  !== "all" && s.transactionType !== txnTypeFilter)  return false;
        if (methodFilter   !== "all" && s.paymentMethod  !== methodFilter)    return false;
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo   && dateStr > dateTo)   return false;
        return true;
      });
  }, [sales, search, fuelFilter, custTypeFilter, txnTypeFilter, methodFilter, dateFrom, dateTo]);

  useEffect(() => { setPage(1); }, [search, fuelFilter, custTypeFilter, txnTypeFilter, methodFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Summary stats (filtered) ──────────────────────────────────────────────
  const filteredRevenue = filtered.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const filteredLiters  = filtered.reduce((s, r) => s + (r.liters ?? 0), 0);
  const filteredCredit  = filtered.filter((r) => r.customerType === "credit")
                                   .reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  const hasFilter = search || fuelFilter !== "all" || custTypeFilter !== "all" ||
                    txnTypeFilter !== "all" || methodFilter !== "all" || dateFrom || dateTo;

  const creditCustomers = customers.filter(
    (c) => c.type === "credit" && c.status === "active",
  );

  return (
    <AppLayout title={t("fuelSales")}>
      <div className="space-y-4">

        {/* ── Summary stat cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="h-full border-l-4 border-l-primary">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalRevenue")}</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{fmtCurrency(filteredRevenue, lang)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} {lang === "ps" ? "معاملې" : "transactions"} · {filteredLiters.toLocaleString()}L</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FiShoppingCart className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="h-full border-l-4 border-l-blue-500">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("credit")}</p>
                  <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">{fmtCurrency(filteredCredit, lang)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{filtered.filter((r) => r.customerType === "credit").length} {lang === "ps" ? "قرضي معاملې" : "credit sales"}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <FiCreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 h-full border-l-4 border-l-green-500 sm:col-span-1">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("cash")}</p>
                  <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{fmtCurrency(filteredRevenue - filteredCredit, lang)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{filtered.filter((r) => r.customerType === "cash").length} {lang === "ps" ? "نقده معاملې" : "cash sales"}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                  <FiTrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Main table card ───────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {t("salesTransactions")}
                <Badge variant="secondary" className="font-mono text-xs">
                  {filtered.length}
                </Badge>
              </CardTitle>
              <Button size="sm" onClick={openCreate}>
                <FiPlus className="mr-1 h-4 w-4" /> {t("newSale")}
              </Button>
            </div>

            {/* ── Filter bar ──────────────────────────────────────────── */}
            <div className="mt-3 flex flex-wrap items-end gap-2">

              {/* Search — TXN ID or customer name */}
              <div className="relative min-w-[160px] flex-1">
                <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`${t("transactionId")} / ${t("customer")}...`}
                  className="h-8 ps-8 text-sm"
                />
              </div>

              {/* Fuel type */}
              <Select value={fuelFilter} onValueChange={setFuelFilter}>
                <SelectTrigger className="h-8 w-[140px] text-sm">
                  <SelectValue placeholder={t("fuel")} />
                </SelectTrigger>
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

              {/* Customer type */}
              <Select value={custTypeFilter} onValueChange={setCustTypeFilter}>
                <SelectTrigger className="h-8 w-[120px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="credit">{t("credit")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Transaction type */}
              <Select value={txnTypeFilter} onValueChange={setTxnTypeFilter}>
                <SelectTrigger className="h-8 w-[110px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  <SelectItem value="retail">{t("retail")}</SelectItem>
                  <SelectItem value="fleet">{t("fleet")}</SelectItem>
                  <SelectItem value="bulk">{t("bulk")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Payment method */}
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-8 w-[120px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")} — {t("method")}</SelectItem>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="card">{t("card")}</SelectItem>
                  <SelectItem value="credit">{t("credit")}</SelectItem>
                  <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Date from */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "له" : "From"}</span>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-sm" />
              </div>

              {/* Date to */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{lang === "ps" ? "تر" : "To"}</span>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-sm" />
              </div>

              {/* Clear */}
              {hasFilter && (
                <Button variant="ghost" size="sm" className="h-8 self-end text-xs"
                  onClick={() => { setSearch(""); setFuelFilter("all"); setCustTypeFilter("all"); setTxnTypeFilter("all"); setMethodFilter("all"); setDateFrom(""); setDateTo(""); }}>
                  {lang === "ps" ? "پاکول ×" : "Clear ×"}
                </Button>
              )}
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
              <div className="py-12 text-center text-sm text-muted-foreground">
                {lang === "ps" ? "کوم پلور ونه موندل شو" : "No sales match the current filters"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        t("transactionId"),
                        "Pump",
                        t("fuel"),
                        t("customer"),
                        t("liters"),
                        t("pricePerLiter"),
                        t("total"),
                        t("method"),
                        t("transactionType"),
                        t("employee"),
                        t("date"),
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
                    {paginated.map((s) => {
                      const ft  = fuelTypes.find((f) => f.id === s.fuelTypeId);
                      const emp = employees.find((e) => e.id === s.employeeId);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setViewRecord(s)}
                          className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                        >
                          <td className="py-3 pr-4 ps-4 font-mono text-xs text-muted-foreground">
                            {s.transactionId}
                          </td>
                          <td className="py-3 pr-4 text-sm">{s.pumpNumber}</td>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: ft?.color ?? "#94a3b8" }} />
                              <span className="text-sm">{ft?.name ?? "—"}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <p className="text-sm">{s.customerName}</p>
                            <span className={`rounded-full px-1.5 py-0.5 text-xs ${s.customerType === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-muted text-muted-foreground"}`}>
                              {s.customerType}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm">{s.liters}L</td>
                          <td className="py-3 pr-4 text-sm">{fmtCurrency(s.pricePerLiter, lang, 3)}</td>
                          <td className="py-3 pr-4 text-sm font-semibold">{fmtCurrency(s.totalAmount, lang)}</td>
                          <td className="py-3 pr-4">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                              {s.paymentMethod?.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                              {s.transactionType}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-muted-foreground">
                            {emp?.fullName ?? "—"}
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">
                            {format(new Date(s.date), "yyyy-MM-dd HH:mm")}
                          </td>
                          {canEdit && (
                            <td className="py-3 pe-3 text-end">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="h-8 w-8 p-0" title={t("edit")}>
                                  <FiEdit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }} className="h-8 w-8 p-0 text-destructive hover:text-destructive" title={t("delete")}>
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

      {/* ── Sale Detail View ─────────────────────────────────────────────── */}
      <Dialog open={!!viewRecord} onOpenChange={(open) => { if (!open) setViewRecord(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          {viewRecord && (() => {
            const ft  = fuelTypes.find((f) => f.id === viewRecord.fuelTypeId);
            const emp = employees.find((e) => e.id === viewRecord.employeeId);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <span className="font-mono text-muted-foreground">{viewRecord.transactionId}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  <div className="rounded-xl bg-primary/5 p-4 text-center">
                    <p className="text-xs text-muted-foreground">{t("total")}</p>
                    <p className="mt-1 text-3xl font-bold text-primary">{fmtCurrency(viewRecord.totalAmount, lang)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{viewRecord.liters}L × {fmtCurrency(viewRecord.pricePerLiter, lang, 3)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: t("fuel"),            value: <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: ft?.color ?? "#94a3b8" }} />{ft?.name ?? "—"}</span> },
                      { label: "Pump",               value: viewRecord.pumpNumber },
                      { label: t("customer"),        value: viewRecord.customerName },
                      { label: t("customerType"),    value: <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${viewRecord.customerType === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-muted text-muted-foreground"}`}>{viewRecord.customerType}</span> },
                      { label: t("paymentMethod"),   value: <span className="capitalize">{viewRecord.paymentMethod?.replace("_", " ")}</span> },
                      { label: t("transactionType"), value: <span className="capitalize">{viewRecord.transactionType}</span> },
                      { label: t("employee"),        value: emp?.fullName ?? "—" },
                      { label: t("date"),            value: format(new Date(viewRecord.date), "yyyy-MM-dd HH:mm") },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <div className="mt-0.5 font-medium">{value}</div>
                      </div>
                    ))}
                  </div>
                  {viewRecord.notes && (
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <p className="text-xs text-muted-foreground">{t("notes")}</p>
                      <p className="mt-0.5">{viewRecord.notes}</p>
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

      <Dialog open={dialog.open} onOpenChange={(open) => { setDialog({ open }); if (!open) { setSellMode("liters"); setAmountPaid(0); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog.item ? t("editSale") : t("newSaleTransaction")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                // In amount mode: inject calculatedLiters into the form BEFORE
                // Zod validation runs, so the min(0.01) check passes.
                if (sellMode === "amount" && calculatedLiters !== null && calculatedLiters > 0) {
                  form.setValue("liters", calculatedLiters, { shouldValidate: false });
                }
                form.handleSubmit(onSubmit)(e);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pumpNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("pumpNumber")}</FormLabel>
                      <Select value={field.value} onValueChange={handlePumpChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={lang === "ps" ? "پمپ غوره کړئ" : "Select pump"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pumps.filter((p) => p.status === "active").map((p) => (
                            <SelectItem key={p.id} value={p.pumpNumber} textValue={p.pumpNumber}>
                              <div className="flex flex-col">
                                <span className="font-medium">{p.pumpNumber} — {p.name}</span>
                                <span className="text-xs text-muted-foreground">{p.location}</span>
                              </div>
                            </SelectItem>
                          ))}
                          {pumps.filter((p) => p.status !== "active").length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                {lang === "ps" ? "غیرفعال" : "Inactive / Maintenance"}
                              </div>
                              {pumps.filter((p) => p.status !== "active").map((p) => (
                                <SelectItem key={p.id} value={p.pumpNumber} textValue={p.pumpNumber} className="opacity-50">
                                  {p.pumpNumber} — {p.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fuelTypeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fuel")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={handleFuelTypeChange}
                        disabled={!pumpNumber}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={pumpNumber ? t("selectFuel") : (lang === "ps" ? "لومړی پمپ غوره کړئ" : "Select pump first")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {allowedFuelTypes.map((f) => (
                            <SelectItem key={f.id} value={f.id} textValue={f.name}>
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color ?? "#94a3b8" }} />
                                {f.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customerType")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          if (v === "cash") {
                            form.setValue("customerId", "");
                            form.setValue("customerName", "Walk-in");
                            form.setValue("paymentMethod", "cash");
                          } else {
                            form.setValue("paymentMethod", "credit");
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">{t("cash")}</SelectItem>
                          <SelectItem value="credit">{t("credit")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {customerType === "credit" ? (
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("customer")}</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={handleCustomerChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("selectCustomer")} />
                            </SelectTrigger>
                          </FormControl>

                          <SelectContent>
                            {creditCustomers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("customer")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("walkIn")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              {/* ── Sell mode toggle ──────────────────────────────────── */}
              <div className="flex items-center gap-1 rounded-lg border border-input bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => { setSellMode("liters"); setAmountPaid(0); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    sellMode === "liters"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang === "ps" ? "د لیتر له مخه" : "By Liters"}
                </button>
                <button
                  type="button"
                  onClick={() => { setSellMode("amount"); form.setValue("liters", 0); }}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    sellMode === "amount"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang === "ps" ? "د مبلغ له مخه (AFN)" : "By Amount (AFN)"}
                </button>
              </div>

              {/* ── Liters / Price row ─────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                {sellMode === "liters" ? (
                  <FormField
                    control={form.control}
                    name="liters"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("liters")}</FormLabel>
                        <FormControl>
                          <PashtoInput type="number" step="0.01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  /* Amount paid input */
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">
                      {lang === "ps" ? "د مبلغ تادیه (AFN)" : "Amount Paid (AFN)"}
                      {" "}<span className="text-destructive">*</span>
                    </label>
                    <PashtoInput
                      type="number"
                      step="0.01"
                      value={amountPaid || ""}
                      onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
                      placeholder="700"
                    />
                    {/* Calculated liters preview */}
                    {pricePerLiter > 0 && amountPaid > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {amountPaid} ÷ {pricePerLiter} ={" "}
                        <span className="font-semibold text-foreground">
                          {calculatedLiters}L
                        </span>
                      </p>
                    )}
                    {amountPaid > 0 && pricePerLiter <= 0 && (
                      <p className="text-xs text-destructive">
                        {lang === "ps" ? "لومړی د تیلو ډول غوره کړئ" : "Select a fuel type first to get price"}
                      </p>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="pricePerLiter"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("pricePerLiterLabel")}{" "}
                        {user?.role === "operator" ? (
                          <span className="text-xs text-muted-foreground">
                            {t("readOnly")}
                          </span>
                        ) : (
                          ""
                        )}
                      </FormLabel>
                      <FormControl>
                        <PashtoInput
                          type="number"
                          step="0.001"
                          readOnly={user?.role === "operator"}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Total amount */}
                  <span>
                    {lang === "ps" ? "ټوله مبلغ:" : "Total:"}{"  "}
                    <span className="text-base font-bold text-foreground">
                      {fmtCurrency(totalAmount, lang)}
                    </span>
                    {sellMode === "amount" && calculatedLiters !== null && calculatedLiters > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        = <span className="font-semibold text-foreground">{calculatedLiters}L</span>
                      </span>
                    )}
                  </span>

                  {/* Fuel type pill */}
                  {selectedFuelType && (
                    <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium">
                      <span className="h-2 w-2 rounded-full" style={{ background: selectedFuelType.color ?? "#94a3b8" }} />
                      {selectedFuelType.name}
                    </span>
                  )}
                </div>

                {/* Pump → Tank → Available stock */}
                {selectedPump && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    {/* Pump */}
                    <span className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{selectedPump.pumpNumber}</span>
                      {selectedPump.name !== selectedPump.pumpNumber && (
                        <span>— {selectedPump.name}</span>
                      )}
                    </span>

                    {assignedTank ? (
                      <>
                        <span className="text-border">→</span>
                        {/* Tank name */}
                        <span className={assignedTank.status !== "active" ? "font-semibold text-amber-600 dark:text-amber-400" : "font-medium text-foreground"}>
                          {assignedTank.name}
                          {assignedTank.status !== "active" && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400">
                              ({lang === "ps" ? "غیر فعال" : "inactive"})
                            </span>
                          )}
                        </span>
                        {/* Available stock */}
                        <span className="text-border">·</span>
                        <span className={
                          assignedTank.status !== "active"
                            ? "text-amber-600 dark:text-amber-400"
                            : assignedTank.currentStock < assignedTank.minimumLevel
                              ? "font-semibold text-destructive"
                              : "text-foreground"
                        }>
                          {lang === "ps" ? "موجود:" : "Available:"}{"  "}
                          <span className="font-bold">{assignedTank.currentStock.toLocaleString()}L</span>
                          {assignedTank.currentStock < assignedTank.minimumLevel && (
                            <span className="ml-1 text-destructive">⚠ {lang === "ps" ? "کم ذخیره" : "low"}</span>
                          )}
                        </span>
                        {/* Warn if liters requested exceeds stock */}
                        {(sellMode === "amount" ? (calculatedLiters ?? 0) : (liters || 0)) > assignedTank.currentStock && (
                          <span className="font-semibold text-destructive">
                            ⛽ {lang === "ps" ? "د ذخیرې نه ډیر" : "Exceeds available stock"}
                          </span>
                        )}
                      </>
                    ) : fuelTypeId ? (
                      <>
                        <span className="text-border">→</span>
                        <span className="text-destructive">
                          {lang === "ps" ? "هیڅ ټانک ندی ټاکل شوی" : "No tank assigned for this fuel type"}
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("paymentMethod")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">{t("cash")}</SelectItem>
                          <SelectItem value="card">{t("card")}</SelectItem>
                          <SelectItem value="credit">{t("credit")}</SelectItem>
                          <SelectItem value="bank_transfer">
                            {t("bankTransfer")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="transactionType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("transactionType")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="retail">{t("retail")}</SelectItem>
                          <SelectItem value="fleet">{t("fleet")}</SelectItem>
                          <SelectItem value="bulk">{t("bulk")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setDialog({ open: false })}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending ||
                    (sellMode === "amount" && (amountPaid <= 0 || pricePerLiter <= 0 || !calculatedLiters))
                  }
                >
                  {dialog.item ? t("update") : t("recordSale")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sale Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
