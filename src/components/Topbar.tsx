"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogOut, MoonStar, SunMedium, ChevronLeft, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";

const STORAGE_KEY = "sidebar-collapsed";
const EVENT_KEY = "sidebar-toggle";

export default function Topbar() {
  const supabase = createClient();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [profile, setProfile] = useState<{ name?: string | null; role?: string | null }>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // theme
  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);
  
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  // profile (optional)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("users").select("name, role").eq("id", user.id).maybeSingle();
      setProfile({ name: data?.name ?? user.email, role: data?.role ?? "staff" });
    })();
  }, [supabase]);

  // sidebar state sync
  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    const onToggle = () => setSidebarCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    window.addEventListener(EVENT_KEY, onToggle as EventListener);
    return () => window.removeEventListener(EVENT_KEY, onToggle as EventListener);
  }, []);

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT_KEY));
  }

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 bg-white/70 dark:bg-gray-900/70 backdrop-blur border-b">
      <div className="h-14 flex items-center justify-between px-4">
        {/* Left zone: brand (mobile) + sidebar toggle (desktop) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="md:hidden font-semibold">EssenceFit</div>

          {/* Desktop sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="hidden md:inline-flex rounded-md border px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Middle zone: Moving Announcement */}
        <div className="flex-1 mx-4 overflow-hidden">
          <div className="relative h-6 flex items-center">
            <div className="absolute whitespace-nowrap animate-scroll text-sm font-medium text-gray-700 dark:text-gray-300">
              🎉 Welcome to EssenceFit! • New features available now • Get 20% off premium plans • Join our community today! • 
            </div>
          </div>
        </div>

        {/* Right zone */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-300">
            {profile.name ?? "User"} • {profile.role ?? "staff"}
          </span>
          <button onClick={toggleTheme} className="rounded-md border px-3 py-1">
            {theme === "dark" ? <SunMedium size={16} /> : <MoonStar size={16} />}
          </button>
          <button onClick={logout} className="rounded-md border px-3 py-1 flex items-center gap-2">
            <LogOut size={14} /> <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}