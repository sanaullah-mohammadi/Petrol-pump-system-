import { useState, useMemo, useRef, useLayoutEffect } from "react";

import { Link, useLocation, useNavigate } from "react-router-dom";

import { clsx } from "clsx";
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiBell,
  FiChevronDown,
  FiChevronRight,
  FiChevronLeft,
  FiCreditCard,
  FiDroplet,
  FiFileText,
  FiGlobe,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiShoppingCart,
  FiSun,
  FiTrendingUp,
  FiUserCheck,
  FiUsers,
  FiDollarSign,
  FiX,
  FiCheckCircle,
  FiClock,
} from "react-icons/fi";
import { MdReceiptLong } from "react-icons/md";
import { useQuery } from "@tanstack/react-query";

import { logout } from "@/components/context/authSlice";
import { useAppDispatch, useAppSelector } from "@/components/context/hooks";
import { useI18n } from "@/components/context/i18n";
import { tanksApi, salariesApi, purchasesApi } from "@/services/api";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Live notifications hook ──────────────────────────────────────────────────
function useNotifications() {
  const { lang } = useI18n();
  const { data: tanks     = [] } = useQuery({ queryKey: ["tanks"],     queryFn: tanksApi.getAll,     staleTime: 60_000 });
  const { data: salaries  = [] } = useQuery({ queryKey: ["salaries"],  queryFn: salariesApi.getAll,  staleTime: 60_000 });
  const { data: purchases = [] } = useQuery({ queryKey: ["purchases"], queryFn: purchasesApi.getAll, staleTime: 60_000 });

  return useMemo(() => {
    const items = [];

    // 1. Low / critical tank stock
    tanks.forEach((tk) => {
      if (tk.status !== "active") return;
      const pct = tk.capacity > 0 ? (tk.currentStock / tk.capacity) * 100 : 0;
      if (tk.currentStock <= tk.minimumLevel) {
        items.push({
          id: `tank-low-${tk.id}`,
          type: "danger",
          icon: FiDroplet,
          title: lang === "ps" ? `د ټانک کم ذخیره: ${tk.name}` : `Low Tank Stock: ${tk.name}`,
          desc: lang === "ps"
            ? `${tk.currentStock.toLocaleString()}L پاتې — د لږتر لږه کچې لاندې`
            : `${tk.currentStock.toLocaleString()}L remaining — below minimum level`,
          path: "/fuel/tanks",
        });
      } else if (pct < 25) {
        items.push({
          id: `tank-warn-${tk.id}`,
          type: "warning",
          icon: FiDroplet,
          title: lang === "ps" ? `د ټانک خبرداری: ${tk.name}` : `Tank Warning: ${tk.name}`,
          desc: lang === "ps"
            ? `${Math.round(pct)}% ظرفیت پاتې دی`
            : `${Math.round(pct)}% capacity remaining`,
          path: "/fuel/tanks",
        });
      }
    });

    // 2. Pending salary records
    const pendingSalaries = salaries.filter((s) => s.status === "pending");
    if (pendingSalaries.length > 0) {
      items.push({
        id: "salary-pending",
        type: "warning",
        icon: FiDollarSign,
        title: lang === "ps" ? "پاتې معاشونه" : "Pending Salaries",
        desc: lang === "ps"
          ? `${pendingSalaries.length} کارمندان معاش نه دی ترلاسه کړی`
          : `${pendingSalaries.length} employee${pendingSalaries.length > 1 ? "s" : ""} awaiting salary payment`,
        path: "/salary",
      });
    }

    // 3. Unpaid purchases
    const unpaidPurchases = purchases.filter((p) => p.paymentStatus === "unpaid");
    if (unpaidPurchases.length > 0) {
      items.push({
        id: "purchases-unpaid",
        type: "danger",
        icon: FiCreditCard,
        title: lang === "ps" ? "نادا شوي پیرودنې" : "Unpaid Purchases",
        desc: lang === "ps"
          ? `${unpaidPurchases.length} پیرودنې د تادیې پاتې دي`
          : `${unpaidPurchases.length} purchase${unpaidPurchases.length > 1 ? "s" : ""} awaiting payment`,
        path: "/fuel/purchases",
      });
    }

    // 4. Partial purchases
    const partialPurchases = purchases.filter((p) => p.paymentStatus === "partial");
    if (partialPurchases.length > 0) {
      items.push({
        id: "purchases-partial",
        type: "info",
        icon: FiClock,
        title: lang === "ps" ? "نيمه ادا شوي پیرودنې" : "Partially Paid Purchases",
        desc: lang === "ps"
          ? `${partialPurchases.length} پیرودنې برخه‌ایي ادا شوي`
          : `${partialPurchases.length} purchase${partialPurchases.length > 1 ? "s" : ""} partially paid`,
        path: "/fuel/purchases",
      });
    }

    return items;
  }, [tanks, salaries, purchases, lang]);
}

// ─── Nav items (keys resolved via t() at render time) ────────────────────────
function useNavItems() {
  const { t } = useI18n();
  return [
    { labelKey: "dashboard", path: "/dashboard", icon: FiGrid },
    {
      labelKey: "fuelManagement",
      icon: FiDroplet,
      children: [
        { labelKey: "fuelTypes",  path: "/fuel/types" },
        { labelKey: "tanks",      path: "/fuel/tanks" },
        { labelKey: "purchases",  path: "/fuel/purchases" },
        { labelKey: "pumps",      path: "/fuel/pumps" },
        { labelKey: "suppliers",  path: "/suppliers" },
      ],
      roles: ["admin", "manager"],
    },
    { labelKey: "fuelSales", path: "/sales", icon: FiShoppingCart },
    {
      labelKey: "employeeSales",
      path: "/employee-sales",
      icon: FiBarChart2,
    },
    {
      labelKey: "employees",
      path: "/employees",
      icon: FiUsers,
      roles: ["admin", "manager"],
    },
    {
      labelKey: "salaryManagement",
      path: "/salary",
      icon: FiDollarSign,
      roles: ["admin", "manager"],
    },
    { labelKey: "customers", path: "/customers", icon: FiUserCheck },
    // Cash handovers: operators submit; managers/admins also have full accounts menu
    {
      labelKey: "cashHandovers",
      path: "/accounts/handovers",
      icon: FiCreditCard,
      roles: ["operator"],
    },
    {
      labelKey: "accountsCash",
      icon: FiCreditCard,
      roles: ["admin", "manager"],
      children: [
        { labelKey: "accountsPayable", path: "/accounts/payable" },
        { labelKey: "cashHandovers",   path: "/accounts/handovers" },
        { labelKey: "cashStorage",     path: "/accounts/storage" },
      ],
    },
    {
      labelKey: "profitLoss",
      path: "/profit-loss",
      icon: FiTrendingUp,
      roles: ["admin", "manager"],
    },
    {
      labelKey: "expenses",
      path: "/expenses",
      icon: MdReceiptLong,
      roles: ["admin", "manager"],
    },
    {
      labelKey: "lossManagement",
      path: "/losses",
      icon: FiAlertTriangle,
      roles: ["admin", "manager"],
    },
    {
      labelKey: "reports",
      path: "/reports",
      icon: FiFileText,
      roles: ["admin", "manager"],
    },
  ].map((item) => ({
    ...item,
    label: t(item.labelKey),
    children: item.children?.map((c) => ({ ...c, label: t(c.labelKey) })),
  }));
}

// ─── Language selector dropdown ───────────────────────────────────────────────
function LangSelector({ compact = false }) {
  const { lang, switchLang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={clsx(
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            compact ? "w-9 px-0" : "flex-1",
          )}
          title={t("language")}
        >
          <FiGlobe className="h-4 w-4 shrink-0" />
          {!compact && (
            <span className="ms-2 text-xs">
              {lang === "ps" ? "پښتو" : "EN"}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuItem
          onClick={() => switchLang("ps")}
          className={clsx("gap-2 font-medium", lang === "ps" && "text-primary")}
        >
          <span className="text-base leading-none">🇦🇫</span>
          {t("pashto")}
          {lang === "ps" && <span className="ms-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchLang("en")}
          className={clsx("gap-2 font-medium", lang === "en" && "text-primary")}
        >
          <span className="text-base leading-none">🇬🇧</span>
          {t("english")}
          {lang === "en" && <span className="ms-auto text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Sidebar navigation ───────────────────────────────────────────────────────
function SidebarNav({ onClose, collapsed }) {
  const location = useLocation();
  const { user } = useAppSelector((s) => s.auth);
  const navItems = useNavItems();

  const [expanded, setExpanded] = useState(() =>
    navItems.filter((i) => i.children).map((i) => i.labelKey),
  );

  const toggle = (key) =>
    setExpanded((prev) =>
      prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key],
    );

  const isActive     = (path) => path === location.pathname;
  const isParentActive = (item) =>
    item.children?.some((c) => c.path === location.pathname) ?? false;
  const allowed = (item) =>
    !item.roles || item.roles.includes(user?.role ?? "");

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.filter(allowed).map((item) => {
        if (item.children) {
          const isOpen     = expanded.includes(item.labelKey) && !collapsed;
          const parentActive = isParentActive(item);
          return (
            <div key={item.labelKey}>
              <button
                onClick={() => !collapsed && toggle(item.labelKey)}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  parentActive
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {isOpen
                      ? <FiChevronDown className="h-3 w-3 shrink-0" />
                      : <FiChevronRight className="h-3 w-3 shrink-0" />
                    }
                  </>
                )}
              </button>
              {isOpen && !collapsed && (
                <div className="ms-7 mt-1 flex flex-col gap-1">
                  {item.children.map((child) => (
                    <Link
                      key={child.path}
                      to={child.path}
                      onClick={onClose}
                      className={clsx(
                        "rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive(child.path)
                          ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <Link
            key={item.path}
            to={item.path ?? ""}
            onClick={onClose}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              collapsed && "justify-center px-2",
              isActive(item.path)
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Main layout ────────────────────────────────────────────────────────────
export default function AppLayout({ children, title }) {
  const [mobileOpen,        setMobileOpen]        = useState(false);
  const [sidebarCollapsed,  setSidebarCollapsed]  = useState(
    () => localStorage.getItem("sidebarCollapsed") === "true",
  );
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const { user } = useAppSelector((s) => s.auth);
  const { t, lang, switchLang } = useI18n();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const notifications = useNotifications();
  const notifCount    = notifications.length;

  // ── Preserve sidebar scroll position across navigations ──────────────────
  const sidebarScrollRef = useRef(null);

  useLayoutEffect(() => {
    const el = sidebarScrollRef.current;
    if (!el) return;
    const saved = parseInt(sessionStorage.getItem("sidebarScrollTop") ?? "0", 10);
    if (saved > 0) el.scrollTop = saved;
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      localStorage.setItem("sidebarCollapsed", String(!prev));
      return !prev;
    });
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  const toggleDark = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    setDarkMode(isDark);
  };

  const roleBadgeColor = {
    admin: "bg-primary text-primary-foreground",
    manager: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
    operator: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  }[user?.role ?? "operator"];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside className={clsx(
        "hidden h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar-background transition-[width] duration-300 lg:flex",
        sidebarCollapsed ? "w-[60px]" : "w-64",
      )}>
        {/* Logo + toggle button */}
        <div className={clsx(
          "flex items-center border-b border-sidebar-border px-3 py-4",
          sidebarCollapsed ? "justify-center" : "gap-3 px-4",
        )}>
          {!sidebarCollapsed && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
              <FiActivity className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
          )}
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-sidebar-foreground">
                {t("appName")}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">
                {t("appSubtitle")}
              </p>
            </div>
          )}
          {/* Collapse / expand toggle */}
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={clsx(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              sidebarCollapsed && "mx-auto",
            )}
          >
            {sidebarCollapsed
              ? <FiChevronRight className="h-4 w-4" />
              : <FiChevronLeft  className="h-4 w-4" />
            }
          </button>
        </div>

        {/* Nav */}
        <div
          ref={sidebarScrollRef}
          onScroll={() => {
            const top = sidebarScrollRef.current?.scrollTop ?? 0;
            sessionStorage.setItem("sidebarScrollTop", String(top));
          }}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          <SidebarNav collapsed={sidebarCollapsed} />
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ─────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute start-0 top-0 z-10 flex h-full w-72 flex-col overflow-y-auto scroll-smooth border-e border-sidebar-border bg-sidebar-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
                  <FiActivity className="h-4 w-4 text-sidebar-primary-foreground" />
                </div>
                <span className="text-sm font-bold text-sidebar-foreground">
                  {t("appName")}
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1">
              <SidebarNav onClose={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden h-screen">
        {/* Top header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
          {/* Mobile hamburger */}
          <button
            className="rounded-md p-1.5 transition-colors hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <FiMenu className="h-5 w-5" />
          </button>

          {/* Page title */}
          <h1 className="min-w-0 flex-1 truncate text-balance text-base font-semibold text-foreground">
            {title}
          </h1>

          {/* Header actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Notification bell */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="relative p-2">
                  <FiBell className="h-4 w-4" />
                  {notifCount > 0 && (
                    <Badge className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center bg-destructive p-0 text-xs text-destructive-foreground">
                      {notifCount > 9 ? "9+" : notifCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-sm font-semibold">
                    {lang === "ps" ? "خبرتیاوې" : "Notifications"}
                  </span>
                  {notifCount > 0 && (
                    <Badge variant="secondary" className="text-xs">{notifCount}</Badge>
                  )}
                </div>

                {/* Notification items */}
                {notifCount === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <FiCheckCircle className="h-8 w-8 opacity-40" />
                    <p className="text-xs">{lang === "ps" ? "هیڅ خبرتیا نشته" : "All clear — no notifications"}</p>
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((n) => (
                      <DropdownMenuItem key={n.id} asChild>
                        <Link
                          to={n.path}
                          className="flex cursor-pointer items-start gap-3 px-3 py-2.5"
                        >
                          {/* Icon */}
                          <div className={clsx(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            n.type === "danger"  && "bg-destructive/10 text-destructive",
                            n.type === "warning" && "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
                            n.type === "info"    && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                          )}>
                            <n.icon className="h-3.5 w-3.5" />
                          </div>
                          {/* Text */}
                          <div className="min-w-0 flex-1">
                            <p className={clsx(
                              "truncate text-xs font-semibold",
                              n.type === "danger"  && "text-destructive",
                              n.type === "warning" && "text-yellow-700 dark:text-yellow-400",
                              n.type === "info"    && "text-blue-700 dark:text-blue-400",
                            )}>
                              {n.title}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{n.desc}</p>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Language selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 px-2 text-foreground hover:bg-muted"
                  title={t("language")}
                >
                  <FiGlobe className="h-4 w-4" />
                  <span className="hidden text-xs font-medium md:inline">
                    {lang === "ps" ? "پښتو" : "EN"}
                  </span>
                  <FiChevronDown className="hidden h-3 w-3 md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[130px]">
                <DropdownMenuItem
                  onClick={() => switchLang("ps")}
                  className={clsx(
                    "gap-2 font-medium",
                    lang === "ps" && "text-primary",
                  )}
                >
                  <span className="text-base leading-none">🇦🇫</span>
                  {t("pashto")}
                  {lang === "ps" && (
                    <span className="ms-auto text-primary">✓</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => switchLang("en")}
                  className={clsx(
                    "gap-2 font-medium",
                    lang === "en" && "text-primary",
                  )}
                >
                  <span className="text-base leading-none">🇬🇧</span>
                  {t("english")}
                  {lang === "en" && (
                    <span className="ms-auto text-primary">✓</span>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Dark / Light toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDark}
              className="p-2 text-foreground hover:bg-muted"
              title={darkMode ? t("lightMode") : t("darkMode")}
            >
              {darkMode ? (
                <FiSun className="h-4 w-4" />
              ) : (
                <FiMoon className="h-4 w-4" />
              )}
            </Button>

            {/* Avatar + user info + logout dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 px-2 text-foreground hover:bg-muted"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden text-left md:block">
                    <p className="max-w-[100px] truncate text-xs font-medium leading-none">
                      {user?.name}
                    </p>
                    <span
                      className={clsx(
                        "mt-0.5 inline-block rounded-full px-1.5 py-px text-[10px] font-medium capitalize",
                        roleBadgeColor,
                      )}
                    >
                      {user?.role}
                    </span>
                  </div>
                  <FiChevronDown className="hidden h-3 w-3 shrink-0 md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {user?.role}
                  </p>
                </div>
                <div className="my-1 border-t border-border" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="gap-2 text-destructive focus:text-destructive"
                >
                  <FiLogOut className="h-4 w-4" />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 overflow-y-auto scroll-smooth p-4 pb-8 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
