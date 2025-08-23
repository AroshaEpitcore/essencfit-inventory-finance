"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Tooltip } from "react-tooltip";
import {
  BarChart3,
  Boxes,
  Receipt,
  Wallet,
  FilePieChart,
  Truck,
  Settings,
  Package,
  ShoppingCart,
} from "lucide-react";
import clsx from "clsx";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/reports", label: "Reports", icon: FilePieChart },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/settings", label: "Settings", icon: Settings },
];

const STORAGE_KEY = "sidebar-collapsed";
const EVENT_KEY = "sidebar-toggle";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Load saved state and listen for Topbar toggle broadcasts
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setCollapsed(saved === "1");

    const onToggle = () =>
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    window.addEventListener(EVENT_KEY, onToggle as EventListener);
    return () =>
      window.removeEventListener(EVENT_KEY, onToggle as EventListener);
  }, []);

  return (
    <>
      <aside
        className={clsx(
          "hidden md:flex shrink-0 flex-col bg-[#0b1220] text-white h-screen sticky top-0",
          // prevent horizontal scroll; allow vertical only
          "overflow-y-auto overflow-x-hidden",
          // smooth width animation
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Brand */}
        <div
          className={clsx(
            "relative flex items-center justify-center transition-[padding] duration-300 ease-out",
            collapsed ? "px-3 py-6" : "px-4 py-6"
          )}
        >
          {/* Long title */}
          <span
            aria-hidden={collapsed}
            className={clsx(
              "text-lg font-bold text-center whitespace-nowrap",
              "transition-all duration-300 ease-out",
              collapsed
                ? "opacity-0 translate-y-1 scale-95"
                : "opacity-100 translate-y-0 scale-100"
            )}
          >
            EssenceFit Admin
          </span>

          {/* Short title (EF) — stacked on top, fades in when collapsed */}
          <span
            aria-hidden={!collapsed}
            className={clsx(
              "absolute inset-0 flex items-center justify-center",
              "text-lg font-bold text-center",
              "transition-all duration-300 ease-out",
              collapsed
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 -translate-y-1 scale-105"
            )}
            data-tooltip-id="brand-tooltip"
            data-tooltip-content="EssenceFit Admin"
            data-tooltip-place="right"
          >
            EF
          </span>

          {/* Accessible name regardless of state */}
          <span className="sr-only">EssenceFit Admin</span>
        </div>

        {/* Nav */}
        <nav className="px-2 space-y-1 flex-1 min-w-0">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <div key={item.href} className="relative group min-w-0">
                <Link
                  href={item.href}
                  className={clsx(
                    "flex items-center rounded-lg px-3 py-2 hover:bg-white/10 transition-colors",
                    active && "bg-white/10",
                    collapsed ? "justify-center" : "gap-3"
                  )}
                  data-tooltip-id={collapsed ? "nav-tooltip" : undefined}
                  data-tooltip-content={collapsed ? item.label : undefined}
                  data-tooltip-place="right"
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Footer note */}
        <div
          className={clsx(
            "mt-auto p-4 text-xs text-white/60 transition-opacity",
            collapsed && "opacity-0"
          )}
        >
          v1.0 • Arosha Ravishan
        </div>
      </aside>

      {/* Tooltips */}
      {collapsed && (
        <>
          <Tooltip
            id="brand-tooltip"
            style={{
              backgroundColor: "#1f2937",
              color: "#ffffff",
              fontSize: "12px",
              borderRadius: "6px",
              zIndex: 9999,
            }}
          />
          <Tooltip
            id="nav-tooltip"
            style={{
              backgroundColor: "#1f2937",
              color: "#ffffff",
              fontSize: "12px",
              borderRadius: "6px",
              zIndex: 9999,
            }}
          />
        </>
      )}
    </>
  );
}