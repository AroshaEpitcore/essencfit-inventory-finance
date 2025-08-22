"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Option = { id: string; name: string };

// Product row we edit
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  selling_price: number;
};

// Normalized variant rows for the UI
type VariantRow = {
  id: string;
  size_name: string;
  color_name: string;
  qty: number;
  min_qty_alert: number;
  selling_price: number | null; // override
};

// Raw row from Supabase (size/color may be object OR array depending on generated types)
type RawVariantRow = {
  id: string;
  qty: number | string | null;
  min_qty_alert: number | string | null;
  selling_price: number | string | null;
  size: { name: string } | { name: string }[] | null;
  color: { name: string } | { name: string }[] | null;
};

export default function Inventory() {
  const supabase = createClient();

  // Lookups / filters
  const [categories, setCategories] = useState<Option[]>([]);
  const [productsOpt, setProductsOpt] = useState<Option[]>([]);
  const [sizes, setSizes] = useState<Option[]>([]);
  const [colors, setColors] = useState<Option[]>([]);
  const [selCat, setSelCat] = useState("");
  const [selProd, setSelProd] = useState("");
  const [selSize, setSelSize] = useState("");
  const [selColor, setSelColor] = useState("");
  const [qty, setQty] = useState<number | null>(null);

  // Role
  const [role, setRole] = useState<"admin" | "staff" | "unknown">("unknown");
  const isAdmin = role === "admin";

  // Product form (edit)
  const [product, setProduct] = useState<ProductRow | null>(null);

  // Variants list (edit inline)
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [creatingVariant, setCreatingVariant] = useState<{ sizeId: string; colorId: string }>({
    sizeId: "",
    colorId: "",
  });

  // Load initial lookups + role
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

      // who am I?
      const { data: r } = await supabase.rpc("app_user_role");
      if (typeof r === "string" && (r === "admin" || r === "staff")) setRole(r);
      else setRole("unknown");
    })();
  }, [supabase]);

  // Load products for selected category
  useEffect(() => {
    (async () => {
      if (!selCat) {
        setProductsOpt([]);
        setSelProd("");
        setProduct(null);
        setVariants([]);
        return;
      }
      const { data, error } = await supabase
        .from("products")
        .select("id,name")
        .eq("category_id", selCat)
        .order("name");
      if (error) toast.error(error.message);
      setProductsOpt(((data ?? []) as Array<{ id: string; name: string }>).map((r) => ({ id: r.id, name: r.name })));
    })();
  }, [supabase, selCat]);

  // When product changes, load product details and variants
  useEffect(() => {
    (async () => {
      setProduct(null);
      setVariants([]);
      if (!selProd) return;

      // Product details
      const { data: p, error: pe } = await supabase
        .from("products")
        .select("id,name,sku,cost_price,selling_price")
        .eq("id", selProd)
        .maybeSingle();
      if (pe) {
        toast.error(pe.message);
        return;
      }
      if (p) {
        setProduct({
          id: p.id as string,
          name: String(p.name ?? ""),
          sku: (p as { sku: string | null }).sku ?? null,
          cost_price: Number((p as { cost_price: number | string | null }).cost_price ?? 0),
          selling_price: Number((p as { selling_price: number | string | null }).selling_price ?? 0),
        });
      }

      // Variants (normalize size/color whether object or array)
      const { data: v, error: ve } = await supabase
        .from("product_variants")
        .select("id, qty, min_qty_alert, selling_price, size:sizes(name), color:colors(name)")
        .eq("product_id", selProd)
        .order("id", { ascending: true });
      if (ve) {
        toast.error(ve.message);
        return;
      }
      const rows: VariantRow[] = ((v ?? []) as RawVariantRow[]).map((row) => {
        const sizeObj = Array.isArray(row.size) ? row.size[0] : row.size;
        const colorObj = Array.isArray(row.color) ? row.color[0] : row.color;
        return {
          id: row.id,
          qty: Number(row.qty ?? 0),
          min_qty_alert: Number(row.min_qty_alert ?? 0),
          selling_price: row.selling_price === null ? null : Number(row.selling_price),
          size_name: sizeObj?.name ?? "-",
          color_name: colorObj?.name ?? "-",
        };
      });
      setVariants(rows);
    })();
  }, [supabase, selProd]);

  // Quick check
  async function checkQty() {
    if (!selProd || !selSize || !selColor) return toast.error("Pick product, size, color");
    const sizeName = sizes.find((s) => s.id === selSize)?.name ?? "";
    const colorName = colors.find((c) => c.id === selColor)?.name ?? "";
    const prodName = productsOpt.find((p) => p.id === selProd)?.name ?? "";

    const { data, error } = await supabase
      .from("v_variant_lookup")
      .select("qty")
      .eq("product_name", prodName)
      .eq("size", sizeName)
      .eq("color", colorName)
      .maybeSingle();

    if (error) return toast.error(error.message);
    setQty(Number((data as { qty?: number | string | null } | null)?.qty ?? 0));
  }

  // -------------------- PRODUCT (update) --------------------
  async function saveProduct() {
    if (!isAdmin) return toast.error("Only admin can edit products");
    if (!product) return;
    const { error } = await supabase
      .from("products")
      .update({
        name: product.name.trim(),
        sku: product.sku ? product.sku.trim() : null,
        cost_price: Number(product.cost_price || 0),
        selling_price: Number(product.selling_price || 0),
      })
      .eq("id", product.id);
    if (error) return toast.error(error.message);
    toast.success("Product saved");
    setProductsOpt((prev) => prev.map((o) => (o.id === product.id ? { ...o, name: product.name } : o)));
  }

  // -------------------- VARIANTS (create/update/delete) --------------------
  const existingPairs = useMemo(() => {
    const set = new Set<string>();
    variants.forEach((v) => set.add(`${v.size_name}::${v.color_name}`));
    return set;
  }, [variants]);

  async function createVariant() {
    if (!isAdmin) return toast.error("Only admin can create variants");
    if (!selProd) return toast.error("Select a product");
    if (!creatingVariant.sizeId || !creatingVariant.colorId) return toast.error("Pick size & color");

    const sizeName = sizes.find((s) => s.id === creatingVariant.sizeId)?.name ?? "";
    const colorName = colors.find((c) => c.id === creatingVariant.colorId)?.name ?? "";
    if (existingPairs.has(`${sizeName}::${colorName}`)) {
      return toast.error("This size/color already exists for the product");
    }

    const { error } = await supabase.from("product_variants").insert({
      product_id: selProd,
      size_id: creatingVariant.sizeId,
      color_id: creatingVariant.colorId,
      qty: 0,
    });
    if (error) return toast.error(error.message);
    toast.success("Variant created");
    setCreatingVariant({ sizeId: "", colorId: "" });

    // reload variants (normalized)
    const { data: v } = await supabase
      .from("product_variants")
      .select("id, qty, min_qty_alert, selling_price, size:sizes(name), color:colors(name)")
      .eq("product_id", selProd)
      .order("id", { ascending: true });

    const rows: VariantRow[] = ((v ?? []) as RawVariantRow[]).map((row) => {
      const sizeObj = Array.isArray(row.size) ? row.size[0] : row.size;
      const colorObj = Array.isArray(row.color) ? row.color[0] : row.color;
      return {
        id: row.id,
        qty: Number(row.qty ?? 0),
        min_qty_alert: Number(row.min_qty_alert ?? 0),
        selling_price: row.selling_price === null ? null : Number(row.selling_price),
        size_name: sizeObj?.name ?? "-",
        color_name: colorObj?.name ?? "-",
      };
    });
    setVariants(rows);
  }

  async function saveVariant(v: VariantRow) {
    if (!isAdmin) return toast.error("Only admin can edit variants");
    const { error } = await supabase
      .from("product_variants")
      .update({
        min_qty_alert: Number(v.min_qty_alert || 0),
        selling_price: v.selling_price === null ? null : Number(v.selling_price),
      })
      .eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Variant saved");
  }

  async function deleteVariant(v: VariantRow) {
    if (!isAdmin) return toast.error("Only admin can delete variants");
    if (v.qty !== 0) return toast.error("Qty must be 0 to delete");
    const { error } = await supabase.from("product_variants").delete().eq("id", v.id);
    if (error) return toast.error(error.message);
    toast.success("Variant deleted");
    setVariants((prev) => prev.filter((x) => x.id !== v.id));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Inventory</h1>

      {/* CHECK INVENTORY */}
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <Select label="Category" options={categories} value={selCat} onChange={setSelCat} />
        <Select label="Product" options={productsOpt} value={selProd} onChange={setSelProd} />
        <Select label="Color" options={colors} value={selColor} onChange={setSelColor} />
        <Select label="Size" options={sizes} value={selSize} onChange={setSelSize} />
        <div className="flex items-end">
          <button onClick={checkQty} className="w-full rounded-md bg-primary text-white py-2">
            Check
          </button>
        </div>
        {qty !== null && (
          <div className="sm:col-span-2 lg:col-span-5 text-sm">
            Availability: <span className="font-semibold">{qty} pcs</span>
          </div>
        )}
      </section>

      {/* CRUD AREA */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Products & Variants</h2>
          {!isAdmin && <span className="text-xs text-gray-500">Read-only (staff). Admins can edit.</span>}
        </div>

        {/* Product editor */}
        {product ? (
          <div className="mt-3 grid gap-3 grid-cols-1 md:grid-cols-5">
            <Field label="Name">
              <input
                className="w-full rounded-md border bg-transparent p-2"
                value={product.name}
                onChange={(e) => setProduct({ ...product, name: e.target.value })}
                disabled={!isAdmin}
              />
            </Field>
            <Field label="SKU">
              <input
                className="w-full rounded-md border bg-transparent p-2"
                value={product.sku ?? ""}
                onChange={(e) => setProduct({ ...product, sku: e.target.value || null })}
                disabled={!isAdmin}
              />
            </Field>
            <Field label="Cost Price">
              <input
                type="number"
                step="0.01"
                className="w-full rounded-md border bg-transparent p-2"
                value={product.cost_price}
                onChange={(e) => setProduct({ ...product, cost_price: Number(e.target.value || 0) })}
                disabled={!isAdmin}
              />
            </Field>
            <Field label="Selling Price (default)">
              <input
                type="number"
                step="0.01"
                className="w-full rounded-md border bg-transparent p-2"
                value={product.selling_price}
                onChange={(e) => setProduct({ ...product, selling_price: Number(e.target.value || 0) })}
                disabled={!isAdmin}
              />
            </Field>
            <div className="flex items-end">
              <button
                onClick={saveProduct}
                disabled={!isAdmin}
                className="rounded-md bg-primary text-white px-4 py-2 disabled:opacity-50"
              >
                Save Product
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">Pick a product above to edit.</p>
        )}

        {/* Variant create + list */}
        {selProd && (
          <>
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Variants</h3>
              <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
                <Field label="Size">
                  <select
                    className="w-full rounded-md border bg-transparent p-2"
                    value={creatingVariant.sizeId}
                    onChange={(e) => setCreatingVariant((s) => ({ ...s, sizeId: e.target.value }))}
                    disabled={!isAdmin}
                  >
                    <option value="">-- Select --</option>
                    {sizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Color">
                  <select
                    className="w-full rounded-md border bg-transparent p-2"
                    value={creatingVariant.colorId}
                    onChange={(e) => setCreatingVariant((s) => ({ ...s, colorId: e.target.value }))}
                    disabled={!isAdmin}
                  >
                    <option value="">-- Select --</option>
                    {colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2 flex items-end">
                  <button
                    onClick={createVariant}
                    disabled={!isAdmin}
                    className="rounded-md bg-primary text-white px-4 py-2 disabled:opacity-50"
                  >
                    Create Variant
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left">
                  <tr>
                    <th className="py-2">Size</th>
                    <th>Color</th>
                    <th>Qty</th>
                    <th>Min Alert</th>
                    <th>Sell Override</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={v.id} className="border-t">
                      <td className="py-2">{v.size_name}</td>
                      <td>{v.color_name}</td>
                      <td>{v.qty}</td>
                      <td>
                        <input
                          type="number"
                          className="w-24 rounded-md border bg-transparent p-1"
                          value={v.min_qty_alert}
                          onChange={(e) => {
                            const val = Number(e.target.value || 0);
                            setVariants((prev) =>
                              prev.map((row, idx) => (idx === i ? { ...row, min_qty_alert: val } : row))
                            );
                          }}
                          disabled={!isAdmin}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="w-28 rounded-md border bg-transparent p-1"
                          value={v.selling_price ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setVariants((prev) =>
                              prev.map((row, idx) =>
                                idx === i ? { ...row, selling_price: raw === "" ? null : Number(raw) } : row
                              )
                            );
                          }}
                          disabled={!isAdmin}
                          placeholder="(use product default)"
                        />
                      </td>
                      <td className="space-x-2">
                        <button
                          onClick={() => saveVariant(v)}
                          disabled={!isAdmin}
                          className="rounded-md border px-3 py-1 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => deleteVariant(v)}
                          disabled={!isAdmin || v.qty !== 0}
                          className="rounded-md px-3 py-1 text-red-600 disabled:opacity-50"
                          title="Delete (qty must be 0)"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {variants.length === 0 && (
                    <tr>
                      <td className="py-3 text-gray-500" colSpan={6}>
                        No variants yet. Create one above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-gray-500">{label}</div>
      {children}
    </label>
  );
}

function Select({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-gray-500">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-transparent p-2"
      >
        <option value="">-- Select --</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
