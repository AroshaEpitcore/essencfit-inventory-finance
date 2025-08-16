"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Option = { id: string; name: string };

type PaymentMethod = "cash" | "bank" | "digital" | "credit";
type PaymentStatus = "paid" | "pending";

type ProductRow = { id: string; name: string; selling_price: number | string | null };

type VariantRow = {
  id: string;
  qty: number | string | null;
  selling_price: number | string | null; // variant override
  size_id: string;
  color_id: string;
};

type TableRow = {
  id: string;
  size: string;
  color: string;
  inStock: number;
  price: number;   // editable sell price per row
  sellQty: number; // input qty to sell
};

export default function SalesPage() {
  const supabase = createClient();

  // lookups
  const [categories, setCategories] = useState<Option[]>([]);
  const [sizes, setSizes]           = useState<Option[]>([]);
  const [colors, setColors]         = useState<Option[]>([]);
  const [products, setProducts]     = useState<ProductRow[]>([]);

  const [selCat, setSelCat]   = useState("");
  const [selProd, setSelProd] = useState("");

  // defaults for sale rows
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [status, setStatus] = useState<PaymentStatus>("paid");

  // table data
  const [rows, setRows] = useState<TableRow[]>([]);
  const totalSellQty = useMemo(() => rows.reduce((a, r) => a + (r.sellQty || 0), 0), [rows]);

  // derived: default price of selected product
  const productDefaultPrice = useMemo(() => {
    const p = products.find((x) => x.id === selProd);
    return Number(p?.selling_price ?? 0);
  }, [products, selProd]);

  // load lookups
  useEffect(() => {
    (async () => {
      const [catRes, sizeRes, colorRes] = await Promise.all([
        supabase.from("categories").select("id,name").order("name"),
        supabase.from("sizes").select("id,name").order("name"),
        supabase.from("colors").select("id,name").order("name"),
      ]);

      if (catRes.error) toast.error(catRes.error.message);
      if (sizeRes.error) toast.error(sizeRes.error.message);
      if (colorRes.error) toast.error(colorRes.error.message);

      setCategories((catRes.data as Option[] | null) ?? []);
      setSizes((sizeRes.data as Option[] | null) ?? []);
      setColors((colorRes.data as Option[] | null) ?? []);
    })();
  }, [supabase]);

  // products by category (also get product default selling_price here)
  useEffect(() => {
    (async () => {
      setSelProd("");
      setRows([]);
      if (!selCat) return;

      const { data, error } = await supabase
        .from("products")
        .select("id,name,selling_price")
        .eq("category_id", selCat)
        .order("name");

      if (error) {
        toast.error(error.message);
        return;
      }

      const list = ((data ?? []) as ProductRow[]).map((p) => ({
        id: p.id,
        name: p.name,
        selling_price: p.selling_price,
      }));
      setProducts(list);
    })();
  }, [supabase, selCat]);

  // variants for selected product (simple columns only)
  useEffect(() => {
    (async () => {
      setRows([]);
      if (!selProd) return;

      const { data, error } = await supabase
        .from("product_variants")
        .select("id, qty, selling_price, size_id, color_id")
        .eq("product_id", selProd)
        .order("id");

      if (error) {
        toast.error(error.message);
        return;
      }

      const variants = (data ?? []) as VariantRow[];

      // local maps for size/color names
      const sizeMap  = new Map(sizes.map((s) => [s.id, s.name]));
      const colorMap = new Map(colors.map((c) => [c.id, c.name]));

      const normalized: TableRow[] = variants.map((v) => {
        const effPrice = Number(v.selling_price ?? productDefaultPrice ?? 0);
        return {
          id: v.id,
          size: sizeMap.get(v.size_id) ?? "",
          color: colorMap.get(v.color_id) ?? "",
          inStock: Number(v.qty ?? 0),
          price: effPrice,
          sellQty: 0,
        };
      });
      setRows(normalized);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selProd, sizes, colors, productDefaultPrice]);

  async function sellOne(variantId: string, price: number) {
    const { error } = await supabase.from("sales").insert({
      variant_id: variantId,
      qty: 1,
      selling_price: price,
      payment_method: method,
      payment_status: status,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sold 1");
    await refreshStock();
  }

  async function sellRow(r: TableRow) {
    const q = Number(r.sellQty || 0);
    if (q <= 0) return toast.error("Enter a positive quantity");

    const { error } = await supabase.from("sales").insert({
      variant_id: r.id,
      qty: q,
      selling_price: Number(r.price || 0),
      payment_method: method,
      payment_status: status,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Sold ${q}`);
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, sellQty: 0 } : x)));
    await refreshStock();
  }

  async function sellAll() {
    const batch = rows.filter((r) => r.sellQty > 0);
    if (batch.length === 0) return toast("Nothing to sell");

    const payload = batch.map((r) => ({
      variant_id: r.id,
      qty: r.sellQty,
      selling_price: Number(r.price || 0),
      payment_method: method,
      payment_status: status,
    }));

    const { error } = await supabase.from("sales").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    const total = batch.reduce((a, r) => a + r.sellQty, 0);
    toast.success(`Sold ${total} items`);
    setRows((prev) => prev.map((r) => ({ ...r, sellQty: 0 })));
    await refreshStock();
  }

  async function refreshStock() {
    if (!selProd) return;

    const { data, error } = await supabase
      .from("product_variants")
      .select("id, qty, selling_price")
      .eq("product_id", selProd);

    if (error) {
      toast.error(error.message);
      return;
    }

    const items = (data ?? []) as Array<{
      id: string;
      qty: number | string | null;
      selling_price: number | string | null;
    }>;

    const map = new Map<string, { qty: number; price: number }>();
    items.forEach((v) => {
      const price = Number(v.selling_price ?? productDefaultPrice ?? 0);
      map.set(v.id, { qty: Number(v.qty ?? 0), price });
    });

    setRows((prev) =>
      prev.map((r) => {
        const hit = map.get(r.id);
        return hit ? { ...r, inStock: hit.qty, price: r.price || hit.price } : r;
      })
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Quick Sales (Minus Stock)</h1>

      {/* Filters */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Category</div>
            <select
              className="w-full rounded-md border bg-transparent p-2"
              value={selCat}
              onChange={(e) => setSelCat(e.target.value)}
            >
              <option value="">-- Select --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Product</div>
            <select
              className="w-full rounded-md border bg-transparent p-2"
              value={selProd}
              onChange={(e) => setSelProd(e.target.value)}
              disabled={!selCat}
            >
              <option value="">-- Select --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <div className="mb-1 text-gray-500">Defaults</div>
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-transparent p-2"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="digital">Digital</option>
                <option value="credit">Credit</option>
              </select>
              <select
                className="rounded-md border bg-transparent p-2"
                value={status}
                onChange={(e) => setStatus(e.target.value as PaymentStatus)}
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Tip: Use the lightning buttons to sell <b>1</b> instantly. Triggers prevent negative stock.
        </p>
      </section>

      {/* Table */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        {!selProd ? (
          <p className="text-sm text-gray-500">Pick a category and product to begin.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr>
                    <th className="py-2">Size</th>
                    <th>Color</th>
                    <th>In Stock</th>
                    <th className="w-36">Sell Price</th>
                    <th className="w-28">Qty</th>
                    <th className="w-48"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2">{r.size}</td>
                      <td>{r.color}</td>
                      <td>{r.inStock}</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="w-32 rounded-md border bg-transparent p-1"
                          value={r.price}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, price: v } : x)));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className="w-24 rounded-md border bg-transparent p-1"
                          value={r.sellQty}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, sellQty: v } : x)));
                          }}
                        />
                      </td>
                      <td className="space-x-2 py-2">
                        <button
                          onClick={() => sellOne(r.id, r.price)}
                          className="rounded-md border px-2 py-1"
                          title="Sell 1 quickly"
                        >
                          Sell 1
                        </button>
                        <button
                          onClick={() => sellRow(r)}
                          className="rounded-md bg-primary text-white px-3 py-1"
                        >
                          Sell
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="py-2 text-gray-500" colSpan={6}>
                        No variants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="text-sm text-gray-500">
                Total to sell: <b>{totalSellQty}</b>
              </div>
              <button onClick={sellAll} className="rounded-md bg-primary text-white px-4 py-2">
                Sell All Entered
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
