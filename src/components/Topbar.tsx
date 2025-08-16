"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LogOut, MoonStar, SunMedium } from "lucide-react";
import toast from "react-hot-toast";

export default function Topbar() {
  const supabase = createClient();
  const [theme, setTheme] = useState<"light"|"dark">("light");
  const [profile, setProfile] = useState<{name?: string|null; role?: string|null}>({});

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as "light"|"dark") || "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("users").select("name, role").eq("id", user.id).maybeSingle();
      setProfile({ name: data?.name ?? user.email, role: data?.role ?? "staff" });
    })();
  }, [supabase]);

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 bg-white/70 dark:bg-gray-900/70 backdrop-blur border-b">
      <div className="h-14 flex items-center justify-between px-4">
        <div className="md:hidden font-semibold">EssenceFit</div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-300">
            {profile.name ?? "User"} • {profile.role ?? "staff"}
          </span>
          <button onClick={toggleTheme} className="rounded-md border px-3 py-1">
            {theme === "dark" ? <SunMedium size={16}/> : <MoonStar size={16}/>}
          </button>
          <button onClick={logout} className="rounded-md border px-3 py-1 flex items-center gap-2">
            <LogOut size={14}/> <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
