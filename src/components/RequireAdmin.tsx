"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setIsAdmin(false);
      const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      setIsAdmin(data?.role === "admin");
    })();
  }, [supabase]);

  if (isAdmin === null) return <div className="p-4">Loading…</div>;
  if (!isAdmin) return <div className="p-4 text-sm text-red-500">Admin only</div>;
  return <>{children}</>;
}
