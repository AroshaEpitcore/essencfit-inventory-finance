import { createServerSupabase } from "@/lib/supabase/server";
import { endOfMonth, startOfMonth } from "date-fns";

type SaleRow    = { total_price: number | string | null };
type ExpenseRow = { amount:      number | string | null };
type VariantRow = { qty:         number | string | null };

type LowStockRow = {
  variant_id: string;
  product_name: string;
  product_sku: string | null;
  category?: string | null;
  size: string | null;
  color: string | null;
  qty: number | string | null;
  min_required: number | string | null;
  selling_price?: number | string | null;
};

type SizeTotalRow = {
  category: string | null;
  size: string | null;
  qty: number | string | null;
};

function sumNumber<
  T extends Record<string, unknown>,
  K extends keyof T
>(arr: T[] | null | undefined, key: K): number {
  return (arr ?? []).reduce((a, r) => a + Number((r[key] ?? 0) as number), 0);
}

export default async function Dashboard() {
  const supabase = await createServerSupabase();

  const todayISO = new Date().toISOString().slice(0, 10);
  const start = startOfMonth(new Date()).toISOString().slice(0, 10);
  const end   = endOfMonth(new Date()).toISOString().slice(0, 10);

  // Business default category for quick view
  const QUICK_CATEGORY = "Shorts"; // adjust anytime

  const [
    { data: salesToday },
    { data: salesMonth },
    { data: expensesMonth },
    { data: lowStockRaw },
    { data: variants },
    { data: sizeTotalsRaw },
  ] = await Promise.all([
    supabase.from("sales").select("total_price").gte("date", todayISO) as unknown as Promise<{ data: SaleRow[] | null }>,
    supabase.from("sales").select("total_price").gte("date", start).lte("date", end) as unknown as Promise<{ data: SaleRow[] | null }>,
    supabase.from("expenses").select("amount").gte("date", start).lte("date", end) as unknown as Promise<{ data: ExpenseRow[] | null }>,
    supabase
      .from("v_low_stock")
      .select("variant_id, product_name, product_sku, size, color, qty, min_required")
      .limit(8) as unknown as Promise<{ data: LowStockRow[] | null }>,
    supabase.from("product_variants").select("qty") as unknown as Promise<{ data: VariantRow[] | null }>,
    supabase
      .from("v_qty_by_category_size")
      .select("category, size, qty")
      .eq("category", QUICK_CATEGORY) as unknown as Promise<{ data: SizeTotalRow[] | null }>,
  ]);

  const lowStock: Array<Omit<LowStockRow, "qty" | "min_required"> & { qty: number; min_required: number }> =
    (lowStockRaw ?? []).map((r) => ({
      ...r,
      qty: Number(r.qty ?? 0),
      min_required: Number(r.min_required ?? 0),
    }));

  const salesTodaySum = sumNumber(salesToday, "total_price");
  const salesMonthSum = sumNumber(salesMonth, "total_price");
  const expensesSum   = sumNumber(expensesMonth, "amount");
  const monthProfit   = salesMonthSum - expensesSum;
  const totalPcs      = sumNumber(variants, "qty");

  // Normalize size totals for the quick view
  const sizeTotals = (sizeTotalsRaw ?? []).map((r) => ({
    category: r.category ?? QUICK_CATEGORY,
    size: r.size ?? "",
    qty: Number(r.qty ?? 0),
  }));

  // If you want to force an order for sizes:
  const SIZE_ORDER = ["XS","S","M","L","XL","XXL","3XL"];
  const orderedSizeTotals = sizeTotals
    .slice()
    .sort((a, b) => {
      const ia = SIZE_ORDER.indexOf(a.size);
      const ib = SIZE_ORDER.indexOf(b.size);
      if (ia === -1 && ib === -1) return a.size.localeCompare(b.size);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {/* Top KPI cards */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total Stock (pcs)" value={totalPcs} />
        <Card title="Today’s Sales" value={salesTodaySum} prefix="Rs. " />
        <Card title="This Month Sales" value={salesMonthSum} prefix="Rs. " />
        <Card title="This Month Profit" value={monthProfit} prefix="Rs. " />
      </section>

      {/* Quick View: Qty by Size for a Category */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">
            {QUICK_CATEGORY} — Qty by Size
          </h2>
          {/* (Optional) later: turn into a <select> of categories */}
        </div>
        {orderedSizeTotals.length === 0 ? (
          <p className="text-sm text-gray-500">No size totals yet.</p>
        ) : (
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {orderedSizeTotals.map((row) => (
              <MiniCard key={row.size} title={row.size} value={row.qty} />
            ))}
          </div>
        )}
      </section>

      {/* Low Stock table */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-2">Low Stock</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="py-2">Product</th>
                <th>SKU</th>
                <th>Size</th>
                <th>Color</th>
                <th>Qty</th>
                <th>Min</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((r) => (
                <tr key={r.variant_id} className="border-t">
                  <td className="py-2">{r.product_name}</td>
                  <td>{r.product_sku}</td>
                  <td>{r.size}</td>
                  <td>{r.color}</td>
                  <td>{r.qty}</td>
                  <td>{r.min_required}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ title, value, prefix = "" }: { title: string; value: number; prefix?: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-2">
        {prefix}
        {new Intl.NumberFormat().format(value || 0)}
      </div>
    </div>
  );
}

function MiniCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-3">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-semibold mt-1">{new Intl.NumberFormat().format(value)}</div>
    </div>
  );
}
