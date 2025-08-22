"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, Receipt, Wallet, FilePieChart, Truck, Settings, Package } from "lucide-react";
import clsx from "clsx";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/inventory", label: "Inventory", icon: Boxes },
    { href: "/stock", label: "Stock", icon: Package },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/reports", label: "Reports", icon: FilePieChart },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#0b1220] text-white min-h-screen sticky top-0">
      <div className="p-4 text-lg font-bold">EssenceFit Admin</div>
      <nav className="px-2 space-y-2">
        {nav.map(item => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/10",
                              active && "bg-white/10")}>
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-4 text-xs text-white/60">v1.0 • Inventory+Finance</div>
    </aside>
  );
}
