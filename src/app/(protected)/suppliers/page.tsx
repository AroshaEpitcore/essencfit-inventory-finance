"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

// ---------- Types ----------
type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type SupplierInsert = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

type SupplierUpdate = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

// ---------- Helpers ----------
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

// ---------- Page ----------
export default function Suppliers() {
  const supabase = createClient();

  // table
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(false);

  // search (client-side)
  const [search, setSearch] = useState("");

  // add form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  // edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<SupplierUpdate>({});

  // delete confirm (inline)
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    type SelectRow = {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      notes: string | null;
    };

    const q = supabase
      .from("suppliers")
      .select("id, name, phone, email, address, notes")
      .order("name", { ascending: true });

    const { data, error } = await q.returns<SelectRow[]>();
    setLoading(false);
    if (error) return toast.error(error.message);

    setRows(
      (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        address: r.address,
        notes: r.notes,
      }))
    );
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) => {
      const hay =
        `${r.name} ${r.phone ?? ""} ${r.email ?? ""} ${r.address ?? ""} ${r.notes ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search]);

  async function addSupplier() {
    const payload: SupplierInsert = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
    };
    if (!payload.name) return toast.error("Name is required");

    const { error } = await supabase.from("suppliers").insert(payload);
    if (error) return toast.error(error.message);

    toast.success("Supplier added");
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    await load();
  }

  function startEdit(r: SupplierRow) {
    setEditId(r.id);
    setEditDraft({
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      notes: r.notes,
    });
    setConfirmId(null);
  }

  async function saveEdit() {
    if (!editId) return;
    const payload: SupplierUpdate = {
      name: (editDraft.name ?? "").toString().trim(),
      phone: (editDraft.phone ?? "") || null,
      email: (editDraft.email ?? "") || null,
      address: (editDraft.address ?? "") || null,
      notes: (editDraft.notes ?? "") || null,
    };
    if (!payload.name) return toast.error("Name is required");

    const { error } = await supabase.from("suppliers").update(payload).eq("id", editId);
    if (error) return toast.error(error.message);

    toast.success("Saved");
    setEditId(null);
    setEditDraft({});
    await load();
  }

  function cancelEdit() {
    setEditId(null);
    setEditDraft({});
  }

  async function deleteRow(id: string) {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setConfirmId(null);
    await load();
  }

  function exportCSV() {
    const headers = ["name", "phone", "email", "address", "notes"];
    const csv = toCSV(
      filtered.map((r) => ({
        name: r.name,
        phone: r.phone ?? "",
        email: r.email ?? "",
        address: r.address ?? "",
        notes: r.notes ?? "",
      })),
      headers
    );
    downloadCSV(csv, "suppliers.csv");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Suppliers</h1>

      {/* Add supplier */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Add Supplier</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-6">
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Name</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Imports"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Phone</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+94 7X XXX XXXX"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Email</div>
            <input
              type="email"
              className="w-full rounded-md border bg-transparent p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@acme.com"
            />
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Address</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="No. 10, Flower Rd, Colombo"
            />
          </label>
          <label className="text-sm md:col-span-5">
            <div className="mb-1 text-gray-500">Notes</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, contact person, etc."
            />
          </label>
          <div className="flex items-end">
            <button onClick={addSupplier} className="rounded-md bg-primary text-white px-4 py-2">
              Add
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Admin-only per RLS. If inserts fail, check your Supabase policies/role.
        </p>
      </section>

      {/* Search & export */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <label className="text-sm flex-1">
            <div className="mb-1 text-gray-500">Search</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name/phone/email/address/notes"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={load} className="rounded-md border px-4 py-2" disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
            <button onClick={exportCSV} className="rounded-md border px-4 py-2" disabled={filtered.length === 0}>
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Notes</th>
                <th className="w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  {/* Name */}
                  <td className="py-2">
                    {editId === r.id ? (
                      <input
                        className="w-full rounded-md border bg-transparent p-1"
                        value={editDraft.name ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      />
                    ) : (
                      r.name
                    )}
                  </td>
                  {/* Phone */}
                  <td>
                    {editId === r.id ? (
                      <input
                        className="w-full rounded-md border bg-transparent p-1"
                        value={editDraft.phone ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, phone: e.target.value }))}
                      />
                    ) : (
                      r.phone ?? "-"
                    )}
                  </td>
                  {/* Email */}
                  <td>
                    {editId === r.id ? (
                      <input
                        className="w-full rounded-md border bg-transparent p-1"
                        type="email"
                        value={editDraft.email ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, email: e.target.value }))}
                      />
                    ) : (
                      r.email ?? "-"
                    )}
                  </td>
                  {/* Address */}
                  <td>
                    {editId === r.id ? (
                      <input
                        className="w-full rounded-md border bg-transparent p-1"
                        value={editDraft.address ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, address: e.target.value }))}
                      />
                    ) : (
                      r.address ?? "-"
                    )}
                  </td>
                  {/* Notes */}
                  <td>
                    {editId === r.id ? (
                      <input
                        className="w-full rounded-md border bg-transparent p-1"
                        value={editDraft.notes ?? ""}
                        onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                      />
                    ) : (
                      r.notes ?? "-"
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    {editId === r.id ? (
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="px-2 py-1 rounded-md bg-primary text-white">
                          Save
                        </button>
                        <button onClick={cancelEdit} className="px-2 py-1 rounded-md border">
                          Cancel
                        </button>
                      </div>
                    ) : confirmId === r.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => deleteRow(r.id)}
                          className="px-2 py-1 rounded-md bg-red-600 text-white"
                        >
                          Delete
                        </button>
                        <button onClick={() => setConfirmId(null)} className="px-2 py-1 rounded-md border">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(r)} className="px-2 py-1 rounded-md border">
                          Edit
                        </button>
                        <button onClick={() => setConfirmId(r.id)} className="px-2 py-1 rounded-md border">
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={6}>
                    No suppliers.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tip: If deletes fail due to foreign key constraints (e.g., purchases referencing a supplier),
          either reassign or delete dependent rows first, or add soft-delete in your schema.
        </p>
      </section>
    </div>
  );
}
