"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

type Option = { id: string; name: string };

export default function Inventory() {
  const supabase = createClient();
  const [categories, setCategories] = useState<Option[]>([]);
  const [products, setProducts]   = useState<Option[]>([]);
  const [sizes, setSizes]         = useState<Option[]>([]);
  const [colors, setColors]       = useState<Option[]>([]);
  const [selCat, setSelCat]       = useState("");
  const [selProd, setSelProd]     = useState("");
  const [selSize, setSelSize]     = useState("");
  const [selColor, setSelColor]   = useState("");
  const [qty, setQty]             = useState<number|null>(null);

  useEffect(() => {
    (async () => {
      const [c, s, k] = await Promise.all([
        supabase.from("categories").select("id,name").order("name"),
        supabase.from("sizes").select("id,name").order("name"),
        supabase.from("colors").select("id,name").order("name"),
      ]);
      setCategories(c.data ?? []); setSizes(s.data ?? []); setColors(k.data ?? []);
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      if (!selCat) return setProducts([]);
      const { data } = await supabase.from("products").select("id,name").eq("category_id", selCat).order("name");
      setProducts(data ?? []);
    })();
  }, [supabase, selCat]);

  async function checkQty() {
    if (!selProd || !selSize || !selColor) return toast.error("Pick product, size, color");
    const size = sizes.find(s=>s.id===selSize)?.name;
    const color = colors.find(c=>c.id===selColor)?.name;
    const { data, error } = await supabase.from("v_variant_lookup")
      .select("qty, product_name, size, color")
      .eq("product_name", products.find(p=>p.id===selProd)?.name ?? "")
      .eq("size", size ?? "")
      .eq("color", color ?? "")
      .maybeSingle();
    if (error) return toast.error(error.message);
    setQty(data?.qty ?? 0);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Inventory</h1>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <Select label="Category" options={categories} value={selCat} onChange={setSelCat}/>
        <Select label="Product"  options={products}   value={selProd} onChange={setSelProd}/>
        <Select label="Color"    options={colors}     value={selColor} onChange={setSelColor}/>
        <Select label="Size"     options={sizes}      value={selSize} onChange={setSelSize}/>
        <div className="flex items-end">
          <button onClick={checkQty} className="w-full rounded-md bg-primary text-white py-2">Check</button>
        </div>
        {qty !== null && (
          <div className="sm:col-span-2 lg:col-span-5 text-sm">
            Availability: <span className="font-semibold">{qty} pcs</span>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-2">Products & Variants</h2>
        <p className="text-sm text-gray-500">Add CRUD tables & forms here (wired to Supabase tables).</p>
      </div>
    </div>
  );
}

function Select({ label, options, value, onChange }:{
  label: string; options: Option[]; value: string; onChange:(v:string)=>void
}) {
  return (
    <label className="text-sm">
      <div className="mb-1 text-gray-500">{label}</div>
      <select value={value} onChange={e=>onChange(e.target.value)}
              className="w-full rounded-md border bg-transparent p-2">
        <option value="">-- Select --</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
