"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

// --------------------------- Types ---------------------------
type KVRow = { key: string; value: string };

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "staff" | string;
  active: boolean | null;
};

type CategoryRow = { id: string; name: string };
type SizeRow = { id: string; name: string };
type ColorRow = { id: string; name: string };

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  cost_price: number | string | null;
  selling_price: number | string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  size_id: string;
  color_id: string;
  qty: number | string | null;
};

// --------------------------- CSV helpers ---------------------------
function toCSV<T extends Record<string, unknown>>(rows: T[], headers: string[]) {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return `${head}\n${body}`;
}
function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function parseCSV(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) =>
      line
        .split(",")
        .map((cell) => cell.replace(/^"(.*)"$/, "$1").replace(/""/g, `"`).trim())
    );
}
function fmt(n: number | string | null | undefined) {
  return new Intl.NumberFormat().format(Number(n ?? 0));
}

// --------------------------- Page ---------------------------
export default function Settings() {
  const supabase = createClient();

  // gate admin sections
  const [isAdmin, setIsAdmin] = useState(false);

  // low stock threshold (from settings table)
  const [threshold, setThreshold] = useState<number | "">("");
  const [loadingThreshold, setLoadingThreshold] = useState(false);
  const [hasSettingsTable, setHasSettingsTable] = useState<boolean | null>(null); // null = checking

  // users
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [uSearch, setUSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<ProfileRow["role"]>("staff");
  const [draftActive, setDraftActive] = useState<boolean>(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // --------------------------- Load role ---------------------------
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle()
        .returns<{ role: string } | null>();
      setIsAdmin((data?.role ?? "") === "admin");
    })().catch((e) => toast.error(String(e)));
  }, [supabase]);

  // --------------------------- Threshold (handle missing settings table) ---------------------------
  useEffect(() => {
    (async () => {
      setLoadingThreshold(true);
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("key, value")
          .eq("key", "low_stock_threshold")
          .maybeSingle()
          .returns<KVRow | null>();

        if (error) {
          // If table is missing or not exposed, PostgREST returns this "schema cache" style error
          const msg = String(error.message || "");
          if (msg.includes("schema cache") || msg.includes("Could not find the table 'public.settings'")) {
            setHasSettingsTable(false);
            setThreshold(""); // keep empty & disable Save
            return;
          }
          toast.error(error.message);
          return;
        }

        setHasSettingsTable(true);
        setThreshold(data ? Number(data.value ?? 0) : 0);
      } finally {
        setLoadingThreshold(false);
      }
    })().catch((e) => {
      setLoadingThreshold(false);
      toast.error(String(e));
    });
  }, [supabase]);

  async function saveThreshold() {
    if (!hasSettingsTable) {
      toast.error("The 'settings' table is missing. See the SQL instructions below to create it.");
      return;
    }
    const num = Number(threshold || 0);
    const { error } = await supabase
      .from("settings")
      .upsert({ key: "low_stock_threshold", value: String(num) })
      .select()
      .single();
    if (error) return toast.error(error.message);
    toast.success("Saved default low-stock threshold");
  }

  // --------------------------- Users (admin only) ---------------------------
  async function loadUsers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, active")
      .order("full_name", { ascending: true })
      .returns<ProfileRow[]>();
    if (error) return toast.error(error.message);
    setUsers(data ?? []);
  }

  useEffect(() => {
    if (isAdmin) void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filteredUsers = useMemo(() => {
    if (!uSearch.trim()) return users;
    const s = uSearch.toLowerCase();
    return users.filter((u) =>
      `${u.full_name ?? ""} ${u.email ?? ""} ${u.role}`.toLowerCase().includes(s)
    );
  }, [users, uSearch]);

  function startEditUser(u: ProfileRow) {
    setEditId(u.id);
    setDraftRole((u.role as "admin" | "staff") ?? "staff");
    setDraftActive(Boolean(u.active ?? true));
    setConfirmId(null);
  }
  function cancelEditUser() {
    setEditId(null);
  }
  async function saveUser() {
    if (!editId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ role: draftRole, active: draftActive })
      .eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("User updated");
    setEditId(null);
    await loadUsers();
  }
  async function deactivateUser(id: string) {
    const { error } = await supabase.from("profiles").update({ active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("User deactivated");
    setConfirmId(null);
    await loadUsers();
  }

  // --------------------------- Export ---------------------------
  async function exportTable(table: "categories" | "sizes" | "colors" | "products" | "product_variants") {
    if (table === "categories") {
      const { data, error } = await supabase.from("categories").select("id,name").returns<CategoryRow[]>();
      if (error) return toast.error(error.message);
      const csv = toCSV((data ?? []).map((r) => ({ id: r.id, name: r.name })), ["id", "name"]);
      return downloadCSV(csv, "categories.csv");
    }
    if (table === "sizes") {
      const { data, error } = await supabase.from("sizes").select("id,name").returns<SizeRow[]>();
      if (error) return toast.error(error.message);
      const csv = toCSV((data ?? []).map((r) => ({ id: r.id, name: r.name })), ["id", "name"]);
      return downloadCSV(csv, "sizes.csv");
    }
    if (table === "colors") {
      const { data, error } = await supabase.from("colors").select("id,name").returns<ColorRow[]>();
      if (error) return toast.error(error.message);
      const csv = toCSV((data ?? []).map((r) => ({ id: r.id, name: r.name })), ["id", "name"]);
      return downloadCSV(csv, "colors.csv");
    }
    if (table === "products") {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,category_id,cost_price,selling_price")
        .returns<ProductRow[]>();
      if (error) return toast.error(error.message);
      const csv = toCSV(
        (data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku ?? "",
          category_id: r.category_id ?? "",
          cost_price: r.cost_price ?? "",
          selling_price: r.selling_price ?? "",
        })),
        ["id", "name", "sku", "category_id", "cost_price", "selling_price"]
      );
      return downloadCSV(csv, "products.csv");
    }
    if (table === "product_variants") {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id,product_id,size_id,color_id,qty")
        .returns<VariantRow[]>();
      if (error) return toast.error(error.message);
      const csv = toCSV(
        (data ?? []).map((r) => ({
          id: r.id,
          product_id: r.product_id,
          size_id: r.size_id,
          color_id: r.color_id,
          qty: r.qty ?? 0,
        })),
        ["id", "product_id", "size_id", "color_id", "qty"]
      );
      return downloadCSV(csv, "product_variants.csv");
    }
  }

  // --------------------------- Import (categories/sizes/colors) ---------------------------
  type ImportKind = "categories" | "sizes" | "colors";
  const [importKind, setImportKind] = useState<ImportKind>("categories");
  const [importing, setImporting] = useState(false);

  async function handleImport(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast.error("CSV is empty");
        return;
      }
      const [head, ...data] = rows;
      const idxId = head.findIndex((h) => h.toLowerCase() === "id");
      const idxName = head.findIndex((h) => h.toLowerCase() === "name");
      if (idxName === -1) {
        toast.error('CSV must include a "name" column');
        return;
      }

      const payload = data
        .filter((r) => r[idxName] && r[idxName].length > 0)
        .map((r) => {
          const name = r[idxName].trim();
          const id = idxId !== -1 ? (r[idxId]?.trim() || undefined) : undefined;
          return id ? { id, name } : { name };
        });

      if (payload.length === 0) {
        toast.error("No rows to import");
        return;
      }

      const table = importKind;
      const { error } = await supabase.from(table).upsert(payload).select();
      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Imported ${payload.length} ${table}`);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setImporting(false);
    }
  }

  // --------------------------- UI ---------------------------
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Low-stock threshold */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Low-stock threshold (default)</h2>

        {/* warn if the settings table is missing */}
        {hasSettingsTable === false && (
          <div className="mb-3 rounded-md border border-yellow-400 bg-yellow-50 text-yellow-800 p-3 text-sm">
            The table <b>public.settings</b> does not exist (or isn’t exposed). Create it with:
            <pre className="mt-2 p-2 bg-yellow-100 rounded text-xs overflow-x-auto">
{`create table if not exists public.settings (
  key   text primary key,
  value text not null
);

alter table public.settings enable row level security;

-- Adjust policies to your needs; this example allows any authenticated user to read/write.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings_select_auth'
  ) then
    create policy settings_select_auth on public.settings
      for select using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings_ins_auth'
  ) then
    create policy settings_ins_auth on public.settings
      for insert with check (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings_upd_auth'
  ) then
    create policy settings_upd_auth on public.settings
      for update using (auth.role() = 'authenticated');
  end if;
end $$;`}
            </pre>
            <div className="mt-1">
              After running the SQL (in Supabase SQL editor), refresh this page.
            </div>
          </div>
        )}

        <div className="flex items-end gap-3">
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Pieces</div>
            <input
              type="number"
              min={0}
              className="rounded-md border bg-transparent p-2 w-32"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={loadingThreshold || hasSettingsTable === false}
            />
          </label>
          <button
            onClick={saveThreshold}
            className="rounded-md bg-primary text-white px-4 py-2"
            disabled={loadingThreshold || hasSettingsTable !== true}
          >
            Save
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Used as a default when computing low-stock alerts (variants can still override if your schema supports per-item thresholds).
        </p>
      </section>

      {/* Users (admin only) */}
      {isAdmin && (
        <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
          <div className="mb-3 flex items-end gap-3">
            <h2 className="font-semibold flex-1">Users</h2>
            <label className="text-sm flex-1">
              <div className="mb-1 text-gray-500">Search</div>
              <input
                className="w-full rounded-md border bg-transparent p-2"
                value={uSearch}
                onChange={(e) => setUSearch(e.target.value)}
                placeholder="name / email / role"
              />
            </label>
            <button onClick={loadUsers} className="rounded-md border px-3 py-2">
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Active</th>
                  <th className="w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="py-2">{u.full_name ?? "—"}</td>
                    <td>{u.email ?? "—"}</td>
                    <td>
                      {editId === u.id ? (
                        <select
                          className="rounded-md border bg-transparent p-1"
                          value={draftRole}
                          onChange={(e) => setDraftRole(e.target.value as ProfileRow["role"])}
                        >
                          <option value="staff">staff</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        u.role
                      )}
                    </td>
                    <td>
                      {editId === u.id ? (
                        <select
                          className="rounded-md border bg-transparent p-1"
                          value={draftActive ? "1" : "0"}
                          onChange={(e) => setDraftActive(e.target.value === "1")}
                        >
                          <option value="1">active</option>
                          <option value="0">inactive</option>
                        </select>
                      ) : (u.active ?? true) ? (
                        "active"
                      ) : (
                        "inactive"
                      )}
                    </td>
                    <td>
                      {editId === u.id ? (
                        <div className="flex gap-2">
                          <button onClick={saveUser} className="px-2 py-1 rounded-md bg-primary text-white">
                            Save
                          </button>
                          <button onClick={cancelEditUser} className="px-2 py-1 rounded-md border">
                            Cancel
                          </button>
                        </div>
                      ) : confirmId === u.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => deactivateUser(u.id)}
                            className="px-2 py-1 rounded-md bg-red-600 text-white"
                          >
                            Deactivate
                          </button>
                          <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded-md border">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => startEditUser(u)} className="px-2 py-1 rounded-md border">
                            Edit
                          </button>
                          {(u.active ?? true) && (
                            <button onClick={() => setConfirmId(u.id)} className="px-2 py-1 rounded-md border">
                              Deactivate
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={5}>
                      No users.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Admin-only per RLS. Changes here update your <code>profiles</code> table (not auth users).
          </p>
        </section>
      )}

      {/* Import / Export */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Import / Export</h2>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {/* Export */}
          <div>
            <div className="text-sm text-gray-500 mb-2">Export CSV</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportTable("categories")} className="rounded-md border px-3 py-2">
                Categories
              </button>
              <button onClick={() => exportTable("sizes")} className="rounded-md border px-3 py-2">
                Sizes
              </button>
              <button onClick={() => exportTable("colors")} className="rounded-md border px-3 py-2">
                Colors
              </button>
              <button onClick={() => exportTable("products")} className="rounded-md border px-3 py-2">
                Products
              </button>
              <button onClick={() => exportTable("product_variants")} className="rounded-md border px-3 py-2">
                Variants
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Products/Variants export raw IDs to keep it simple (good for backups or ETL).
            </p>
          </div>

          {/* Import */}
          <div>
            <div className="text-sm text-gray-500 mb-2">Import CSV</div>
            <ImportBlock
              importKindDefault="categories"
              onImport={handleImport}
              importing={importing}
              setImporting={setImporting}
              setImportKind={setImportKind}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function ImportBlock(props: {
  importKindDefault: "categories" | "sizes" | "colors";
  onImport: (file: File) => Promise<void>;
  importing: boolean;
  setImporting: (b: boolean) => void;
  setImportKind: (k: "categories" | "sizes" | "colors") => void;
}) {
  const { importKindDefault, onImport, importing, setImportKind } = props;
  const [kind, setKind] = useState<typeof importKindDefault>(importKindDefault);
  return (
    <>
      <div className="flex items-end gap-2">
        <label className="text-sm">
          <div className="mb-1 text-gray-500">Target table</div>
          <select
            className="rounded-md border bg-transparent p-2"
            value={kind}
            onChange={(e) => {
              const v = e.target.value as "categories" | "sizes" | "colors";
              setKind(v);
              setImportKind(v);
            }}
          >
            <option value="categories">categories</option>
            <option value="sizes">sizes</option>
            <option value="colors">colors</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1 text-gray-500">CSV file</div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="rounded-md border bg-transparent p-2 w-64"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
            }}
            disabled={importing}
          />
        </label>
        {importing && <span className="text-sm text-gray-500">Importing…</span>}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        CSV must include a <code>name</code> column; optional <code>id</code> column to upsert.
      </p>
    </>
  );
}
