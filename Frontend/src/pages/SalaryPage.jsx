/**
 * SalaryPage — Employee Salary Management
 * Admin/Manager: full CRUD + generate monthly payroll + mark as paid
 * Operator: access denied
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  FiPlus, FiEdit2, FiTrash2, FiSearch, FiDollarSign,
  FiCheckCircle, FiClock, FiUsers, FiRefreshCw, FiChevronDown, FiCheck,
} from "react-icons/fi";
import { TablePagination } from "@/components/ui/pagination";
import { useAppSelector } from "@/components/context/hooks";
import { salariesApi, employeesApi } from "@/services/api";
import AppLayout from "@/components/features/layouts/AppLayout";
import { useI18n, fmtCurrency, toArabicNum } from "@/components/context/i18n";
import StatusBadge from "@/components/features/common/StatusBadge";
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
import { Textarea } from "@/components/ui/textarea";

// ── Searchable Employee Combobox ──────────────────────────────────────────────
function EmployeeCombobox({ employees, value, onChange, disabled, lang }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const containerRef          = useRef(null);
  const inputRef              = useRef(null);

  const selected = employees.find((e) => e.employeeId === value);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter((e) =>
      e.fullName.toLowerCase().includes(q) ||
      e.employeeId.toLowerCase().includes(q) ||
      (e.position ?? "").toLowerCase().includes(q)
    );
  }, [employees, query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors
          ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent"}
          ${open ? "ring-2 ring-ring ring-offset-2" : ""}`}
      >
        {selected ? (
          <span className="flex min-w-0 flex-col text-start">
            <span className="truncate font-medium leading-tight">{selected.fullName}</span>
            <span className="truncate text-xs text-muted-foreground leading-tight">
              {selected.position} · {selected.employeeId}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            {lang === "ps" ? "کارمند غوره کړئ" : "Select employee"}
          </span>
        )}
        <FiChevronDown className={`ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {/* Search input */}
          <div className="flex items-center border-b border-border px-3 py-2">
            <FiSearch className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lang === "ps" ? "لټون..." : "Search..."}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                {lang === "ps" ? "کارمند ونه موندل شو" : "No employee found"}
              </p>
            ) : filtered.map((e) => (
              <button
                key={e.employeeId}
                type="button"
                onClick={() => {
                  onChange(e.employeeId);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-accent"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{e.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {e.position} · {e.employeeId}
                  </span>
                </span>
                {e.employeeId === value && (
                  <FiCheck className="h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  employeeId:    z.string().min(1, "Employee is required"),
  month:         z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM"),
  baseSalary:    z.coerce.number().min(1, "Base salary must be > 0"),
  bonus:         z.coerce.number().min(0).default(0),
  deductions:    z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(["cash", "bank_transfer"]),
  status:        z.enum(["paid", "pending", "cancelled"]),
  paymentDate:   z.string().optional(),
  notes:         z.string().optional(),
});

// ── Status badge colours ───────────────────────────────────────────────────────
function SalaryStatusBadge({ status, lang }) {
  const map = {
    paid:      { cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   label: lang === "ps" ? "ادا شوی"  : "Paid"      },
    pending:   { cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: lang === "ps" ? "پاتې"     : "Pending"   },
    cancelled: { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",           label: lang === "ps" ? "لغوه شوی" : "Cancelled" },
  };
  const { cls, label } = map[status] ?? map.pending;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SalaryPage() {
  const { user } = useAppSelector((s) => s.auth);
  const { t, lang } = useI18n();
  const qc = useQueryClient();

  const isAdmin   = user?.role === "admin";
  const isManager = user?.role === "manager";
  if (!isAdmin && !isManager) {
    return (
      <AppLayout title={t("salaryManagement")}>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <FiDollarSign className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const [dialog,         setDialog]         = useState({ open: false });
  const [deleteId,       setDeleteId]       = useState(null);
  const [generateDialog, setGenerateDialog] = useState(false);
  const [generateMonth,  setGenerateMonth]  = useState(() => format(new Date(), "yyyy-MM"));
  const [search,         setSearch]         = useState("");
  const [monthFilter,    setMonthFilter]    = useState(() => format(new Date(), "yyyy-MM"));
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [page,           setPage]           = useState(1);
  const PAGE_SIZE = 10;

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: salaries   = [], isLoading } = useQuery({ queryKey: ["salaries"],  queryFn: salariesApi.getAll });
  const { data: employees  = [] }            = useQuery({ queryKey: ["employees"], queryFn: employeesApi.getAll });

  const empById = Object.fromEntries(employees.map((e) => [e.employeeId, e]));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["salaries"] });
  const generateId = () => `SAL-${String(salaries.length + 1).padStart(3, "0")}`;

  // ── Form ───────────────────────────────────────────────────────────────────
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: "", month: format(new Date(), "yyyy-MM"),
      baseSalary: 0, bonus: 0, deductions: 0,
      paymentMethod: "cash", status: "pending",
      paymentDate: "", notes: "",
    },
  });

  const watchedBase       = form.watch("baseSalary");
  const watchedBonus      = form.watch("bonus");
  const watchedDeductions = form.watch("deductions");
  const watchedStatus     = form.watch("status");
  const netPreview = Math.max(0,
    (toArabicNum(watchedBase) || 0) +
    (toArabicNum(watchedBonus) || 0) -
    (toArabicNum(watchedDeductions) || 0)
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data) => salariesApi.create(data),
    onSuccess: () => { toast.success(t("salaryAdded")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedCreate")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => salariesApi.update(id, data),
    onSuccess: () => { toast.success(t("salaryUpdated")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedUpdate")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => salariesApi.delete(id),
    onSuccess: () => { toast.success(t("salaryDeleted")); invalidate(); setDeleteId(null); },
    onError: () => toast.error(t("failedDelete")),
  });
  const markPaidMutation = useMutation({
    mutationFn: ({ id }) => salariesApi.patch(id, {
      status: "paid",
      paymentDate: format(new Date(), "yyyy-MM-dd"),
    }),
    onSuccess: () => { toast.success(t("salaryPaid")); invalidate(); },
    onError: () => toast.error(t("failedUpdate")),
  });
  const generateMutation = useMutation({
    mutationFn: async (month) => {
      const activeEmps = employees.filter((e) => e.status === "active");
      const existing   = salaries.filter((s) => s.month === month).map((s) => s.employeeId);
      const toCreate   = activeEmps.filter((e) => !existing.includes(e.employeeId));
      if (toCreate.length === 0) throw new Error(lang === "ps" ? "ټول فعال کارمندان مخکې اضافه شوي دي" : "All active employees already have records for this month");
      for (const emp of toCreate) {
        await salariesApi.create({
          salaryId: `SAL-${String(salaries.length + Math.random()).replace(".", "").slice(0, 6)}`,
          employeeId: emp.employeeId,
          month,
          baseSalary: emp.salary ?? 0,
          bonus: 0,
          deductions: 0,
          netSalary: emp.salary ?? 0,
          status: "pending",
          paymentDate: "",
          paymentMethod: "cash",
          notes: "",
        });
      }
      return toCreate.length;
    },
    onSuccess: (count) => { toast.success(`${count} ${lang === "ps" ? "ریکارډونه جوړ شول" : "records generated"}`); invalidate(); setGenerateDialog(false); },
    onError: (e) => toast.error(e.message || t("failedCreate")),
  });

  // ── Dialog handlers ────────────────────────────────────────────────────────
  const openCreate = () => {
    form.reset({
      employeeId: "", month: monthFilter || format(new Date(), "yyyy-MM"),
      baseSalary: 0, bonus: 0, deductions: 0,
      paymentMethod: "cash", status: "pending",
      paymentDate: "", notes: "",
    });
    setDialog({ open: true });
  };

  const openEdit = (item) => {
    form.reset({
      employeeId:    item.employeeId,
      month:         item.month,
      baseSalary:    item.baseSalary,
      bonus:         item.bonus ?? 0,
      deductions:    item.deductions ?? 0,
      paymentMethod: item.paymentMethod ?? "cash",
      status:        item.status,
      paymentDate:   item.paymentDate ?? "",
      notes:         item.notes ?? "",
    });
    setDialog({ open: true, item });
  };

  const onSubmit = (values) => {
    const baseSalary  = toArabicNum(values.baseSalary);
    const bonus       = toArabicNum(values.bonus);
    const deductions  = toArabicNum(values.deductions);
    const netSalary   = Math.max(0, baseSalary + bonus - deductions);

    // Duplicate check: same employee + same month (allow on edit for own record)
    const isDuplicate = salaries.some(
      (s) => s.employeeId === values.employeeId &&
             s.month === values.month &&
             s.id !== dialog.item?.id
    );
    if (isDuplicate) { toast.error(t("duplicateSalary")); return; }

    const data = {
      ...values,
      baseSalary, bonus, deductions, netSalary,
      salaryId:    dialog.item?.salaryId ?? generateId(),
      paymentDate: values.status === "paid" && !values.paymentDate
        ? format(new Date(), "yyyy-MM-dd")
        : (values.paymentDate ?? ""),
    };
    if (dialog.item) updateMutation.mutate({ id: dialog.item.id, data });
    else createMutation.mutate(data);
  };

  // ── Filter & pagination ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return salaries.filter((s) => {
      const emp = empById[s.employeeId];
      if (monthFilter  && s.month  !== monthFilter)  return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q) {
        const hay = [s.salaryId, s.employeeId, emp?.fullName ?? "", emp?.position ?? "", s.month, s.status].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [salaries, search, monthFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalPayroll  = filtered.reduce((s, r) => s + (r.netSalary ?? 0), 0);
  const paidCount     = filtered.filter((r) => r.status === "paid").length;
  const pendingCount  = filtered.filter((r) => r.status === "pending").length;
  const pendingAmount = filtered.filter((r) => r.status === "pending").reduce((s, r) => s + (r.netSalary ?? 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout title={t("salaryManagement")}>
      <div className="space-y-5">

        {/* ── Stat cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalPayroll")}</p>
                  <p className="mt-1 text-xl font-bold">{fmtCurrency(totalPayroll, lang)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{filtered.length} {lang === "ps" ? "ریکارډونه" : "records"}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FiDollarSign className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("paidSalaries")}</p>
                  <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{paidCount}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                  <FiCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${pendingCount > 0 ? "border-l-yellow-500" : "border-l-slate-400"}`}>
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("pendingSalaries")}</p>
                  <p className={`mt-1 text-xl font-bold ${pendingCount > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`}>{pendingCount}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmtCurrency(pendingAmount, lang)}</p>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${pendingCount > 0 ? "bg-yellow-500/10" : "bg-muted"}`}>
                  <FiClock className={`h-5 w-5 ${pendingCount > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{lang === "ps" ? "فعال کارمندان" : "Active Employees"}</p>
                  <p className="mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">{employees.filter((e) => e.status === "active").length}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <FiUsers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* ── Table card ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FiDollarSign className="h-4 w-4 text-primary" />
                {t("salaryList")}
                <Badge variant="secondary" className="font-mono text-xs">{filtered.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setGenerateDialog(true)}>
                  <FiRefreshCw className="mr-1 h-4 w-4" />
                  {t("generatePayroll")}
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <FiPlus className="mr-1 h-4 w-4" /> {t("addSalary")}
                </Button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="relative min-w-[160px] flex-1">
                <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={`${t("fullName")} / ${t("salaryId")}...`}
                  className="h-8 ps-8 text-sm" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{t("month")}</span>
                <Input type="month" value={monthFilter}
                  onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
                  className="h-8 w-36 text-sm" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  <SelectItem value="paid">{lang === "ps" ? "ادا شوی" : "Paid"}</SelectItem>
                  <SelectItem value="pending">{lang === "ps" ? "پاتې" : "Pending"}</SelectItem>
                  <SelectItem value="cancelled">{lang === "ps" ? "لغوه شوی" : "Cancelled"}</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs"
                  onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  {lang === "ps" ? "پاکول" : "Clear"}
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">{[1,2,3].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
                <FiDollarSign className="h-8 w-8 opacity-30" />
                <p className="text-sm">{t("noSalaryRecords")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      {[t("salaryId"), t("employee"), t("month"), t("baseSalary"),
                        t("bonus"), t("deductions"), t("netSalary"),
                        t("paymentMethod"), t("salaryStatus"), t("paymentDate"), t("actions"),
                      ].map((h) => (
                        <th key={h} className={`py-2 pr-4 text-xs font-medium text-muted-foreground first:ps-4 ${h === t("actions") ? "text-end" : "text-start"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((s) => {
                      const emp = empById[s.employeeId];
                      return (
                        <tr key={s.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/40">
                          <td className="py-3 pr-4 ps-4 font-mono text-xs text-muted-foreground">{s.salaryId}</td>
                          <td className="py-3 pr-4">
                            <p className="text-sm font-medium">{emp?.fullName ?? s.employeeId}</p>
                            <p className="text-xs text-muted-foreground">{emp?.position ?? ""}</p>
                          </td>
                          <td className="py-3 pr-4 text-sm">{s.month}</td>
                          <td className="py-3 pr-4 text-sm">{fmtCurrency(s.baseSalary, lang)}</td>
                          <td className="py-3 pr-4 text-sm text-green-600 dark:text-green-400">
                            {s.bonus > 0 ? `+${fmtCurrency(s.bonus, lang)}` : "—"}
                          </td>
                          <td className="py-3 pr-4 text-sm text-destructive">
                            {s.deductions > 0 ? `-${fmtCurrency(s.deductions, lang)}` : "—"}
                          </td>
                          <td className="py-3 pr-4 text-sm font-bold">{fmtCurrency(s.netSalary, lang)}</td>
                          <td className="py-3 pr-4">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                              {s.paymentMethod?.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3 pr-4"><SalaryStatusBadge status={s.status} lang={lang} /></td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">{s.paymentDate || "—"}</td>
                          <td className="py-3 pe-3 text-end">
                            <div className="flex items-center justify-end gap-1">
                              {s.status === "pending" && (
                                <Button variant="ghost" size="sm" title={t("markAsPaid")}
                                  onClick={() => markPaidMutation.mutate({ id: s.id })}
                                  className="h-8 w-8 p-0 text-green-600 hover:text-green-600">
                                  <FiCheckCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" title={t("edit")}
                                onClick={() => openEdit(s)} className="h-8 w-8 p-0">
                                <FiEdit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" title={t("delete")}
                                onClick={() => setDeleteId(s.id)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                                <FiTrash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
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

      {/* ══ Add / Edit dialog ══════════════════════════════════════════════ */}
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.item ? t("editSalary") : t("addSalary")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {/* Employee + Month */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="employeeId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("employee")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <EmployeeCombobox
                        employees={employees.filter((e) => e.status === "active")}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          const emp = employees.find((e) => e.employeeId === v);
                          if (emp) form.setValue("baseSalary", emp.salary ?? 0);
                        }}
                        disabled={!!dialog.item}
                        lang={lang}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="month" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("month")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input type="month" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Base Salary + Bonus */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="baseSalary" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("baseSalaryLabel")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><PashtoInput type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bonus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("bonusLabel")}</FormLabel>
                    <FormControl><PashtoInput type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Deductions + Net preview */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="deductions" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("deductionsLabel")}</FormLabel>
                    <FormControl><PashtoInput type="number" step="1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex flex-col justify-end">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{t("netSalary")}</p>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3">
                    <span className="text-sm font-bold text-foreground">{fmtCurrency(netPreview, lang)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method + Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("paymentMethod")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="cash">{t("cash")}</SelectItem>
                        <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
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
                        <SelectItem value="pending">{lang === "ps" ? "پاتې" : "Pending"}</SelectItem>
                        <SelectItem value="paid">{lang === "ps" ? "ادا شوی" : "Paid"}</SelectItem>
                        <SelectItem value="cancelled">{lang === "ps" ? "لغوه شوی" : "Cancelled"}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Payment Date — only when paid */}
              {watchedStatus === "paid" && (
                <FormField control={form.control} name="paymentDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("paymentDate")}</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {/* Notes */}
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("notes")}</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" type="button" onClick={() => setDialog({ open: false })}>{t("cancel")}</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {dialog.item ? t("update") : t("add")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ══ Generate Monthly Payroll dialog ════════════════════════════════ */}
      <Dialog open={generateDialog} onOpenChange={setGenerateDialog}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FiRefreshCw className="h-4 w-4 text-primary" />
              {t("generatePayroll")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("selectMonth")}</label>
              <Input type="month" value={generateMonth}
                onChange={(e) => setGenerateMonth(e.target.value)}
                className="text-sm" />
            </div>
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {lang === "ps"
                ? "دا عملیه د ټولو فعال کارمندانو لپاره د پاتې حالت سره د معاش ریکارډونه جوړوي چې لا ثبت نه وي."
                : "This will create pending salary records for all active employees who don't yet have one for the selected month."}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGenerateDialog(false)}>{t("cancel")}</Button>
              <Button onClick={() => generateMutation.mutate(generateMonth)} disabled={generateMutation.isPending}>
                <FiRefreshCw className="mr-1.5 h-4 w-4" />
                {generateMutation.isPending
                  ? (lang === "ps" ? "جوړیږي..." : "Generating...")
                  : t("generatePayroll")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Delete confirmation ═════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("areYouSure")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirmMsg")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </AppLayout>
  );
}
