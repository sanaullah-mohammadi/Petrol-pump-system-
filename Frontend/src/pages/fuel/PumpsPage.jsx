/**
 * PumpsPage — Petrol pump management with dynamic tank assignment.
 * Admin / Manager can add pumps, assign fuel types, connect to tanks,
 * and reassign tanks at any time without affecting past sales records.
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  FiPlus, FiEdit2, FiTrash2, FiSearch, FiAlertTriangle,
  FiCheckCircle, FiRefreshCw, FiDroplet, FiMapPin, FiHash,
} from "react-icons/fi";
import { MdOutlineLocalGasStation } from "react-icons/md";

import { pumpsApi, tanksApi, fuelTypesApi, salesApi } from "@/services/api";
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
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// ── Zod schema ────────────────────────────────────────────────────────────────
const schema = z.object({
  name:             z.string().min(1, "Name is required"),
  pumpNumber:       z.string().min(1, "Pump number is required"),
  fuelTypeIds:      z.array(z.string()).min(1, "Select at least one fuel type"),
  tankAssignments:  z.array(z.object({
    fuelTypeId: z.string(),
    tankId:     z.string().min(1, "Select a tank"),
  })).min(1, "Assign a tank to each fuel type"),
  location:         z.string().optional(),
  status:           z.enum(["active", "inactive", "maintenance"]),
  notes:            z.string().optional(),
});

// ── Quick-reassign schema (one tank per fuel type) ────────────────────────────
const reassignSchema = z.object({
  tankAssignments: z.array(z.object({
    fuelTypeId: z.string(),
    tankId:     z.string().min(1, "Select a tank"),
  })),
});

// ── Tank stock badge ──────────────────────────────────────────────────────────
function TankStockBadge({ tank }) {
  if (!tank) return <span className="text-xs text-muted-foreground">—</span>;
  const pct   = tank.capacity > 0 ? Math.round((tank.currentStock / tank.capacity) * 100) : 0;
  const isLow = tank.currentStock < tank.minimumLevel;
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={isLow ? "font-semibold text-destructive" : "text-foreground"}>
          {tank.currentStock.toLocaleString()}L
        </span>
        <span className="text-muted-foreground">{pct}%</span>
        {isLow && <FiAlertTriangle className="h-3 w-3 text-destructive" />}
      </div>
      <Progress
        value={pct}
        className={`h-1.5 ${isLow ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PumpsPage() {
  const qc = useQueryClient();
  const { t, lang } = useI18n();

  // ── State ─────────────────────────────────────────────────────────────────
  const [dialog,         setDialog]         = useState({ open: false });
  const [reassignDialog, setReassignDialog] = useState({ open: false, pump: null });
  const [viewPump,       setViewPump]       = useState(null);
  const [deleteId,       setDeleteId]       = useState(null);
  const [deleteBlocked,  setDeleteBlocked]  = useState(false);
  const [search,         setSearch]         = useState("");
  const [fuelFilter,     setFuelFilter]     = useState("all");
  const [statusFilter,   setStatusFilter]   = useState("all");
  const [page,           setPage]           = useState(1);
  const PAGE_SIZE = 10;

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: pumps      = [], isLoading } = useQuery({ queryKey: ["pumps"],     queryFn: pumpsApi.getAll });
  const { data: tanks      = [] }            = useQuery({ queryKey: ["tanks"],     queryFn: tanksApi.getAll });
  const { data: fuelTypes  = [] }            = useQuery({ queryKey: ["fuelTypes"], queryFn: fuelTypesApi.getAll });
  const { data: sales      = [] }            = useQuery({ queryKey: ["sales"],     queryFn: salesApi.getAll });

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const tankById     = Object.fromEntries(tanks.map((t) => [t.id, t]));
  const ftById       = Object.fromEntries(fuelTypes.map((f) => [f.id, f]));

  // ── Forms ──────────────────────────────────────────────────────────────────
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", pumpNumber: "", fuelTypeIds: [], tankAssignments: [],
      location: "", status: "active", notes: "",
    },
  });

  const reassignForm = useForm({
    resolver: zodResolver(reassignSchema),
    defaultValues: { tankAssignments: [] },
  });

  // ── Invalidate ─────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pumps"] });
  const generateId = () => `PMP-${String(pumps.length + 1).padStart(3, "0")}`;

  // ── Check if pump is in use ────────────────────────────────────────────────
  const isInUse = (id) => {
    const pump = pumps.find((p) => p.id === id);
    if (!pump) return false;
    return sales.some((s) => s.pumpNumber === pump.pumpNumber);
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d) => pumpsApi.create(d),
    onSuccess: () => { toast.success(t("pumpAdded")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedCreate")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => pumpsApi.update(id, data),
    onSuccess: () => { toast.success(t("pumpUpdated")); invalidate(); setDialog({ open: false }); },
    onError: () => toast.error(t("failedUpdate")),
  });
  const reassignMutation = useMutation({
    mutationFn: ({ id, tankAssignments }) => pumpsApi.patch(id, { tankAssignments }),
    onSuccess: () => {
      toast.success(t("tankReassigned"));
      invalidate();
      setReassignDialog({ open: false, pump: null });
    },
    onError: () => toast.error(t("failedUpdate")),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => pumpsApi.delete(id),
    onSuccess: () => { toast.success(t("pumpDeleted")); invalidate(); setDeleteId(null); setDeleteBlocked(false); },
    onError: () => toast.error(t("failedDelete")),
  });

  // ── Dialog handlers ────────────────────────────────────────────────────────
  const openCreate = () => {
    form.reset({ name: "", pumpNumber: "", fuelTypeIds: [], tankAssignments: [], location: "", status: "active", notes: "" });
    setDialog({ open: true });
  };
  const openEdit = (pump) => {
    const fuelTypeIds = Array.isArray(pump.fuelTypeIds)
      ? pump.fuelTypeIds
      : (pump.fuelTypeId ? [pump.fuelTypeId] : []);
    const tankAssignments = Array.isArray(pump.tankAssignments)
      ? pump.tankAssignments
      : (pump.tankId ? [{ fuelTypeId: fuelTypeIds[0] ?? "", tankId: pump.tankId }] : []);
    form.reset({
      name: pump.name, pumpNumber: pump.pumpNumber, fuelTypeIds,
      tankAssignments, location: pump.location ?? "", status: pump.status, notes: pump.notes ?? "",
    });
    setDialog({ open: true, item: pump });
  };
  const openReassign = (pump) => {
    const fuelTypeIds = Array.isArray(pump.fuelTypeIds)
      ? pump.fuelTypeIds
      : (pump.fuelTypeId ? [pump.fuelTypeId] : []);
    const tankAssignments = Array.isArray(pump.tankAssignments)
      ? pump.tankAssignments
      : (pump.tankId ? [{ fuelTypeId: fuelTypeIds[0] ?? "", tankId: pump.tankId }] : []);
    reassignForm.reset({ tankAssignments });
    setReassignDialog({ open: true, pump });
  };
  const handleDeleteClick = (id) => {
    setDeleteBlocked(isInUse(id));
    setDeleteId(id);
  };

  const onSubmit = (values) => {
    const data = {
      ...values,
      pumpId:      dialog.item?.pumpId ?? generateId(),
      installedAt: dialog.item?.installedAt ?? format(new Date(), "yyyy-MM-dd"),
    };
    if (dialog.item) updateMutation.mutate({ id: dialog.item.id, data });
    else createMutation.mutate(data);
  };

  const onReassign = (values) => {
    if (reassignDialog.pump) {
      reassignMutation.mutate({ id: reassignDialog.pump.id, tankAssignments: values.tankAssignments });
    }
  };

  // ── Helper: get tankAssignments array (with old-record fallback) ─────────────
  const getPumpAssignments = (pump) => {
    if (Array.isArray(pump.tankAssignments) && pump.tankAssignments.length > 0)
      return pump.tankAssignments;
    const fuelIds = Array.isArray(pump.fuelTypeIds) ? pump.fuelTypeIds : (pump.fuelTypeId ? [pump.fuelTypeId] : []);
    if (pump.tankId) return [{ fuelTypeId: fuelIds[0] ?? "", tankId: pump.tankId }];
    return [];
  };

  // ── Filter logic ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return pumps.filter((p) => {
      const pFuelIds   = Array.isArray(p.fuelTypeIds) ? p.fuelTypeIds : (p.fuelTypeId ? [p.fuelTypeId] : []);
      const pFuelNames = pFuelIds.map((id) => ftById[id]?.name ?? "").join(" ");
      const assignments = getPumpAssignments(p);
      const tankNames  = assignments.map((a) => tankById[a.tankId]?.name ?? "").join(" ");
      if (q) {
        const hay = [p.name, p.pumpNumber, p.pumpId, p.location ?? "", pFuelNames, tankNames, p.status].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fuelFilter !== "all" && !pFuelIds.includes(fuelFilter)) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return true;
    });
  }, [pumps, tanks, fuelTypes, search, fuelFilter, statusFilter]);

  useEffect(() => { setPage(1); }, [search, fuelFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const activeCount      = pumps.filter((p) => p.status === "active").length;
  const lowTankCount = pumps.filter((p) => {
    const assignments = getPumpAssignments(p);
    return assignments.some((a) => {
      const tank = tankById[a.tankId];
      return tank && (tank.currentStock < tank.minimumLevel || tank.status !== "active");
    });
  }).length;
  const maintenanceCount = pumps.filter((p) => p.status === "maintenance").length;
  const hasFilter        = search || fuelFilter !== "all" || statusFilter !== "all";

  return (
    <AppLayout title={t("pumps")}>
      <div className="space-y-5">

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("totalPumps")}</p>
                  <p className="mt-1 text-xl font-bold">{pumps.length}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <MdOutlineLocalGasStation className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("activePumps")}</p>
                  <p className="mt-1 text-xl font-bold text-green-600 dark:text-green-400">{activeCount}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                  <FiCheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${lowTankCount > 0 ? "border-l-destructive" : "border-l-slate-400"}`}>
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t("lowTankWarning")}</p>
                  <p className={`mt-1 text-xl font-bold ${lowTankCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>{lowTankCount}</p>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${lowTankCount > 0 ? "bg-destructive/10" : "bg-muted"}`}>
                  <FiAlertTriangle className={`h-5 w-5 ${lowTankCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-500">
            <CardContent className="p-4 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{lang === "ps" ? "ساتنه" : "Maintenance"}</p>
                  <p className="mt-1 text-xl font-bold text-yellow-600 dark:text-yellow-400">{maintenanceCount}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500/10">
                  <FiRefreshCw className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
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
                <MdOutlineLocalGasStation className="h-4 w-4 text-primary" />
                {t("pumpList")}
                <Badge variant="secondary" className="font-mono text-xs">{filtered.length}</Badge>
              </CardTitle>
              <Button size="sm" onClick={openCreate}>
                <FiPlus className="mr-1 h-4 w-4" /> {t("addPump")}
              </Button>
            </div>

            {/* Filter bar */}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="relative min-w-[160px] flex-1">
                <FiSearch className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={`${t("name")} / ${t("pumpNumber")} / ${t("location")}...`}
                  className="h-8 ps-8 text-sm" />
              </div>
              <Select value={fuelFilter} onValueChange={setFuelFilter}>
                <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[130px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filterAll")}</SelectItem>
                  <SelectItem value="active">{t("active")}</SelectItem>
                  <SelectItem value="inactive">{t("inactive")}</SelectItem>
                  <SelectItem value="maintenance">{lang === "ps" ? "ساتنه" : "Maintenance"}</SelectItem>
                </SelectContent>
              </Select>
              {hasFilter && (
                <Button variant="ghost" size="sm" className="h-8 self-end text-xs"
                  onClick={() => { setSearch(""); setFuelFilter("all"); setStatusFilter("all"); }}>
                  {lang === "ps" ? "پاکول" : "Clear"}
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
                <MdOutlineLocalGasStation className="h-8 w-8 opacity-30" />
                <p className="text-sm">{t("noPumps")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border">
                      {[t("pumpId"), t("name"), t("pumpNumber"), t("fuel"),
                        t("assignedTank"), lang === "ps" ? "د ټانک ذخیره" : "Tank Stock",
                        t("location"), t("status"), t("actions"),
                      ].map((h) => (
                        <th key={h} className={`py-2 pr-4 text-xs font-medium text-muted-foreground first:ps-4 ${h === t("actions") ? "text-end" : "text-start"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((pump) => {
                      const pFuelIds    = Array.isArray(pump.fuelTypeIds) ? pump.fuelTypeIds : (pump.fuelTypeId ? [pump.fuelTypeId] : []);
                      const pFuelTypes  = pFuelIds.map((id) => ftById[id]).filter(Boolean);
                      const assignments = getPumpAssignments(pump);
                      const anyLow      = assignments.some((a) => { const tk = tankById[a.tankId]; return tk && (tk.currentStock < tk.minimumLevel || tk.status !== "active"); });
                      return (
                        <tr key={pump.id} onClick={() => setViewPump(pump)}
                          className={`cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/40 ${anyLow ? "bg-destructive/5" : ""}`}>
                          <td className="py-3 pr-4 ps-4 font-mono text-xs text-muted-foreground">{pump.pumpId}</td>
                          <td className="py-3 pr-4 text-sm font-medium">{pump.name}</td>
                          <td className="py-3 pr-4">
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">{pump.pumpNumber}</span>
                          </td>

                          {/* Fuel type pills */}
                          <td className="py-3 pr-4">
                            <div className="flex flex-col gap-1">
                              {pFuelTypes.length > 0 ? pFuelTypes.map((ft) => (
                                <span key={ft.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
                                  <span className="h-2 w-2 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                                  {ft.name}
                                </span>
                              )) : <span className="text-xs text-muted-foreground">—</span>}
                            </div>
                          </td>

                          {/* Assigned Tank — one per fuel type */}
                          <td className="py-3 pr-4">
                            <div className="flex flex-col gap-1.5">
                              {assignments.map((a) => {
                                const ft       = ftById[a.fuelTypeId];
                                const tank     = tankById[a.tankId];
                                const low      = tank && tank.currentStock < tank.minimumLevel;
                                const inactive = tank && tank.status !== "active";
                                return (
                                  <div key={a.fuelTypeId} className="flex items-start gap-1.5">
                                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: ft?.color ?? "#94a3b8" }} />
                                    <div>
                                      <p className="text-xs font-medium leading-tight">{tank?.name ?? "—"}</p>
                                      {inactive && (
                                        <p className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                                          <FiAlertTriangle className="h-2.5 w-2.5" />
                                          {lang === "ps" ? "ټانک غیر فعال دی" : "Tank inactive"}
                                        </p>
                                      )}
                                      {!inactive && low && <p className="flex items-center gap-0.5 text-[10px] text-destructive"><FiAlertTriangle className="h-2.5 w-2.5" />{t("lowTankWarning")}</p>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          {/* Tank Stock — one progress bar per fuel type */}
                          <td className="py-3 pr-4">
                            <div className="flex flex-col gap-2">
                              {assignments.map((a) => {
                                const ft       = ftById[a.fuelTypeId];
                                const tank     = tankById[a.tankId];
                                const inactive = tank && tank.status !== "active";
                                if (!tank) return <span key={a.fuelTypeId} className="text-xs text-muted-foreground">—</span>;
                                if (inactive) return (
                                  <div key={a.fuelTypeId} className="flex min-w-[130px] flex-col gap-0.5">
                                    <p className="text-[10px] text-muted-foreground">{ft?.name}</p>
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                      <FiAlertTriangle className="h-3 w-3" />
                                      {lang === "ps" ? "غیر فعال" : "Inactive"}
                                    </span>
                                  </div>
                                );
                                const pct = tank.capacity > 0 ? Math.round((tank.currentStock / tank.capacity) * 100) : 0;
                                const low = tank.currentStock < tank.minimumLevel;
                                return (
                                  <div key={a.fuelTypeId} className="flex min-w-[130px] flex-col gap-0.5">
                                    <p className="text-[10px] text-muted-foreground">{ft?.name}</p>
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className={low ? "font-semibold text-destructive" : "text-foreground"}>{tank.currentStock.toLocaleString()}L</span>
                                      <span className="text-muted-foreground">{pct}%</span>
                                    </div>
                                    <Progress value={pct} className={`h-1.5 ${low ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`} />
                                  </div>
                                );
                              })}
                            </div>
                          </td>

                          <td className="py-3 pr-4 text-sm text-muted-foreground">
                            {pump.location ? <span className="flex items-center gap-1"><FiMapPin className="h-3 w-3" />{pump.location}</span> : "—"}
                          </td>
                          <td className="py-3 pr-4"><StatusBadge status={pump.status} /></td>
                          <td className="py-3 pe-3 text-end">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" title={t("reassignTank")}
                                onClick={(e) => { e.stopPropagation(); openReassign(pump); }}
                                className="h-8 w-8 p-0 text-primary hover:text-primary">
                                <FiRefreshCw className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" title={t("edit")}
                                onClick={(e) => { e.stopPropagation(); openEdit(pump); }}
                                className="h-8 w-8 p-0">
                                <FiEdit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" title={t("delete")}
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(pump.id); }}
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

      {/* ══ View detail dialog ═══════════════════════════════════════════════ */}
      <Dialog open={!!viewPump} onOpenChange={(open) => { if (!open) setViewPump(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          {viewPump && (() => {
            const vpFuelIds    = Array.isArray(viewPump.fuelTypeIds) ? viewPump.fuelTypeIds : (viewPump.fuelTypeId ? [viewPump.fuelTypeId] : []);
            const vpFuelTypes  = vpFuelIds.map((id) => ftById[id]).filter(Boolean);
            const assignments  = getPumpAssignments(viewPump);
            const anyLow       = assignments.some((a) => { const tk = tankById[a.tankId]; return tk && (tk.currentStock < tk.minimumLevel || tk.status !== "active"); });
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">{viewPump.pumpNumber}</span>
                    {viewPump.name}
                    <span className="ms-auto font-mono text-xs text-muted-foreground">{viewPump.pumpId}</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-3">
                    <StatusBadge status={viewPump.status} />
                    {vpFuelTypes.map((ft) => (
                      <div key={ft.id} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                        <span className="text-xs font-medium">{ft.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Per-fuel tank assignments */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("currentTank")}</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => { setViewPump(null); openReassign(viewPump); }}>
                        <FiRefreshCw className="mr-1 h-3 w-3" /> {t("reassignTank")}
                      </Button>
                    </div>
                    {assignments.map((a) => {
                      const ft   = ftById[a.fuelTypeId];
                      const tank = tankById[a.tankId];
                      const isLow      = tank && tank.currentStock < tank.minimumLevel;
                      const isInactive = tank && tank.status !== "active";
                      const pct   = tank && tank.capacity > 0 ? Math.round((tank.currentStock / tank.capacity) * 100) : 0;
                      return (
                        <div key={a.fuelTypeId} className={`rounded-xl border p-3 ${isInactive ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-900/10" : isLow ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30"}`}>
                          <div className="mb-1.5 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ft?.color ?? "#94a3b8" }} />
                            <span className="text-xs font-semibold">{ft?.name}</span>
                            {isInactive && (
                              <span className="ms-auto flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                <FiAlertTriangle className="h-3 w-3" />
                                {lang === "ps" ? "ټانک غیر فعال دی" : "Tank inactive"}
                              </span>
                            )}
                          </div>
                          {tank ? (
                            <>
                              <p className="text-sm font-medium">{tank.name}</p>
                              <p className="text-xs text-muted-foreground">{tank.location}</p>
                              {!isInactive && (
                                <div className="mt-2">
                                  <div className="mb-1 flex justify-between text-xs">
                                    <span className={isLow ? "font-semibold text-destructive" : ""}>{tank.currentStock.toLocaleString()}L / {tank.capacity.toLocaleString()}L</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <Progress value={pct} className={`h-2 ${isLow ? "[&>div]:bg-destructive" : "[&>div]:bg-primary"}`} />
                                  {isLow && <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><FiAlertTriangle className="h-3 w-3" />{t("lowTankWarning")}</p>}
                                </div>
                              )}
                            </>
                          ) : <p className="text-sm text-muted-foreground">—</p>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      { label: t("location"),    value: viewPump.location || "—" },
                      { label: t("installedAt"), value: viewPump.installedAt || "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-0.5 font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                  {viewPump.notes && (
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <p className="text-xs text-muted-foreground">{t("notes")}</p>
                      <p className="mt-0.5">{viewPump.notes}</p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 border-t border-border pt-3">
                    <Button variant="outline" size="sm" onClick={() => { setViewPump(null); handleDeleteClick(viewPump.id); }} className="text-destructive hover:text-destructive">
                      <FiTrash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete")}
                    </Button>
                    <Button size="sm" onClick={() => { const p = viewPump; setViewPump(null); openEdit(p); }}>
                      <FiEdit2 className="mr-1.5 h-3.5 w-3.5" /> {t("edit")}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ══ Quick Reassign Tank dialog ═══════════════════════════════════════ */}
      <Dialog open={reassignDialog.open} onOpenChange={(open) => { if (!open) setReassignDialog({ open: false, pump: null }); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FiRefreshCw className="h-4 w-4 text-primary" />
              {t("reassignTank")}
              {reassignDialog.pump && (
                <span className="ms-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{reassignDialog.pump.pumpNumber}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {reassignDialog.pump && (
            <div className="space-y-4">
              <Form {...reassignForm}>
                <form onSubmit={reassignForm.handleSubmit(onReassign)} className="space-y-3">
                  {(() => {
                    const pump       = reassignDialog.pump;
                    const fuelIds    = Array.isArray(pump.fuelTypeIds) ? pump.fuelTypeIds : (pump.fuelTypeId ? [pump.fuelTypeId] : []);
                    const assignments = reassignForm.watch("tankAssignments") ?? [];
                    return fuelIds.map((ftId) => {
                      const ft      = ftById[ftId];
                      const current = assignments.find((a) => a.fuelTypeId === ftId);
                      const currentTank = tankById[current?.tankId];
                      const isLow   = currentTank && currentTank.currentStock < currentTank.minimumLevel;
                      const compatibleTanks = tanks.filter((tk) => tk.fuelTypeId === ftId);
                      return (
                        <div key={ftId} className="rounded-lg border border-border p-3">
                          {/* Fuel type label */}
                          <div className="mb-2 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ft?.color ?? "#94a3b8" }} />
                            <span className="text-sm font-semibold">{ft?.name}</span>
                            {isLow && <span className="ms-auto flex items-center gap-1 text-xs text-destructive"><FiAlertTriangle className="h-3 w-3" />{t("lowTankWarning")}</span>}
                          </div>
                          {/* Current */}
                          {currentTank && (
                            <p className="mb-1.5 text-xs text-muted-foreground">
                              {lang === "ps" ? "اوسنی:" : "Current:"} <span className="font-medium text-foreground">{currentTank.name}</span>
                              {" "}({currentTank.currentStock.toLocaleString()}L)
                            </p>
                          )}
                          {/* Select new tank */}
                          <Select
                            value={current?.tankId ?? ""}
                            onValueChange={(newTankId) => {
                              const updated = assignments.filter((a) => a.fuelTypeId !== ftId);
                              reassignForm.setValue("tankAssignments", [...updated, { fuelTypeId: ftId, tankId: newTankId }]);
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("assignTank")} /></SelectTrigger>
                            <SelectContent>
                              {compatibleTanks.filter((tk) => tk.status === "active").map((tk) => {
                                const pct = tk.capacity > 0 ? Math.round((tk.currentStock / tk.capacity) * 100) : 0;
                                const low = tk.currentStock < tk.minimumLevel;
                                return (
                                  <SelectItem key={tk.id} value={tk.id} textValue={tk.name}>
                                    <span className={low ? "text-destructive" : ""}>{tk.name}</span>
                                    <span className="ms-1 text-xs text-muted-foreground">({tk.currentStock.toLocaleString()}L · {pct}%{low ? " ⚠" : ""})</span>
                                  </SelectItem>
                                );
                              })}
                              {compatibleTanks.filter((tk) => tk.status !== "active").length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{t("inactive")}</div>
                                  {compatibleTanks.filter((tk) => tk.status !== "active").map((tk) => (
                                    <SelectItem key={tk.id} value={tk.id} textValue={tk.name} className="opacity-60">{tk.name}</SelectItem>
                                  ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    });
                  })()}
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {lang === "ps"
                      ? "د ټانک بدلول د تیر پلور ریکارډونو باندې اغیز نه کوي."
                      : "Reassigning tanks does not affect any previous sales records."}
                  </p>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" type="button" onClick={() => setReassignDialog({ open: false, pump: null })}>{t("cancel")}</Button>
                    <Button type="submit" disabled={reassignMutation.isPending}>
                      <FiRefreshCw className="mr-1.5 h-4 w-4" /> {t("reassignTank")}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══ Add / Edit dialog ════════════════════════════════════════════════ */}
      <Dialog open={dialog.open} onOpenChange={(open) => setDialog({ open })}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog.item ? t("editPump") : t("addPump")}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Name + Pump Number */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("name")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="Pump P1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="pumpNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("pumpNumber")} <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="P1" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Fuel Types (multi-checkbox) */}
              <FormField control={form.control} name="fuelTypeIds" render={({ field }) => {
                const selected = field.value ?? [];
                return (
                  <FormItem>
                    <FormLabel>{t("fuel")} <span className="text-destructive">*</span></FormLabel>
                    <div className="flex flex-wrap gap-2 rounded-md border border-input bg-background p-2">
                      {fuelTypes.filter((ft) => ft.status === "active").map((ft) => {
                        const checked = selected.includes(ft.id);
                        return (
                          <label key={ft.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked
                                  ? selected.filter((id) => id !== ft.id)
                                  : [...selected, ft.id];
                                field.onChange(next);
                                // Keep tankAssignments in sync: remove entry if fuel type deselected
                                const currentAssignments = form.getValues("tankAssignments") ?? [];
                                const nextAssignments = next.map((id) => ({
                                  fuelTypeId: id,
                                  tankId: currentAssignments.find((a) => a.fuelTypeId === id)?.tankId ?? "",
                                }));
                                form.setValue("tankAssignments", nextAssignments, { shouldValidate: true });
                              }}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ft.color ?? "#94a3b8" }} />
                            {ft.name}
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }} />

              {/* Per-fuel-type tank assignment */}
              {(() => {
                const selectedFuelIds = form.watch("fuelTypeIds") ?? [];
                const assignments     = form.watch("tankAssignments") ?? [];
                if (selectedFuelIds.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-medium leading-none">
                      {t("assignedTank")} <span className="text-destructive">*</span>
                    </p>
                    {selectedFuelIds.map((ftId) => {
                      const ft             = ftById[ftId];
                      const current        = assignments.find((a) => a.fuelTypeId === ftId);
                      const compatibleTanks = tanks.filter((tk) => tk.fuelTypeId === ftId);
                      const fieldError     = form.formState.errors.tankAssignments;
                      return (
                        <div key={ftId} className="rounded-lg border border-input bg-background p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: ft?.color ?? "#94a3b8" }} />
                            <span className="text-xs font-semibold">{ft?.name}</span>
                          </div>
                          <Select
                            value={current?.tankId ?? ""}
                            onValueChange={(newTankId) => {
                              const updated = assignments.filter((a) => a.fuelTypeId !== ftId);
                              form.setValue(
                                "tankAssignments",
                                [...updated, { fuelTypeId: ftId, tankId: newTankId }],
                                { shouldValidate: true },
                              );
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder={t("assignTank")} />
                            </SelectTrigger>
                            <SelectContent>
                              {compatibleTanks.filter((tk) => tk.status === "active").map((tk) => {
                                const low = tk.currentStock < tk.minimumLevel;
                                const pct = tk.capacity > 0 ? Math.round((tk.currentStock / tk.capacity) * 100) : 0;
                                return (
                                  <SelectItem key={tk.id} value={tk.id} textValue={tk.name}>
                                    <span className={low ? "text-destructive" : ""}>{tk.name}</span>
                                    <span className="ms-1 text-xs text-muted-foreground">
                                      ({tk.currentStock.toLocaleString()}L · {pct}%{low ? " ⚠" : ""})
                                    </span>
                                  </SelectItem>
                                );
                              })}
                              {compatibleTanks.filter((tk) => tk.status !== "active").length > 0 && (
                                <>
                                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{t("inactive")}</div>
                                  {compatibleTanks.filter((tk) => tk.status !== "active").map((tk) => (
                                    <SelectItem key={tk.id} value={tk.id} textValue={tk.name} className="opacity-60">{tk.name}</SelectItem>
                                  ))}
                                </>
                              )}
                              {compatibleTanks.length === 0 && (
                                <div className="px-2 py-2 text-xs text-muted-foreground">
                                  {lang === "ps" ? "هیڅ ټانک شتون نلري" : "No tanks available for this fuel type"}
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                    {form.formState.errors.tankAssignments && (
                      <p className="text-[0.8rem] font-medium text-destructive">
                        {lang === "ps" ? "هر د ایندهن ډول لپاره یو ټانک غوره کړئ" : "Select a tank for each fuel type"}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Location + Status */}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("location")}</FormLabel>
                    <FormControl><Input placeholder="Zone A — North Side" {...field} /></FormControl>
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
                        <SelectItem value="maintenance">{lang === "ps" ? "ساتنه" : "Maintenance"}</SelectItem>
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
              {deleteBlocked && <FiAlertTriangle className="h-5 w-5 text-destructive" />}
              {deleteBlocked ? t("cannotDeletePumpInUse") : t("areYouSure")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlocked
                ? (lang === "ps"
                  ? "دا پمپ د پلور سوابق لري. لومړی هغه ریکارډونه لرې کړئ."
                  : "This pump has linked sales records. Remove those sales first.")
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
