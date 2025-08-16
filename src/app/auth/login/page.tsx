"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toast.error(error.message);

    // ensure profile exists (safe if already there)
    await supabase.rpc("rpc_upsert_profile", { _name: email });
    router.replace(sp.get("redirectedFrom") || "/dashboard");
  }

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return toast.error(error.message);

    await supabase.rpc("rpc_upsert_profile", { _name: email });
    router.replace("/dashboard");
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-card p-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="text-sm text-gray-500 mb-6">Inventory + Finance Dashboard</p>
        <form onSubmit={signIn} className="space-y-3">
          <input className="w-full rounded-md border p-2 bg-transparent" placeholder="Email"
                 value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full rounded-md border p-2 bg-transparent" placeholder="Password" type="password"
                 value={password} onChange={(e)=>setPassword(e.target.value)} />
          <button className="w-full rounded-md bg-primary text-white py-2">Sign in</button>
        </form>
        <button onClick={signUp} className="mt-3 w-full rounded-md border py-2">
          Create account
        </button>
      </div>
    </main>
  );
}
