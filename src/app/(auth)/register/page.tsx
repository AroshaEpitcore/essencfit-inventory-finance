"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Role = "admin" | "staff";

export default function RegisterPage() {
  const supabase = createClient();
  const router = useRouter();

  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole]       = useState<Role>("staff");
  const [loading, setLoading] = useState(false);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return toast.error("Email and password are required.");
    if (password !== confirm) return toast.error("Passwords do not match.");

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?msg=Email verified. Please sign in.`,
      },
    });
    setLoading(false);

    if (error) return toast.error(error.message);

    // If we already have a session (confirm-email OFF), set name+role now
    const { data: sess } = await supabase.auth.getSession();
    if (sess.session) {
      const { error: upErr } = await supabase.rpc("rpc_upsert_profile", {
        _name: name || email,
        _role: role,
      });
      if (upErr) {
        // optional: console.warn(upErr);
      }
      router.replace("/dashboard");
      return;
    }

    // If confirmation is required, stash desired role to apply on first login
    try { localStorage.setItem(`role:${email.toLowerCase()}`, role); } catch {}
    toast.success("Account created. Check your email to verify, then sign in.");
    router.replace("/login?msg=Account created. Verify email, then sign in.");
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-card p-6">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="text-sm text-gray-500 mb-6">Start using Inventory + Finance Dashboard</p>

        <form onSubmit={register} className="space-y-3">
          <input className="w-full rounded-md border p-2 bg-transparent"
                 placeholder="Name (optional)" value={name} onChange={(e)=>setName(e.target.value)} />
          <input className="w-full rounded-md border p-2 bg-transparent"
                 placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full rounded-md border p-2 bg-transparent"
                 placeholder="Password" type="password" value={password} onChange={(e)=>setPass(e.target.value)} />
          <input className="w-full rounded-md border p-2 bg-transparent"
                 placeholder="Confirm password" type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} />

          <label className="text-sm block">
            <div className="mb-1 text-gray-500">Role</div>
            <select className="w-full rounded-md border bg-transparent p-2"
                    value={role} onChange={(e)=>setRole(e.target.value as Role)}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <button disabled={loading} className="w-full rounded-md bg-primary text-white py-2 disabled:opacity-60">
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <button onClick={() => router.push("/login")} className="mt-3 w-full rounded-md border py-2">
          Back to login
        </button>
      </div>
    </main>
  );
}
