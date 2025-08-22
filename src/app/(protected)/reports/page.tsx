"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

// Explicit FK names (embed single objects)
const FK = {
  pv_product: "product_variants_product_id_fkey",
  pv_size: "product_variants_size_id_fkey",
  pv_color: "product_variants_color_id_fkey",
  prod_category: "products_category_id_fkey",
};

// --------------------------- Types ---------------------------
type Option = { id: string; name: string };

type InventoryRow = {
  variant_id: string;
  product_name: string;
  product_sku: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  qty: number;
  selling_price: number | null;
};

type SalesRow = {
  id: string;
  date: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  qty: number;
  selling_price: number;
  total_price: number;
  payment_method: "cash" | "bank" | "digital" | "credit";
  payment_status: "paid" | "pending";
  variant_id: string | null;
};

type ExpenseRow = {
  id: string;
  date: string;
  category:
    | "stock purchase"
    | "marketing"
    | "delivery"
    | "rent"
    | "utilities"
    | "other";
  description: string | null;
  amount: number;
};

type DeadStockRow = {
  variant_id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  qty: number;
  last_sale: string | null; // yyyy-mm-dd
};

// --------------------------- Helpers ---------------------------
function toCSV<T extends Record<string, unknown>>(rows: T[], headers: string[]): string {
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
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmt(num: number | null | undefined) {
  return new Intl.NumberFormat().format(Number(num ?? 0));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

// --------------------------- Page ---------------------------
export default function Reports() {
  const supabase = createClient();

  // Tabs
  type Tab = "inventory" | "sales" | "expenses" | "pl" | "dead";
  const [tab, setTab] = useState<Tab>("inventory");

  // Lookups
  const [categories, setCategories] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [sizes, setSizes] = useState<Option[]>([]);
  const [colors, setColors] = useState<Option[]>([]);
  const [selCat, setSelCat] = useState<string>("");
  const [selProd, setSelProd] = useState<string>("");
  const [selSize, setSelSize] = useState<string>("");
  const [selColor, setSelColor] = useState<string>("");

  // Date filters
  const [from, setFrom] = useState<string>(firstOfMonthISO());
  const [to, setTo] = useState<string>(todayISO());

  // Inventory data
  const [invRows, setInvRows] = useState<InventoryRow[]>([]);

  // Sales data
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
  const [salesStatus, setSalesStatus] = useState<"" | "paid" | "pending">("");

  // Expenses data
  const [expRows, setExpRows] = useState<ExpenseRow[]>([]);
  const [expCat, setExpCat] = useState<ExpenseRow["category"] | "">("");

  // P&L
  const salesTotal = useMemo(
    () => salesRows.reduce((a, r) => a + Number(r.total_price), 0),
    [salesRows]
  );
  const expensesTotal = useMemo(
    () => expRows.reduce((a, r) => a + Number(r.amount), 0),
    [expRows]
  );
  const [cogsTotal, setCogsTotal] = useState<number>(0);
  const profit = salesTotal - cogsTotal - expensesTotal;

  // Dead stock
  const [deadDays, setDeadDays] = useState<number>(60);
  const [deadRows, setDeadRows] = useState<DeadStockRow[]>([]);

  // --------------------------- Load lookups ---------------------------
  useEffect(() => {
    (async () => {
      const [c, s, k] = await Promise.all([
        supabase.from("categories").select("id,name").order("name"),
        supabase.from("sizes").select("id,name").order("name"),
        supabase.from("colors").select("id,name").order("name"),
      ]);
      setCategories((c.data as Option[] | null) ?? []);
      setSizes((s.data as Option[] | null) ?? []);
      setColors((k.data as Option[] | null) ?? []);
    })().catch((e) => toast.error(String(e)));
  }, [supabase]);

  useEffect(() => {
    (async () => {
      if (!selCat) {
        setProducts([]); setSelProd("");
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .select("id,name")
        .eq("category_id", selCat)
        .order("name");
      if (error) return toast.error(error.message);
      setProducts(((data ?? []) as { id: string; name: string }[]) || []);
    })().catch((e) => toast.error(String(e)));
  }, [supabase, selCat]);

  // --------------------------- Inventory Report ---------------------------
  async function runInventoryReport() {
    type VVariantRow = {
      variant_id: string;
      product_name: string;
      product_sku: string | null;
      category: string | null;
      size: string | null;
      color: string | null;
      qty: number | string | null;
      selling_price: number | string | null;
    };

    // Build query first, then call .returns<T>() at the END
    let q = supabase
      .from("v_variant_lookup")
      .select("variant_id, product_name, product_sku, category, size, color, qty, selling_price");

    if (selCat)  q = q.eq("category", categories.find((c) => c.id === selCat)?.name ?? "");
    if (selProd) q = q.eq("product_name", products.find((p) => p.id === selProd)?.name ?? "");
    if (selSize) q = q.eq("size", sizes.find((s) => s.id === selSize)?.name ?? "");
    if (selColor)q = q.eq("color", colors.find((c) => c.id === selColor)?.name ?? "");

    const { data, error } = await q.order("product_name").order("size").order("color").returns<VVariantRow[]>();
    if (error) return toast.error(error.message);

    const rows: InventoryRow[] = (data ?? []).map((r) => ({
      variant_id: r.variant_id,
      product_name: r.product_name,
      product_sku: r.product_sku,
      category: r.category,
      size: r.size,
      color: r.color,
      qty: Number(r.qty ?? 0),
      selling_price: r.selling_price === null ? null : Number(r.selling_price),
    }));
    setInvRows(rows);
  }

  function exportInventoryCSV() {
    const headers = ["product_name", "product_sku", "category", "size", "color", "qty", "selling_price"];
    const csv = toCSV(invRows as unknown as Record<string, unknown>[], headers);
    downloadCSV(csv, `inventory_${todayISO()}.csv`);
  }

  // --------------------------- Sales Report ---------------------------
  async function runSalesReport() {
    type SalesSelectRow = {
      id: string;
      date: string;
      qty: number | string;
      selling_price: number | string;
      total_price: number | string;
      payment_status: "paid" | "pending";
      payment_method: "cash" | "bank" | "digital" | "credit";
      product_variants: {
        id: string;
        product: {
          name: string;
          sku: string | null;
          category: { name: string | null } | null;
        } | null;
        size: { name: string | null } | null;
        color: { name: string | null } | null;
      } | null;
    };

    let q = supabase
      .from("sales")
      .select(
        `
        id, date, qty, selling_price, total_price, payment_status, payment_method,
        product_variants:variant_id (
          id,
          product:products!${FK.pv_product} (
            name, sku, category:categories!${FK.prod_category} ( name )
          ),
          size:sizes!${FK.pv_size} ( name ),
          color:colors!${FK.pv_color} ( name )
        )
      `
      )
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });

    if (salesStatus) q = q.eq("payment_status", salesStatus);

    const { data, error } = await q.returns<SalesSelectRow[]>();
    if (error) return toast.error(error.message);

    const rows: SalesRow[] = (data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      product_name: r.product_variants?.product?.name ?? "",
      sku: r.product_variants?.product?.sku ?? null,
      category: r.product_variants?.product?.category?.name ?? null,
      size: r.product_variants?.size?.name ?? null,
      color: r.product_variants?.color?.name ?? null,
      qty: Number(r.qty),
      selling_price: Number(r.selling_price),
      total_price: Number(r.total_price),
      payment_method: r.payment_method,
      payment_status: r.payment_status,
      variant_id: r.product_variants?.id ?? null,
    }));

    const catName = selCat ? categories.find((c) => c.id === selCat)?.name ?? "" : "";
    setSalesRows(selCat ? rows.filter((r) => (r.category ?? "") === catName) : rows);
  }

  function exportSalesCSV() {
    const headers = [
      "date",
      "product_name",
      "sku",
      "category",
      "size",
      "color",
      "qty",
      "selling_price",
      "total_price",
      "payment_method",
      "payment_status",
    ];
    const csv = toCSV(salesRows as unknown as Record<string, unknown>[], headers);
    downloadCSV(csv, `sales_${from}_to_${to}.csv`);
  }

  // --------------------------- Expenses Report ---------------------------
  async function runExpenseReport() {
    type ExpenseSelectRow = {
      id: string;
      date: string;
      category: ExpenseRow["category"];
      description: string | null;
      amount: number | string;
    };

    const { data, error } = await supabase
      .from("expenses")
      .select("id, date, category, description, amount")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .returns<ExpenseSelectRow[]>();

    if (error) return toast.error(error.message);

    const rows: ExpenseRow[] = (data ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      category: r.category,
      description: r.description,
      amount: Number(r.amount),
    }));

    setExpRows(rows);
  }

  function exportExpenseCSV() {
    const headers = ["date", "category", "description", "amount"];
    const csv = toCSV(expRows as unknown as Record<string, unknown>[], headers);
    downloadCSV(csv, `expenses_${from}_to_${to}.csv`);
  }

  // --------------------------- P&L (Sales - COGS - Expenses) ---------------------------
  async function computeCOGS() {
    // Build qty sold per variant in range
    const variantQty = new Map<string, number>();
    for (const r of salesRows) {
      if (!r.variant_id) continue;
      variantQty.set(r.variant_id, (variantQty.get(r.variant_id) ?? 0) + Number(r.qty));
    }
    if (variantQty.size === 0) {
      setCogsTotal(0);
      return;
    }

    // Fetch all purchases for these variants (single query), pick latest per variant
    const variantIds = Array.from(variantQty.keys());
    const { data, error } = await supabase
      .from("purchases")
      .select("variant_id, cost_price, created_at")
      .in("variant_id", variantIds)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setCogsTotal(0);
      return;
    }

    const latestCost = new Map<string, number>();
    for (const row of data ?? []) {
      const vid = (row as { variant_id: string }).variant_id;
      if (!latestCost.has(vid)) {
        latestCost.set(vid, Number((row as { cost_price: number | string }).cost_price));
      }
    }

    // Fallback: variants with no purchases → product default cost
    const missing = variantIds.filter((id) => !latestCost.has(id));
    if (missing.length > 0) {
      type PvWithProductCost = { id: string; product: { cost_price: number | string | null } | null };

      const { data: v, error: vErr } = await supabase
        .from("product_variants")
        .select(`id, product:products!${FK.pv_product} ( cost_price )`)
        .in("id", missing)
        .returns<PvWithProductCost[]>();

      if (vErr) {
        toast.error(vErr.message);
      } else {
        for (const row of v ?? []) {
          latestCost.set(row.id, Number(row.product?.cost_price ?? 0));
        }
      }
    }

    let total = 0;
    for (const [vid, qty] of variantQty.entries()) {
      total += (latestCost.get(vid) ?? 0) * qty;
    }
    setCogsTotal(total);
  }

  useEffect(() => {
    if (tab === "pl") {
      void computeCOGS();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, salesRows]);

  // --------------------------- Dead Stock ---------------------------
  async function runDeadStock() {
    // cutoff date (used only for filtering result set after we compute last sale per variant)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(deadDays || 0));
    const cutoffISO = cutoff.toISOString().slice(0, 10);

    // 1) All variants + joins
    type VariantJoin = {
      id: string;
      qty: number | string | null;
      product: { name: string; sku: string | null; category: { name: string | null } | null } | null;
      size: { name: string | null } | null;
      color: { name: string | null } | null;
    };

    const { data: v, error: verr } = await supabase
      .from("product_variants")
      .select(
        `
        id, qty,
        product:products!${FK.pv_product} ( name, sku, category:categories!${FK.prod_category} ( name ) ),
        size:sizes!${FK.pv_size} ( name ),
        color:colors!${FK.pv_color} ( name )
      `
      )
      .returns<VariantJoin[]>();

    if (verr) return toast.error(verr.message);

    const variants = (v ?? []).map((row) => ({
      id: row.id,
      qty: Number(row.qty ?? 0),
      product_name: row.product?.name ?? "",
      sku: row.product?.sku ?? null,
      category: row.product?.category?.name ?? null,
      size: row.size?.name ?? null,
      color: row.color?.name ?? null,
    }));

    const variantIds = variants.map((x) => x.id);
    if (variantIds.length === 0) {
      setDeadRows([]);
      return;
    }

    // 2) Latest sale per variant
    // Instead of .group(...), fetch dates sorted desc and take first per variant
    type SaleTiny = { variant_id: string; date: string };
    const { data: salesAll, error: serr } = await supabase
      .from("sales")
      .select("variant_id, date")
      .in("variant_id", variantIds)
      .order("date", { ascending: false })
      .returns<SaleTiny[]>();

    if (serr) return toast.error(serr.message);

    const lastByVariant = new Map<string, string>();
    for (const row of salesAll ?? []) {
      // first occurrence is latest due to order desc
      if (!lastByVariant.has(row.variant_id)) {
        lastByVariant.set(row.variant_id, row.date);
      }
    }

    // 3) Build + filter
    const rows: DeadStockRow[] = variants
      .map((vrow) => ({
        variant_id: vrow.id,
        product_name: vrow.product_name,
        sku: vrow.sku,
        category: vrow.category,
        size: vrow.size,
        color: vrow.color,
        qty: vrow.qty,
        last_sale: lastByVariant.get(vrow.id) ?? null,
      }))
      .filter((r) => {
        if (!r.last_sale) return true; // never sold
        return r.last_sale < cutoffISO;
      })
      .sort((a, b) =>
        (a.product_name + (a.size ?? "") + (a.color ?? "")).localeCompare(
          b.product_name + (b.size ?? "") + (b.color ?? "")
        )
      );

    setDeadRows(rows);
  }

  function exportDeadCSV() {
    const headers = ["product_name", "sku", "category", "size", "color", "qty", "last_sale"];
    const csv = toCSV(deadRows as unknown as Record<string, unknown>[], headers);
    downloadCSV(csv, `dead_stock_${deadDays}d_${todayISO()}.csv`);
  }

  // --------------------------- UI ---------------------------
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Reports</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["inventory", "sales", "expenses", "pl", "dead"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-md border ${tab === t ? "bg-primary text-white" : "bg-white dark:bg-gray-800"}`}
          >
            {t === "inventory" && "Inventory"}
            {t === "sales" && "Sales"}
            {t === "expenses" && "Expenses"}
            {t === "pl" && "P&L"}
            {t === "dead" && "Dead Stock"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-6">
          <FilterSelect label="Category" value={selCat} onChange={setSelCat} options={categories} />
          <FilterSelect label="Product" value={selProd} onChange={setSelProd} options={products} disabled={!selCat} />
          <FilterSelect label="Size" value={selSize} onChange={setSelSize} options={sizes} />
          <FilterSelect label="Color" value={selColor} onChange={setSelColor} options={colors} />
          <label className="text-sm">
            <div className="mb-1 text-gray-500">From</div>
            <input type="date" className="w-full rounded-md border bg-transparent p-2" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">To</div>
            <input type="date" className="w-full rounded-md border bg-transparent p-2" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Note: Category/Product filters apply to Inventory & Sales; Size/Color apply to Inventory only.
        </p>
      </section>

      {/* Inventory */}
      {tab === "inventory" && (
        <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
          <div className="mb-3 flex gap-2">
            <button onClick={runInventoryReport} className="rounded-md bg-primary text-white px-3 py-2">
              Run Inventory Report
            </button>
            <button onClick={exportInventoryCSV} className="rounded-md border px-3 py-2" disabled={invRows.length === 0}>
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Color</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Sell Price</th>
                </tr>
              </thead>
              <tbody>
                {invRows.map((r) => (
                  <tr key={r.variant_id} className="border-t">
                    <td className="py-2">{r.product_name}</td>
                    <td>{r.product_sku ?? "-"}</td>
                    <td>{r.category ?? "-"}</td>
                    <td>{r.size ?? "-"}</td>
                    <td>{r.color ?? "-"}</td>
                    <td className="text-right">{fmt(r.qty)}</td>
                    <td className="text-right">{r.selling_price === null ? "-" : fmt(r.selling_price)}</td>
                  </tr>
                ))}
                {invRows.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={7}>
                      No data. Click “Run Inventory Report”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sales */}
      {tab === "sales" && (
        <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="mb-1 text-gray-500">Payment Status</div>
              <select
                className="rounded-md border bg-transparent p-2"
                value={salesStatus}
                onChange={(e) => setSalesStatus(e.target.value as "" | "paid" | "pending")}
              >
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </label>
            <button onClick={runSalesReport} className="rounded-md bg-primary text-white px-3 py-2">
              Run Sales Report
            </button>
            <button onClick={exportSalesCSV} className="rounded-md border px-3 py-2" disabled={salesRows.length === 0}>
              Export CSV
            </button>
            <div className="ml-auto text-sm">
              <span className="mr-4">Qty: <b>{fmt(salesRows.reduce((a, r) => a + r.qty, 0))}</b></span>
              <span>Total: <b>{fmt(salesTotal)}</b></span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Date</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Cat</th>
                  <th>Size</th>
                  <th>Color</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Total</th>
                  <th>Pay Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{r.date}</td>
                    <td>{r.product_name}</td>
                    <td>{r.sku ?? "-"}</td>
                    <td>{r.category ?? "-"}</td>
                    <td>{r.size ?? "-"}</td>
                    <td>{r.color ?? "-"}</td>
                    <td className="text-right">{fmt(r.qty)}</td>
                    <td className="text-right">{fmt(r.selling_price)}</td>
                    <td className="text-right">{fmt(r.total_price)}</td>
                    <td>{r.payment_method}</td>
                    <td>{r.payment_status}</td>
                  </tr>
                ))}
                {salesRows.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={11}>
                      No rows. Click “Run Sales Report”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Expenses */}
      {tab === "expenses" && (
        <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="mb-1 text-gray-500">Category</div>
              <select
                className="rounded-md border bg-transparent p-2"
                value={expCat}
                onChange={(e) => setExpCat(e.target.value as ExpenseRow["category"] | "")}
              >
                <option value="">All</option>
                {["stock purchase", "marketing", "delivery", "rent", "utilities", "other"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <button onClick={runExpenseReport} className="rounded-md bg-primary text-white px-3 py-2">
              Run Expense Report
            </button>
            <button onClick={exportExpenseCSV} className="rounded-md border px-3 py-2" disabled={expRows.length === 0}>
              Export CSV
            </button>
            <div className="ml-auto text-sm">Total: <b>{fmt(expensesTotal)}</b></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {expRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2">{r.date}</td>
                    <td>{r.category}</td>
                    <td>{r.description ?? "-"}</td>
                    <td className="text-right">{fmt(r.amount)}</td>
                  </tr>
                ))}
                {expRows.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={4}>
                      No rows. Click “Run Expense Report”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* P&L */}
      {tab === "pl" && (
        <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                await Promise.all([runSalesReport(), runExpenseReport()]);
                await computeCOGS();
              }}
              className="rounded-md bg-primary text-white px-3 py-2"
            >
              Compute P&L (from filters)
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card title="Sales" value={salesTotal} prefix="Rs. " />
            <Card title="COGS (latest cost)" value={cogsTotal} prefix="Rs. " />
            <Card title="Expenses" value={expensesTotal} prefix="Rs. " />
            <Card title="Profit" value={profit} prefix="Rs. " />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            COGS is computed as <b>sold qty × latest purchase cost per variant</b>. If a variant has
            no purchases, we fall back to its product default cost.
          </p>
        </section>
      )}

      {/* Dead Stock */}
      {tab === "dead" && (
        <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
          <div className="mb-3 flex items-end gap-2">
            <label className="text-sm">
              <div className="mb-1 text-gray-500">No sales in (days)</div>
              <input
                type="number"
                className="rounded-md border bg-transparent p-2 w-28"
                value={deadDays}
                onChange={(e) => setDeadDays(Number(e.target.value || 0))}
                min={0}
              />
            </label>
            <button onClick={runDeadStock} className="rounded-md bg-primary text-white px-3 py-2">
              Run Dead Stock
            </button>
            <button onClick={exportDeadCSV} className="rounded-md border px-3 py-2" disabled={deadRows.length === 0}>
              Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2">Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Color</th>
                  <th className="text-right">Qty</th>
                  <th>Last Sale</th>
                </tr>
              </thead>
              <tbody>
                {deadRows.map((r) => (
                  <tr key={r.variant_id} className="border-t">
                    <td className="py-2">{r.product_name}</td>
                    <td>{r.sku ?? "-"}</td>
                    <td>{r.category ?? "-"}</td>
                    <td>{r.size ?? "-"}</td>
                    <td>{r.color ?? "-"}</td>
                    <td className="text-right">{fmt(r.qty)}</td>
                    <td>{r.last_sale ?? "—"}</td>
                  </tr>
                ))}
                {deadRows.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={7}>
                      No rows. Click “Run Dead Stock”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// --------------------------- Small UI helpers ---------------------------
function FilterSelect({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-gray-500">{label}</div>
      <select
        className="w-full rounded-md border bg-transparent p-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">-- All --</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Card({
  title,
  value,
  prefix = "",
}: {
  title: string;
  value: number;
  prefix?: string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-2">
        {prefix}
        {fmt(value)}
      </div>
    </div>
  );
}
