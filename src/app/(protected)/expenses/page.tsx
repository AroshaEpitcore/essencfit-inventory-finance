"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

// ---------------- Types ----------------
type ExpenseCategory =
  | "stock purchase"
  | "marketing"
  | "delivery"
  | "rent"
  | "utilities"
  | "other";

type ExpenseRow = {
  id: string;
  date: string; // yyyy-mm-dd
  category: ExpenseCategory;
  description: string | null;
  amount: number;
};

// -------------- Helpers ---------------
const categoryOptions: ExpenseCategory[] = [
  "stock purchase",
  "marketing",
  "delivery",
  "rent",
  "utilities",
  "other",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function fmt(n: number) {
  return new Intl.NumberFormat().format(n);
}
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

// --------------- Page -----------------
export default function Expenses() {
  const supabase = createClient();

  // filters
  const [from, setFrom] = useState<string>(firstOfMonthISO());
  const [to, setTo] = useState<string>(todayISO());
  const [catFilter, setCatFilter] = useState<ExpenseCategory | "">("");

  // list
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const total = useMemo(() => rows.reduce((a, r) => a + r.amount, 0), [rows]);

  // add form
  const [date, setDate] = useState<string>(todayISO());
  const [category, setCategory] = useState<ExpenseCategory>("stock purchase");
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // inline delete confirm
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // load
  async function load() {
    type ExpenseSelectRow = {
      id: string;
      date: string;
      category: ExpenseCategory;
      description: string | null;
      amount: number | string;
    };

    let q = supabase
      .from("expenses")
      .select("id, date, category, description, amount")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });

    if (catFilter) q = q.eq("category", catFilter);

    const { data, error } = await q.returns<ExpenseSelectRow[]>();
    if (error) return toast.error(error.message);

    setRows(
      (data ?? []).map((r) => ({
        id: r.id,
        date: r.date,
        category: r.category,
        description: r.description,
        amount: Number(r.amount),
      }))
    );
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // actions
  async function addExpense() {
    const amt = Number(amount);
    if (!date || !category || !Number.isFinite(amt) || amt <= 0) {
      return toast.error("Enter date, category, and a positive amount");
    }

    const { error } = await supabase
      .from("expenses")
      .insert({
        date,
        category,
        description: description.trim() || null,
        amount: amt,
      });
    if (error) return toast.error(error.message);

    toast.success("Expense added");
    setAmount("");
    setDescription("");
    await load();
  }

  async function deleteExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setConfirmId(null);
    await load();
  }

  function exportCSV() {
    const headers = ["date", "category", "description", "amount"];
    const csv = toCSV(
      rows.map((r) => ({
        date: r.date,
        category: r.category,
        description: r.description ?? "",
        amount: r.amount,
      })),
      headers
    );
    downloadCSV(csv, `expenses_${from}_to_${to}.csv`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Expenses</h1>

      {/* Add expense */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Add Expense</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-6">
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Date</div>
            <input
              type="date"
              className="w-full rounded-md border bg-transparent p-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Category</div>
            <select
              className="w-full rounded-md border bg-transparent p-2"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Description</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Facebook ads"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Amount</div>
            <input
              type="number"
              step="0.01"
              min={0}
              className="w-full rounded-md border bg-transparent p-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <div className="flex items-end">
            <button onClick={addExpense} className="rounded-md bg-primary text-white px-4 py-2">
              Add
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Admin-only per RLS. If you see errors here, check your Supabase policies/role.
        </p>
      </section>

      {/* Filters + actions */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-6">
          <label className="text-sm">
            <div className="mb-1 text-gray-500">From</div>
            <input
              type="date"
              className="w-full rounded-md border bg-transparent p-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">To</div>
            <input
              type="date"
              className="w-full rounded-md border bg-transparent p-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Category</div>
            <select
              className="w-full rounded-md border bg-transparent p-2"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value as ExpenseCategory | "")}
            >
              <option value="">All</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={load} className="rounded-md bg-primary text-white px-4 py-2">
              Apply
            </button>
            <button
              onClick={exportCSV}
              className="rounded-md border px-4 py-2"
              disabled={rows.length === 0}
            >
              Export CSV
            </button>
          </div>
          <div className="flex items-end justify-end md:col-span-6">
            <div className="text-sm">
              Total: <b>{fmt(total)}</b>
            </div>
          </div>
        </div>
      </section>

      {/* Table */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Date</th>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th className="w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">{r.date}</td>
                  <td>{r.category}</td>
                  <td>{r.description ?? "-"}</td>
                  <td className="text-right">{fmt(r.amount)}</td>
                  <td>
                    {confirmId === r.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteExpense(r.id)}
                          className="px-2 py-1 rounded-md bg-red-600 text-white"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-2 py-1 rounded-md border"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(r.id)}
                        className="px-2 py-1 rounded-md border"
                        title="Delete"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={5}>
                    No expenses in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
