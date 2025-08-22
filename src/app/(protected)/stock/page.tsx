"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Option = { id: string; name: string };
type Product = { id: string; name: string; cost_price: number };

type ProductVariantRow = {
  id: string;
  size_id: string;
  color_id: string;
  qty: number | string | null;
};

type PurchaseInsert = {
  variant_id: string;
  qty: number;
  cost_price: number;
};

type Cell = {
  sizeId: string;
  sizeName: string;
  colorId: string;
  colorName: string;
  variantId: string | null;
  currentQty: number;
  addQty: number;
  cost: number;
};

type ConfirmState = {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

type ReassignState = {
  open: boolean;
  from?: Option;
  toId: string;
};

export default function StockPage() {
  const supabase = createClient();

  // Lookups
  const [categories, setCategories] = useState<Option[]>([]);
  const [sizes, setSizes] = useState<Option[]>([]);
  const [colors, setColors] = useState<Option[]>([]);

  // Product list and selection
  const [products, setProducts] = useState<Product[]>([]);
  const [selCat, setSelCat] = useState("");
  const [selProd, setSelProd] = useState("");

  // New lookup inputs
  const [newCategory, setNewCategory] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newColor, setNewColor] = useState("");

  // Product creation inputs
  const [pName, setPName] = useState("");
  const [pSku, setPSku] = useState("");
  const [pCost, setPCost] = useState<number | "">("");
  const [pSell, setPSell] = useState<number | "">("");

  // Matrix state
  const [cells, setCells] = useState<Cell[]>([]);
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selProd) ?? null,
    [products, selProd]
  );

  // Pretty dialogs
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false });
  const [reassign, setReassign] = useState<ReassignState>({ open: false, toId: "" });
  function openConfirm(opts: Omit<ConfirmState, "open">) {
    setConfirm({ open: true, ...opts });
  }
  function closeConfirm() {
    setConfirm({ open: false });
  }

  // Load lookups
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
    })();
  }, [supabase]);

  // Load products by selected category
  useEffect(() => {
    (async () => {
      if (!selCat) {
        setProducts([]);
        setSelProd("");
        setCells([]);
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .select("id,name,cost_price")
        .eq("category_id", selCat)
        .order("name");

      if (error) {
        toast.error(error.message);
        return;
      }
      const rows = (data ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        cost_price: Number((r as { cost_price: number | string | null }).cost_price ?? 0),
      }));
      setProducts(rows);
    })();
  }, [supabase, selCat]);

  // Build Size × Color matrix for selected product
  useEffect(() => {
    (async () => {
      if (!selProd) {
        setCells([]);
        return;
      }

      const defaultCost = selectedProduct?.cost_price ?? 0;

      const { data: vData, error } = await supabase
        .from("product_variants")
        .select("id, size_id, color_id, qty")
        .eq("product_id", selProd);

      if (error) {
        toast.error(error.message);
        return;
      }

      const variants: ProductVariantRow[] = (vData ?? []).map((v) => ({
        id: v.id as string,
        size_id: v.size_id as string,
        color_id: v.color_id as string,
        qty: (v as { qty: number | string | null }).qty,
      }));

      const byKey: Record<string, { id: string; qty: number }> = {};
      variants.forEach((v) => {
        const key = `${v.size_id}::${v.color_id}`;
        byKey[key] = { id: v.id, qty: Number(v.qty ?? 0) };
      });

      const grid: Cell[] = [];
      for (const sz of sizes) {
        for (const col of colors) {
          const key = `${sz.id}::${col.id}`;
          const hit = byKey[key];
          grid.push({
            sizeId: sz.id,
            sizeName: sz.name,
            colorId: col.id,
            colorName: col.name,
            variantId: hit?.id ?? null,
            currentQty: hit ? hit.qty : 0,
            addQty: 0,
            cost: defaultCost,
          });
        }
      }
      setCells(grid);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selProd, sizes, colors]);

  // ------- helpers to refresh lists -------
  async function refreshCategories() {
    const { data } = await supabase.from("categories").select("id,name").order("name");
    setCategories((data as Option[] | null) ?? []);
  }
  async function refreshSizes() {
    const { data } = await supabase.from("sizes").select("id,name").order("name");
    setSizes((data as Option[] | null) ?? []);
  }
  async function refreshColors() {
    const { data } = await supabase.from("colors").select("id,name").order("name");
    setColors((data as Option[] | null) ?? []);
  }

  // ------- LOOKUP add -------
  async function addCategory() {
    if (!newCategory.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: newCategory.trim() });
    if (error) return toast.error(error.message);
    toast.success("Category added");
    setNewCategory("");
    await refreshCategories();
  }
  async function addSize() {
    if (!newSize.trim()) return;
    const { error } = await supabase.from("sizes").insert({ name: newSize.trim() });
    if (error) return toast.error(error.message);
    toast.success("Size added");
    setNewSize("");
    await refreshSizes();
  }
  async function addColor() {
    if (!newColor.trim()) return;
    const { error } = await supabase.from("colors").insert({ name: newColor.trim() });
    if (error) return toast.error(error.message);
    toast.success("Color added");
    setNewColor("");
    await refreshColors();
  }

  // ------- CATEGORY delete / reassign flow -------
  async function countProductsInCategory(categoryId: string) {
    const { count, error } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", categoryId);
    if (error) {
      toast.error(error.message);
      return 0;
    }
    return count ?? 0;
  }

  function askDeleteCategory(item: Option) {
    (async () => {
      const usage = await countProductsInCategory(item.id);

      if (usage > 0) {
        // open reassign dialog
        const hasOther = categories.some((c) => c.id !== item.id);
        if (!hasOther) {
          toast.error(
            `“${item.name}” is used by ${usage} product(s). Create another category first to reassign.`
          );
          return;
        }
        setReassign({ open: true, from: item, toId: "" });
        return;
      }

      // safe to delete directly
      openConfirm({
        title: "Delete category",
        message: `Delete “${item.name}”?`,
        confirmLabel: "Delete",
        onConfirm: async () => {
          const { error } = await supabase.from("categories").delete().eq("id", item.id);
          if (error) toast.error(error.message);
          else {
            toast.success("Category deleted");
            if (selCat === item.id) { setSelCat(""); setSelProd(""); setCells([]); }
            await refreshCategories();
          }
          closeConfirm();
        },
      });
    })();
  }

  async function reassignAndDelete() {
    if (!reassign.from || !reassign.toId) return;
    if (reassign.toId === reassign.from.id) return;

    // Move all products from -> to
    const { error: uErr } = await supabase
      .from("products")
      .update({ category_id: reassign.toId })
      .eq("category_id", reassign.from.id);

    if (uErr) {
      toast.error(uErr.message);
      return;
    }

    // Now delete the empty category
    const { error: dErr } = await supabase
      .from("categories")
      .delete()
      .eq("id", reassign.from.id);

    if (dErr) {
      toast.error(dErr.message);
      return;
    }

    toast.success("Products reassigned and category deleted");
    // Reset selection if we were on that category
    if (selCat === reassign.from.id) {
      setSelCat("");
      setSelProd("");
      setCells([]);
    }
    setReassign({ open: false, toId: "" });
    await refreshCategories();
  }

  // ------- PRODUCT create/delete -------
  async function createProduct() {
    if (!pName.trim() || !selCat) return toast.error("Pick a category and enter product name");
    const cost = Number(pCost || 0);
    const sell = Number(pSell || 0);
    const { error } = await supabase.from("products").insert({
      name: pName.trim(),
      category_id: selCat,
      sku: pSku.trim() || null,
      cost_price: cost,
      selling_price: sell,
    });
    if (error) return toast.error(error.message);
    toast.success("Product created");
    setPName(""); setPSku(""); setPCost(""); setPSell("");
    const { data } = await supabase
      .from("products")
      .select("id,name,cost_price")
      .eq("category_id", selCat)
      .order("name");
    const rows = (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      cost_price: Number((r as { cost_price: number | string | null }).cost_price ?? 0),
    }));
    setProducts(rows);
  }

  function askDeleteProduct() {
    if (!selProd) return toast.error("Select a product first.");
    const prod = products.find((p) => p.id === selProd);
    openConfirm({
      title: "Delete product",
      message: `Delete “${prod?.name ?? ""}”? Fails if variants have purchases/sales.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const { error } = await supabase.from("products").delete().eq("id", selProd);
        if (error) toast.error(error.message);
        else {
          toast.success("Product deleted");
          setSelProd("");
          setCells([]);
          const { data } = await supabase
            .from("products")
            .select("id,name,cost_price")
            .eq("category_id", selCat)
            .order("name");
          const rows = (data ?? []).map((r) => ({
            id: r.id as string,
            name: r.name as string,
            cost_price: Number((r as { cost_price: number | string | null }).cost_price ?? 0),
          }));
          setProducts(rows);
        }
        closeConfirm();
      },
    });
  }

  function askDeleteVariant(variantId: string, key: string, label: string) {
    openConfirm({
      title: "Delete variant",
      message: `${label}\nAllowed only when quantity is 0 and not referenced.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const { error } = await supabase.from("product_variants").delete().eq("id", variantId);
        if (error) toast.error(error.message);
        else {
          toast.success("Variant deleted");
          setCells((prev) =>
            prev.map((c) => {
              const k = `${c.sizeId}::${c.colorId}`;
              if (k === key) return { ...c, variantId: null, currentQty: 0 };
              return c;
            })
          );
        }
        closeConfirm();
      },
    });
  }

  // ------- SAVE STOCK ADDS -------
  async function saveStockAdds() {
    if (!selProd) return toast.error("Select a product first.");

    // 1) Create missing variants
    const missing = cells.filter((c) => c.addQty > 0 && !c.variantId);
    if (missing.length > 0) {
      const toInsert = missing.map((m) => ({
        product_id: selProd,
        size_id: m.sizeId,
        color_id: m.colorId,
        qty: 0,
      }));
      const { data, error } = await supabase
        .from("product_variants")
        .insert(toInsert)
        .select("id, size_id, color_id");
      if (error) {
        toast.error(error.message);
        return;
      }
      const created = (data ?? []) as Array<{ id: string; size_id: string; color_id: string }>;
      const mapNew = new Map<string, string>();
      created.forEach((v) => mapNew.set(`${v.size_id}::${v.color_id}`, v.id));
      setCells((prev) =>
        prev.map((c) => (!c.variantId ? { ...c, variantId: mapNew.get(`${c.sizeId}::${c.colorId}`) ?? null } : c))
      );
    }

    // 2) Insert purchases
    const rows: PurchaseInsert[] = cells
      .filter((c) => c.addQty > 0 && c.variantId)
      .map((c) => ({ variant_id: c.variantId as string, qty: c.addQty, cost_price: Number(c.cost || 0) }));

    if (rows.length === 0) {
      toast("Nothing to add");
      return;
    }

    const { error: perr } = await supabase.from("purchases").insert(rows);
    if (perr) {
      toast.error(perr.message);
      return;
    }

    toast.success("Stock added successfully");

    // 3) Refresh qty
    const { data: v2 } = await supabase
      .from("product_variants")
      .select("id, size_id, color_id, qty")
      .eq("product_id", selProd);

    const typed: ProductVariantRow[] = (v2 ?? []).map((v) => ({
      id: v.id as string,
      size_id: v.size_id as string,
      color_id: v.color_id as string,
      qty: (v as { qty: number | string | null }).qty,
    }));

    const byKey: Record<string, { id: string; qty: number }> = {};
    typed.forEach((v) => {
      byKey[`${v.size_id}::${v.color_id}`] = { id: v.id, qty: Number(v.qty ?? 0) };
    });

    setCells((prev) =>
      prev.map((c) => {
        const hit = byKey[`${c.sizeId}::${c.colorId}`];
        return {
          ...c,
          variantId: hit?.id ?? c.variantId,
          currentQty: hit?.qty ?? c.currentQty,
          addQty: 0,
        };
      })
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Add / Manage Stock</h1>

      {/* Lookups manager */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Lookups</h2>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <LookupCard
            title="Categories"
            placeholder="New category"
            value={newCategory}
            onChange={setNewCategory}
            onAdd={addCategory}
            onDelete={(item) => askDeleteCategory(item)}
            items={categories}
          />
          <LookupCard
            title="Sizes"
            placeholder="New size (e.g. S, M, L)"
            value={newSize}
            onChange={setNewSize}
            onAdd={addSize}
            onDelete={async (i) => {
              openConfirm({
                title: "Delete size",
                message: `Delete “${i.name}”? Will fail if used by variants.`,
                confirmLabel: "Delete",
                onConfirm: async () => {
                  const { error } = await supabase.from("sizes").delete().eq("id", i.id);
                  if (error) toast.error(error.message);
                  else { toast.success("Size deleted"); await refreshSizes(); }
                  closeConfirm();
                },
              });
            }}
            items={sizes}
          />
          <LookupCard
            title="Colors"
            placeholder="New color (e.g. Black)"
            value={newColor}
            onChange={setNewColor}
            onAdd={addColor}
            onDelete={async (i) => {
              openConfirm({
                title: "Delete color",
                message: `Delete “${i.name}”? Will fail if used by variants.`,
                confirmLabel: "Delete",
                onConfirm: async () => {
                  const { error } = await supabase.from("colors").delete().eq("id", i.id);
                  if (error) toast.error(error.message);
                  else { toast.success("Color deleted"); await refreshColors(); }
                  closeConfirm();
                },
              });
            }}
            items={colors}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Note: Creating/deleting lookups requires <b>admin</b>. Deleting categories in use will ask you to reassign.
        </p>
      </section>

      {/* Product creator */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Create Product</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-6">
          <label className="text-sm md:col-span-2">
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
            <div className="mb-1 text-gray-500">Product name</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="EssenceFit Sports Shorts"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">SKU</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={pSku}
              onChange={(e) => setPSku(e.target.value)}
              placeholder="EF-SS-001"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Default Cost</div>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-md border bg-transparent p-2"
              value={pCost}
              onChange={(e) => setPCost(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="750.00"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Default Selling</div>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-md border bg-transparent p-2"
              value={pSell}
              onChange={(e) => setPSell(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="1490.00"
            />
          </label>
          <div className="flex items-end gap-2">
            <button onClick={createProduct} className="rounded-md bg-primary text-white px-4 py-2">
              Create Product
            </button>
            {!!selProd && (
              <button onClick={askDeleteProduct} className="rounded-md border px-3 py-2">
                Delete Selected Product
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Product selection + matrix */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Add Quantities by Size × Color</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Category</div>
            <select
              className="w-full rounded-md border bg-transparent p-2"
              value={selCat}
              onChange={(e) => {
                setSelCat(e.target.value);
                setSelProd("");
              }}
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
        </div>

        {!selProd ? (
          <p className="text-sm text-gray-500 mt-3">Pick a category and product to see the grid.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-y-1">
              <thead>
                <tr>
                  <th className="text-left py-1">Size</th>
                  <th className="text-left py-1">Color</th>
                  <th className="text-left py-1">Current</th>
                  <th className="text-left py-1">Add Qty</th>
                  <th className="text-left py-1">Cost</th>
                  <th className="text-left py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c, idx) => {
                  const key = `${c.sizeId}::${c.colorId}`;
                  const canDeleteVariant = !!c.variantId && c.currentQty === 0;
                  return (
                    <tr key={key} className="bg-gray-50/60 dark:bg-gray-900/50">
                      <td className="py-2 px-2">{c.sizeName}</td>
                      <td className="py-2 px-2">
                        {c.colorName}
                        {!c.variantId && (
                          <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700">
                            new
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2">{c.currentQty}</td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          min={0}
                          className="w-24 rounded-md border bg-transparent p-1"
                          value={c.addQty}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            setCells((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, addQty: v } : row))
                            );
                          }}
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="w-28 rounded-md border bg-transparent p-1"
                          value={c.cost}
                          onChange={(e) => {
                            const v = Number(e.target.value || 0);
                            setCells((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, cost: v } : row))
                            );
                          }}
                        />
                      </td>
                      <td className="py-2 px-2">
                        {canDeleteVariant ? (
                          <button
                            onClick={() =>
                              askDeleteVariant(
                                c.variantId as string,
                                key,
                                `${c.sizeName} / ${c.colorName}`
                              )
                            }
                            className="rounded-md px-2 py-1 text-red-600 hover:text-red-700 hover:underline"
                            title="Delete variant (qty must be 0)"
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {cells.length === 0 && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={6}>
                      No sizes/colors yet. Add them above first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setCells((prev) => prev.map((c) => ({ ...c, addQty: 0 })))}
                className="rounded-md border px-3 py-2"
              >
                Clear Adds
              </button>
              <button onClick={saveStockAdds} className="rounded-md bg-primary text-white px-4 py-2">
                Save Stock Adds
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Saving creates any missing variants, then inserts rows into <code>purchases</code>.
              Triggers update <code>product_variants.qty</code> and write <code>stock_history</code>.
            </p>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        onCancel={closeConfirm}
        onConfirm={confirm.onConfirm}
      />

      <ReassignDialog
        open={reassign.open}
        from={reassign.from}
        categories={categories.filter((c) => c.id !== reassign.from?.id)}
        toId={reassign.toId}
        onChangeTo={(v) => setReassign((s) => ({ ...s, toId: v }))}
        onCancel={() => setReassign({ open: false, toId: "" })}
        onConfirm={reassignAndDelete}
      />
    </div>
  );
}

function LookupCard(props: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onDelete?: (item: Option) => void;
  items: Option[];
}) {
  const { title, placeholder, value, onChange, onAdd, onDelete, items } = props;
  return (
    <div>
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border bg-transparent p-2"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button onClick={onAdd} className="rounded-md bg-primary text-white px-3">
          Add
        </button>
      </div>
      <div className="mt-2 max-h-40 overflow-auto border rounded-md p-2 text-xs">
        {items.map((i) => (
          <div key={i.id} className="py-0.5 flex items-center justify-between gap-2">
            <span>{i.name}</span>
            {onDelete && (
              <button
                onClick={() => onDelete(i)}
                className="px-2 py-0.5 rounded-md text-red-600 hover:text-red-700 hover:underline"
                aria-label={`Delete ${i.name}`}
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="text-gray-500">No items yet</div>}
      </div>
    </div>
  );
}

function ConfirmDialog(props: {
  open: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm?: () => void | Promise<void>;
}) {
  const { open, title, message, confirmLabel = "Confirm", onCancel, onConfirm } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl p-5">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} className="rounded-md border px-4 py-2">Cancel</button>
            <button onClick={onConfirm} className="rounded-md bg-red-600 text-white px-4 py-2">
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReassignDialog(props: {
  open: boolean;
  from?: Option;
  categories: Option[];
  toId: string;
  onChangeTo: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { open, from, categories, toId, onChangeTo, onCancel, onConfirm } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted || !from) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative z-10 w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl p-5">
          <h3 className="text-lg font-semibold">Reassign products</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            <b>{from.name}</b> is in use. Move all products to another category, then delete it.
          </p>
          <div className="mt-4">
            <label className="text-sm block">
              <span className="mb-1 block text-gray-500">Move to category</span>
              <select
                className="w-full rounded-md border bg-transparent p-2"
                value={toId}
                onChange={(e) => onChangeTo(e.target.value)}
              >
                <option value="">-- Choose target --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onCancel} className="rounded-md border px-4 py-2">Cancel</button>
            <button
              onClick={onConfirm}
              disabled={!toId}
              className="rounded-md bg-primary text-white px-4 py-2 disabled:opacity-50"
            >
              Reassign & Delete
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
