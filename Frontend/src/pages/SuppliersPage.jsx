/**
 * SuppliersPage — Supplier registration & management.
 * Features: CRUD, stat cards, search/filter, detail view, i18n Pashto/English
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  FiPlus, FiEdit2, FiTrash2, FiSearch, FiTruck,
  FiPhone, FiMail, FiMapPin, FiUser, FiPackage, FiAlertCircle,
} from "react-icons/fi";

import { suppliersApi, purchasesApi, fuelTypesApi } from "@/services/api";
import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency } from "@/components/context/i18n";
import StatusBadge from "@/components/features/common/StatusBadge";
import { TablePagination } from "@/components/ui/pagination";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const PAYMENT_TERMS = ["cod", "net15", "net30", "net60", "advance"];

const PAYMENT_TERM_LABELS = {
  cod:     { en: "Cash on Delivery", ps: "نقده تحویل" },
  net15:   { en: "Net 15 Days",      ps: "۱۵ ورځې" },
  net30:   { en: "Net 30 Days",      ps: "۳۰ ورځې" },
  net60:   { en: "Net 60 Days",      ps: "۶۰ ورځې" },
  advance: { en: "Advance Payment",  ps: "مخکیني تادیه" },
};

const schema = z.object({
  companyName:   z.string().min(1, "Company name is required"),
  contactPerson: z.string().min(1, "Contact person is required"),
  phone:         z.string()
    .min(10, "Phone must be exactly 10 digits")
    .max(10, "Phone must be exactly 10 digits")
    .regex(/^\d{10}$/, "Phone must be 10 digits only"),
  email:         z.string().email("Invalid email").or(z.literal("")).optional(),
  address:       z.string().optional(),
  fuelTypes:     z.array(z.string()).min(1, "Select at least one fuel type"),
  paymentTerms:  z.string().min(1, "Payment terms required"),
  status:        z.enum(["active", "inactive"]),
  notes:         z.string().optional(),
});

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { t, lang } = useI18n();

  const [dialog,     setDialog]     = useState({ open: false });
  const [deleteId,   setDeleteId]   = useState(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [viewRecord, setViewRecord] = useState(null);
  const [search,     setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 10;

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn:  suppliersApi.getAll,
  });
  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn:  purchasesApi.getAll,
  });
  const { data: fuelTypes = [] } = useQuery({
    queryKey: ["fuelTypes"],
    queryFn:  fuelTypesApi.getAll,
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: "", contactPerson: "", phone: "", email: "",
      address: "", fuelTypes: [], paymentTerms: "net30",
      status: "active", notes: "",
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["suppliers"] });
  const generateId = () =>
    `SUP-${String(suppliers.length + 1).padStart(3, "0")}`;

  const isInUse = (id) => {
    const sup = suppliers.find((s) => s.id === id);
    if (!sup) return false;
    return purchases.some((p) => p.supplierName === sup.companyName);
  };

  const createMutation = useMutation({
    mutationFn: (d) => suppliersApi.create(d),
    onSuccess: () => { toast.success(t("supplierAdded")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedCreate")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => suppliersApi.update(id, data),
    onSuccess: () => { toast.success(t("supplierUpdated")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedUpdate")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => suppliersApi.delete(id),
    onSuccess: () => { toast.success(t("supplierDeleted")); invalidate(); setDeleteId(null); setDeleteBlocked(false); },
    onError: () => toast.error(t("failedDelete")),
  });

  const openCreate = () => {
    form.reset({
      companyName: "", contactPerson: "", phone: "", email: "",
      address: "", fuelTypes: [], paymentTerms: "net30",
      status: "active", notes: "",
    });
    setDialog({ open: true });
  };

  const openEdit = (item) => {
    form.reset({
      companyName:   item.companyName,
      contactPerson: item.contactPerson,
      phone:         item.phone,
      email:         item.email ?? "",
      address:       item.address ?? "",
      fuelTypes:     Array.isArray(item.fuelTypes) ? item.fuelTypes : [],
      paymentTerms:  item.paymentTerms,
      status:        item.status,
      notes:         item.notes ?? "",
    });
    setDialog({ open: true, item });
  };

  const onSubmit = (values) => {
    const data = {
      ...values,
      supplierId:   dialog.item?.supplierId ?? generateId(),
      registeredAt: dialog.item?.registeredAt ?? format(new Date(), "yyyy-MM-dd"),
    };
    if (dialog.item) updateMutation.mutate({ id: dialog.item.id, data });
    else createMutation.mutate(data);
  };

  const handleDeleteClick = (id) => {
    setDeleteBlocked(isInUse(id));
    setDeleteId(id);
  };

  const ptLabel = (key) => PAYMENT_TERM_LABELS[key]?.[lang] ?? key;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...suppliers]
      .sort((a, b) => (b.registeredAt ?? "").localeCompare(a.registeredAt ?? ""))
      .filter((s) => {
        if (q) {
          const fuelTypeNames = Array.isArray(s.fuelTypes) ? s.fuelTypes.join(" ") : (s.fuelTypesSupplied ?? "");
          const haystack = [
            s.supplierId ?? "",
            s.companyName,
            s.contactPerson,
            s.phone,
            s.email ?? "",
            s.address ?? "",
            s.paymentTerms,
            ptLabel(s.paymentTerms),
            s.status,
            fuelTypeNames,
          ].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (statusFilter !== "all" && s.status !== statusFilter) return false;
        return true;
      });
  }, [suppliers, search, statusFilter, lang]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeCount   = suppliers.filter((s) => s.status === "active").length;
  const inactiveCount = suppliers.filter((s) => s.status === "inactive").length;
  const hasFilter     = search || statusFilter !== "all";

  const purchaseCountFor = (name) => purchases.filter((p) => p.supplierName === name).length;
  const totalSpendFor   = (name) => purchases
    .filter((p) => p.supplierName === name)
    .reduce((a, p) => a + (p.totalAmount ?? 0), 0);

  return (
    <AppLayout title={t("suppliers")}>
      <div className="space-y-5">

        {/* ── Stat cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="px-5 pb-5 pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalSuppliers")}</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{suppliers.length}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FiTruck className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="px-5 pb-5 pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("activeSuppliers")}</p>
                  <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{activeCount}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                  <FiPackage className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 border-l-4 border-l-orange-500 lg:col-span-1">
            <CardContent className="px-5 pb-5 pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("inactiveSuppliers")}</p>
                  <p className="mt-1 text-xl font-bold text-orange-600 dark:text-orange-400">{inactiveCount}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                  <FiAlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* ── Main table card ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FiTruck className="h-4 w-4 text-primary" />
                {t("supplierList")}
                <Badge variant="secondary" className="font-mono text-xs">{filtered.length}</Badge>
              </CardTitle>
              <Button size="sm" onClick={openCreate}>
                <FiPlus className="mr-1 h-4 w-4" /> {t("addSupplier")}
              </Button>
            </div>

            {/* Filter bar */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[160px] flex-1">
                <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={`${t("companyName")} / ID...`} className="h-8 ps-8 text-sm" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  <SelectItem value="active">{t("active")}</SelectItem>
                  <SelectItem value="inactive">{t("inactive")}</SelectItem>
                </SelectContent>
              </Select>
              {hasFilter && (
                <Button variant="ghost" size="sm" className="h-8 text-xs"
                  onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  {lang === "ps" ? "پاکول ×" : "Clear ×"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <FiTruck className="h-8 w-8 opacity-30" />
                <p className="text-sm">{lang === "ps" ? "کوم عرضه کوونکی ونه موندل شو" : "No suppliers found"}</p>
              </div>
            ) : (
              <>
                {/* ── Table (horizontally scrollable on all screen sizes) ── */}
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border">
                        {["ID", t("companyName"), t("contactPerson"), t("phone"),
                          t("fuelTypesSupplied"), t("paymentTerms"), t("status"),
                          t("totalPurchasesFromSupplier"), t("actions"),
                        ].map((h) => (
                          <th key={h} className={`py-2 pr-4 text-xs font-medium text-muted-foreground first:ps-4 ${h === t("actions") ? "text-end" : "text-start"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((s) => (
                        <tr key={s.id} onClick={() => setViewRecord(s)}
                          className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          <td className="py-3 pr-4 ps-4 font-mono text-xs text-muted-foreground">{s.supplierId}</td>
                          <td className="py-3 pr-4 text-sm font-medium">{s.companyName}</td>
                          <td className="py-3 pr-4 text-sm text-muted-foreground">{s.contactPerson}</td>
                          <td className="py-3 pr-4 text-sm text-muted-foreground">{s.phone}</td>
                          <td className="py-3 pr-4 text-sm text-muted-foreground max-w-[140px] truncate">
                            {Array.isArray(s.fuelTypes) ? s.fuelTypes.join(", ") : (s.fuelTypesSupplied || "—")}
                          </td>
                          <td className="py-3 pr-4 text-sm text-muted-foreground">{ptLabel(s.paymentTerms)}</td>
                          <td className="py-3 pr-4"><StatusBadge status={s.status} /></td>
                          <td className="py-3 pr-4 text-sm">
                            <span className="font-semibold text-foreground">{purchaseCountFor(s.companyName)}</span>
                            <span className="ms-1 text-xs text-muted-foreground">({fmtCurrency(totalSpendFor(s.companyName), lang)})</span>
                          </td>
                          <td className="py-3 pe-3 text-end">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                                className="h-8 w-8 p-0" title={t("edit")}>
                                <FiEdit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteClick(s.id); }}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive" title={t("delete")}>
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <TablePagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </CardContent>
        </Card>
      </div>

      {/* ══ Detail view dialog ══════════════════════════════════════════════ */}
      <Dialog open={!!viewRecord} onOpenChange={(open) => { if (!open) setViewRecord(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          {viewRecord && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                    <FiTruck className="h-4 w-4 text-primary" />
                  </div>
                  {viewRecord.companyName}
                  <span className="ms-auto font-mono text-xs text-muted-foreground">{viewRecord.supplierId}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3">
                  <StatusBadge status={viewRecord.status} />
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {ptLabel(viewRecord.paymentTerms)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    { label: t("contactPerson"), value: viewRecord.contactPerson, icon: FiUser },
                    { label: t("phone"),         value: viewRecord.phone,         icon: FiPhone },
                    { label: t("email"),         value: viewRecord.email || "—",  icon: FiMail },
                    { label: t("address"),       value: viewRecord.address || "—",icon: FiMapPin },
                    { label: t("fuelTypesSupplied"),
                      value: Array.isArray(viewRecord.fuelTypes) ? viewRecord.fuelTypes.join(", ") : (viewRecord.fuelTypesSupplied || "—"),
                      icon: FiPackage },
                    { label: t("registeredAt"),  value: viewRecord.registeredAt || "—", icon: null },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {Icon && <Icon className="h-3 w-3" />} {label}
                      </p>
                      <p className="mt-0.5 font-medium">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{t("totalPurchasesFromSupplier")}</p>
                  <p className="mt-0.5 text-sm font-bold text-foreground">
                    {purchaseCountFor(viewRecord.companyName)} {lang === "ps" ? "پیرودنې" : "purchases"}
                    {" — "}<span className="text-primary">{fmtCurrency(totalSpendFor(viewRecord.companyName), lang)}</span>
                  </p>
                </div>
                {viewRecord.notes && (
                  <div className="rounded-lg border border-border bg-card p-3 text-sm">
                    <p className="text-xs text-muted-foreground">{t("notes")}</p>
                    <p className="mt-0.5">{viewRecord.notes}</p>
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <Button variant="outline" size="sm" onClick={() => { setViewRecord(null); handleDeleteClick(viewRecord.id); }}
                    className="text-destructive hover:text-destructive">
                    <FiTrash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete")}
                  </Button>
                  <Button size="sm" onClick={() => { const r = viewRecord; setViewRecord(null); openEdit(r); }}>
                    <FiEdit2 className="mr-1.5 h-3.5 w-3.5" /> {t("edit")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ Add / Edit dialog ═══════════════════════════════════════════════ */}
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.item ? t("editSupplier") : t("addSupplier")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Company Name + Contact Person */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="companyName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("companyName")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="Al-Baraka Petroleum" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactPerson" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("contactPerson")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="Ahmad Karimi" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("phone")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        placeholder="0700123456"
                        maxLength={10}
                        inputMode="numeric"
                        onKeyDown={(e) => {
                          if (!/[\d]/.test(e.key) && !["Backspace","Delete","Tab","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("email")}</FormLabel>
                    <FormControl><Input type="email" placeholder="supplier@email.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Address */}
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("address")}</FormLabel>
                  <FormControl><Input placeholder="Kabul Industrial Zone, Block 3" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Fuel Types Supplied — searchable multi-select dropdown from registered fuel types */}
              <FormField control={form.control} name="fuelTypes" render={({ field }) => {
                const [open, setOpen] = useState(false);
                const [ftSearch, setFtSearch] = useState("");
                const selected = field.value ?? [];
                const activeFuelTypes = fuelTypes.filter((ft) => ft.status === "active");
                const filteredFt = activeFuelTypes.filter((ft) =>
                  ft.name.toLowerCase().includes(ftSearch.toLowerCase())
                );
                return (
                  <FormItem>
                    <FormLabel>{t("fuelTypesSupplied")} <span className="text-destructive">*</span></FormLabel>
                    <div className="relative">
                      {/* Trigger button */}
                      <button
                        type="button"
                        onClick={() => { setOpen((v) => !v); setFtSearch(""); }}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground"}>
                          {selected.length === 0
                            ? (lang === "ps" ? "د تیلو ډول غوره کړئ" : "Select fuel types...")
                            : selected.join(", ")}
                        </span>
                        <svg className="h-4 w-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>

                      {/* Dropdown panel */}
                      {open && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
                            {/* Search box */}
                            <div className="border-b border-border p-2">
                              <input
                                autoFocus
                                value={ftSearch}
                                onChange={(e) => setFtSearch(e.target.value)}
                                placeholder={lang === "ps" ? "لټون..." : "Search fuel type..."}
                                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                              />
                            </div>
                            {/* Scrollable list */}
                            <div className="max-h-48 overflow-y-auto">
                              {filteredFt.map((ft) => {
                                const checked = selected.includes(ft.name);
                                return (
                                  <div
                                    key={ft.id}
                                    onClick={() => {
                                      field.onChange(
                                        checked
                                          ? selected.filter((v) => v !== ft.name)
                                          : [...selected, ft.name]
                                      );
                                    }}
                                    className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60 ${checked ? "bg-primary/5" : ""}`}
                                  >
                                    <span
                                      className="h-3 w-3 shrink-0 rounded-full ring-1 ring-border"
                                      style={{ background: ft.color ?? "#94a3b8" }}
                                    />
                                    <span className="flex-1">{ft.name}</span>
                                    {checked && (
                                      <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="m5 13 4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                );
                              })}
                              {filteredFt.length === 0 && (
                                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                                  {lang === "ps" ? "کوم د تیلو ډول ونه موندل شو" : "No fuel types found"}
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }} />

              {/* Payment Terms + Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="paymentTerms" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("paymentTerms")} <span className="text-destructive">*</span></FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PAYMENT_TERMS.map((pt) => (
                          <SelectItem key={pt} value={pt}>{PAYMENT_TERM_LABELS[pt]?.en ?? pt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("status")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="active">{t("active")}</SelectItem>
                        <SelectItem value="inactive">{t("inactive")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Notes */}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("notes")}</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setDialog({ open: false })}>{t("cancel")}</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {dialog.item ? t("update") : t("add")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ══ Delete confirmation ══════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteBlocked(false); } }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {deleteBlocked && <FiAlertCircle className="h-5 w-5 text-destructive" />}
              {deleteBlocked ? t("cannotDeleteSupplierInUse") : t("areYouSure")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlocked
                ? (lang === "ps"
                  ? "دا عرضه کوونکی د پیرودنو سوابق لري. لومړی هغه پیرودنې لرې کړئ."
                  : "This supplier has linked purchase records. Remove those purchases first.")
                : t("deleteConfirmMsg")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            {!deleteBlocked && (
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t("delete")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
}
