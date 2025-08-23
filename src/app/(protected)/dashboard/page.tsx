import { createServerSupabase } from "@/lib/supabase/server";
import { endOfMonth, startOfMonth } from "date-fns";

// ---------- Row types from your schema ----------
type SaleLine = {
  variant_id: string | null;
  qty: number | string | null;
  total_price: number | string | null;
};

type ExpenseRow = { amount: number | string | null };
type VariantRow = { qty: number | string | null };

type LowStockRow = {
  variant_id: string;
  product_name: string;
  product_sku: string | null;
  size: string | null;
  color: string | null;
  qty: number | string | null;
  min_required: number | string | null;
};

type SizeLookupRow = {
  category: string | null;
  size: string | null;
  qty: number | string | null;
};

type CatNameRow = { category: string | null };

// ---------- Helpers ----------
function sumNumber<T extends Record<string, unknown>, K extends keyof T>(
  arr: T[] | null | undefined,
  key: K
): number {
  return (arr ?? []).reduce((a, r) => a + Number((r[key] ?? 0) as number), 0);
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

// ================================================================
//                           SERVER COMPONENT
// ================================================================
export default async function Dashboard() {
  const supabase = await createServerSupabase();

  const todayISO = new Date().toISOString().slice(0, 10);
  const start = startOfMonth(new Date()).toISOString().slice(0, 10);
  const end = endOfMonth(new Date()).toISOString().slice(0, 10);

  // preferred default category label
  const QUICK_CATEGORY = "Shorts";

  // ---- parallel fetches (typed) ----
  const [
    { data: salesToday },
    { data: salesMonth },
    { data: salesAll },
    { data: expensesMonth },
    { data: lowStockRaw },
    { data: variants },
    productsCountRes,
    variantsCountRes,
    { data: catsFromView },
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("variant_id, qty, total_price")
      .gte("date", todayISO)
      .returns<SaleLine[]>(),
    supabase
      .from("sales")
      .select("variant_id, qty, total_price")
      .gte("date", start)
      .lte("date", end)
      .returns<SaleLine[]>(),
    supabase.from("sales").select("variant_id, qty, total_price").returns<SaleLine[]>(),
    supabase
      .from("expenses")
      .select("amount")
      .gte("date", start)
      .lte("date", end)
      .returns<ExpenseRow[]>(),
    supabase
      .from("v_low_stock")
      .select("variant_id, product_name, product_sku, size, color, qty, min_required")
      .limit(8)
      .returns<LowStockRow[]>(),
    supabase.from("product_variants").select("qty").returns<VariantRow[]>(),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("product_variants").select("id", { count: "exact", head: true }),
    supabase.from("v_variant_lookup").select("category").returns<CatNameRow[]>(),
  ]);

  const productsCount = productsCountRes.count ?? 0;
  const variantsCount = variantsCountRes.count ?? 0;

  // ---- normalize aggregates ----
  const lowStock = (lowStockRaw ?? []).map((r) => ({
    ...r,
    qty: Number(r.qty ?? 0),
    min_required: Number(r.min_required ?? 0),
  }));

  const salesTodaySum = sumNumber(salesToday, "total_price");
  const salesMonthSum = sumNumber(salesMonth, "total_price");
  const salesAllSum = sumNumber(salesAll, "total_price");

  const unitsToday = sumNumber(salesToday, "qty");
  const unitsMonth = sumNumber(salesMonth, "qty");
  const unitsAll = sumNumber(salesAll, "qty");

  const expensesSum = sumNumber(expensesMonth, "amount");
  const totalPcs = sumNumber(variants, "qty");

  // ---- COGS via latest purchase cost per variant (fallback to product default) ----
  async function computeCOGSFor(lines: SaleLine[]): Promise<number> {
    const qtyByVariant = new Map<string, number>();
    for (const s of lines ?? []) {
      const vid = s.variant_id;
      if (!vid) continue;
      const q = Number(s.qty ?? 0);
      if (q <= 0) continue;
      qtyByVariant.set(vid, (qtyByVariant.get(vid) ?? 0) + q);
    }
    if (qtyByVariant.size === 0) return 0;

    const variantIds = Array.from(qtyByVariant.keys());

    type PurchaseRow = { variant_id: string; cost_price: number | string; created_at: string };
    const { data: purchases, error: pErr } = await supabase
      .from("purchases")
      .select("variant_id, cost_price, created_at")
      .in("variant_id", variantIds)
      .order("created_at", { ascending: false })
      .returns<PurchaseRow[]>();
    if (pErr) throw new Error(pErr.message);

    const latestCost = new Map<string, number>();
    for (const row of purchases ?? []) {
      if (!latestCost.has(row.variant_id)) {
        latestCost.set(row.variant_id, Number(row.cost_price));
      }
    }

    // fetch fallback costs for variants with no purchases
    const missing = variantIds.filter((id) => !latestCost.has(id));
    if (missing.length > 0) {
      type PvWithProductCost = { id: string; product: { cost_price: number | string | null } | null };
      const { data: fallback, error: fErr } = await supabase
        .from("product_variants")
        .select("id, product:products!product_variants_product_id_fkey ( cost_price )")
        .in("id", missing)
        .returns<PvWithProductCost[]>();
      if (fErr) throw new Error(fErr.message);
      for (const r of fallback ?? []) {
        latestCost.set(r.id, Number(r.product?.cost_price ?? 0));
      }
    }

    let cogs = 0;
    for (const [vid, qty] of qtyByVariant.entries()) {
      cogs += (latestCost.get(vid) ?? 0) * qty;
    }
    return cogs;
  }

  const [cogsMonth, cogsAll] = await Promise.all([
    computeCOGSFor(salesMonth ?? []),
    computeCOGSFor(salesAll ?? []),
  ]);

  const grossProfitMonth = salesMonthSum - cogsMonth;
  const grossProfitAll = salesAllSum - cogsAll;
  const netProfitMonth = grossProfitMonth - expensesSum;

  // ---- Pick a category for “Qty by Size” ----
  const availableCats = Array.from(
    new Set((catsFromView ?? []).map((r) => (r.category ?? "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const quickChosen = availableCats.includes(QUICK_CATEGORY)
    ? QUICK_CATEGORY
    : availableCats[0] ?? null;

  // ---- Size totals for chosen category ----
  let sizeRows: SizeLookupRow[] = [];
  if (quickChosen) {
    const { data: sizeLookupData } = await supabase
      .from("v_variant_lookup")
      .select("category, size, qty")
      .eq("category", quickChosen)
      .returns<SizeLookupRow[]>();

    sizeRows = sizeLookupData ?? [];
  }

  const groupedSize = new Map<string, number>();
  for (const r of sizeRows) {
    const size = (r.size ?? "") as string;
    const qty = Number(r.qty ?? 0);
    groupedSize.set(size, (groupedSize.get(size) ?? 0) + qty);
  }
  const sizeTotals = Array.from(groupedSize.entries()).map(([size, qty]) => ({ size, qty }));
  const orderedSizeTotals = sizeTotals.sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.size);
    const ib = SIZE_ORDER.indexOf(b.size);
    if (ia === -1 && ib === -1) return a.size.localeCompare(b.size);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  // ---------- UI ----------
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Dashboard</h1>

      {/* KPIs row 1 */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Total Stock (pcs)" value={totalPcs} />
        <Card title="Today’s Sales" value={salesTodaySum} prefix="Rs. " />
        <Card title="This Month Sales" value={salesMonthSum} prefix="Rs. " />
        <Card title="This Month Profit (Gross)" value={grossProfitMonth} prefix="Rs. " />
      </section>

      {/* KPIs row 2 */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Units Sold Today" value={unitsToday} />
        <Card title="Units Sold (Month)" value={unitsMonth} />
        <Card title="Expenses (Month)" value={expensesSum} prefix="Rs. " />
        <Card title="This Month Net (Gross−Expenses)" value={netProfitMonth} prefix="Rs. " />
      </section>

      {/* KPIs row 3 */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="All-time Sales" value={salesAllSum} prefix="Rs. " />
        <Card title="All-time Profit (Gross)" value={grossProfitAll} prefix="Rs. " />
        <Card title="Products" value={productsCount} />
        <Card title="Variants" value={variantsCount} />
      </section>

      {/* KPIs row 4 (small extras you can extend later) */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Low-stock Items" value={lowStock.length} />
      </section>

      {/* Quick View: Qty by Size (auto chosen category) */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">
            {quickChosen ? `${quickChosen} — Qty by Size` : "Qty by Size"}
          </h2>
          {quickChosen && quickChosen !== QUICK_CATEGORY && (
            <span className="text-xs text-gray-500">
              (Tip: “{QUICK_CATEGORY}” not found; showing “{quickChosen}”.)
            </span>
          )}
        </div>
        {!quickChosen ? (
          <p className="text-sm text-gray-500">No categories with stock yet.</p>
        ) : orderedSizeTotals.length === 0 ? (
          <p className="text-sm text-gray-500">No size totals for this category.</p>
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
                  <td>{r.product_sku ?? "-"}</td>
                  <td>{r.size ?? "-"}</td>
                  <td>{r.color ?? "-"}</td>
                  <td>{r.qty}</td>
                  <td>{r.min_required}</td>
                </tr>
              ))}
              {lowStock.length === 0 && (
                <tr>
                  <td className="py-3 text-gray-500" colSpan={6}>
                    No low-stock items.
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

// ---------- tiny UI helpers ----------
function Card({ title, value, prefix = "" }: { title: string; value: number; prefix?: string }) {
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-2">
        {prefix}
        {new Intl.NumberFormat().format(Number(value || 0))}
      </div>
    </div>
  );
}

function MiniCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-3">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-semibold mt-1">
        {new Intl.NumberFormat().format(Number(value || 0))}
      </div>
    </div>
  );
}
