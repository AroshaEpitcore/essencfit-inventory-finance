"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Role = "admin" | "staff";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // If already logged in, go straight to dashboard
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) router.replace("/dashboard");
    })();
    const msg = sp.get("msg");
    if (msg) toast.success(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pullPendingRole(currentEmail: string): Role | null {
    try {
      const key = `role:${currentEmail.toLowerCase()}`;
      const raw = localStorage.getItem(key);
      if (raw === "admin" || raw === "staff") {
        localStorage.removeItem(key);
        return raw;
      }
    } catch {}
    return null;
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast.error(error.message);

    // Always ensure a profile row; set role only if we have a pending one
    const pendingRole = pullPendingRole(email);

    const { error: upErr } = await supabase.rpc("rpc_upsert_profile", {
      _name: email,
      _role: pendingRole,   // null keeps current role; non-null sets it (admin/staff)
    });
    if (upErr) {
      // optional: console.warn(upErr);
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) return toast.error("No session. Check Supabase email confirmation settings.");
    }
    router.replace(sp.get("redirectedFrom") || "/dashboard");
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-card p-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Inventory + Finance Dashboard</p>
        <form onSubmit={signIn} className="space-y-3">
          <input className="w-full rounded-md border p-2 bg-transparent"
                 placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full rounded-md border p-2 bg-transparent"
                 placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <button className="w-full rounded-md bg-primary text-white py-2">Sign in</button>
        </form>
        <button onClick={() => router.push("/register")} className="mt-3 w-full rounded-md border py-2">
          Create account
        </button>
      </div>
    </main>
  );
}
