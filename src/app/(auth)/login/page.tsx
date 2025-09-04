"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Role = "admin" | "staff";

// Separate component that uses useSearchParams
function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // If already logged in, go straight to dashboard
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) router.replace("/dashboard");
      } catch (error) {
        console.error('Error checking user:', error);
      }
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
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        return;
      }

      // Always ensure a profile row; set role only if we have a pending one
      const pendingRole = pullPendingRole(email);

      const { error: upErr } = await supabase.rpc("rpc_upsert_profile", {
        _name: email,
        _role: pendingRole,   // null keeps current role; non-null sets it (admin/staff)
      });
      if (upErr) {
        console.warn('Profile upsert error:', upErr);
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          toast.error("No session. Check Supabase email confirmation settings.");
          return;
        }
      }
      
      router.replace(sp.get("redirectedFrom") || "/dashboard");
    } catch (error) {
      console.error('Sign in error:', error);
      toast.error("An unexpected error occurred during sign in");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-card p-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="text-sm text-gray-500 mb-6">Inventory + Finance Dashboard</p>
      <form onSubmit={signIn} className="space-y-3">
        <input 
          className="w-full rounded-md border p-2 bg-transparent"
          placeholder="Email" 
          type="email"
          value={email} 
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          required
        />
        <input 
          className="w-full rounded-md border p-2 bg-transparent"
          placeholder="Password" 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          required
        />
        <button 
          className="w-full rounded-md bg-primary text-white py-2 disabled:opacity-50"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <button 
        onClick={() => router.push("/register")} 
        className="mt-3 w-full rounded-md border py-2 disabled:opacity-50"
        disabled={isLoading}
      >
        Create account
      </button>
    </div>
  );
}

// Loading fallback component
function LoginLoading() {
  return (
    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-card p-6">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded mb-2"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded mb-6 w-3/4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-600 rounded"></div>
        </div>
      </div>
    </div>
  );
}

// Main page component
export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Suspense fallback={<LoginLoading />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}