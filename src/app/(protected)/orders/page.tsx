"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import Link from "next/link";
import clsx from "clsx";

// ---------- Types ----------
type SizeRow = { id: string; name: string };
type ColorRow = { id: string; name: string };

type OrderItemDraft = {
  sizeId: string;
  colorId: string;
  qty: number | "";
  price: number | "";
};

type OrderCardItem = {
  id: string;
  qty: number;
  price: number;
  size?: { name: string | null } | null;
  color?: { name: string | null } | null;
};

type OrderStatus = "new" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";

type OrderCard = {
  id: string;
  order_date: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  order_items: OrderCardItem[];
};

const STATUSES: OrderStatus[] = [
  "new",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

// ---------- Small helpers (typed, no any) ----------
function numberFmt(n: number): string {
  return new Intl.NumberFormat().format(n);
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
/** Print HTML via a hidden iframe to avoid popup blockers */
function printHtml(html: string): void {
  const iframe: HTMLIFrameElement = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 800);
    }, 150);
  };
}
function downloadBlob(data: string | ArrayBuffer, mime: string, filename: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

// Flatten orders for export
type FlatOrderRow = {
  order_id: string;
  order_date: string;
  customer_name: string;
  phone: string;
  address: string;
  status: string;
  item_size: string;
  item_color: string;
  item_qty: number;
  item_price: number;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  notes: string;
};
function buildFlatRows(orders: OrderCard[]): FlatOrderRow[] {
  const rows: FlatOrderRow[] = [];
  orders.forEach((o) => {
    if (o.order_items.length === 0) {
      rows.push({
        order_id: o.id,
        order_date: o.order_date,
        customer_name: o.customer_name,
        phone: o.phone ?? "",
        address: o.address ?? "",
        status: o.status,
        item_size: "",
        item_color: "",
        item_qty: 0,
        item_price: 0,
        subtotal: o.subtotal,
        discount: o.discount,
        delivery_fee: o.delivery_fee,
        total: o.total,
        notes: o.notes ?? "",
      });
    } else {
      o.order_items.forEach((li) => {
        rows.push({
          order_id: o.id,
          order_date: o.order_date,
          customer_name: o.customer_name,
          phone: o.phone ?? "",
          address: o.address ?? "",
          status: o.status,
          item_size: li.size?.name ?? "",
          item_color: li.color?.name ?? "",
          item_qty: li.qty,
          item_price: li.price,
          subtotal: o.subtotal,
          discount: o.discount,
          delivery_fee: o.delivery_fee,
          total: o.total,
          notes: o.notes ?? "",
        });
      });
    }
  });
  return rows;
}

// Build .xls (Excel 97–2003) via HTML table — opens directly in Excel
function buildExcelHtmlTable(rows: FlatOrderRow[], title: string): string {
  const head =
    `<tr>
      <th align="left">Order ID</th>
      <th align="left">Date</th>
      <th align="left">Customer</th>
      <th align="left">Phone</th>
      <th align="left">Address</th>
      <th align="left">Status</th>
      <th align="left">Size</th>
      <th align="left">Color</th>
      <th align="right">Qty</th>
      <th align="right">Price</th>
      <th align="right">Subtotal</th>
      <th align="right">Discount</th>
      <th align="right">Delivery</th>
      <th align="right">Total</th>
      <th align="left">Notes</th>
    </tr>`;
  const body = rows.map(r => {
    return `<tr>
      <td>${escapeHtml(r.order_id)}</td>
      <td>${escapeHtml(r.order_date)}</td>
      <td>${escapeHtml(r.customer_name)}</td>
      <td>${escapeHtml(r.phone)}</td>
      <td>${escapeHtml(r.address)}</td>
      <td>${escapeHtml(r.status)}</td>
      <td>${escapeHtml(r.item_size)}</td>
      <td>${escapeHtml(r.item_color)}</td>
      <td style="mso-number-format:'0';text-align:right">${r.item_qty}</td>
      <td style="mso-number-format:'0.00';text-align:right">${r.item_price}</td>
      <td style="mso-number-format:'0.00';text-align:right">${r.subtotal}</td>
      <td style="mso-number-format:'0.00';text-align:right">${r.discount}</td>
      <td style="mso-number-format:'0.00';text-align:right">${r.delivery_fee}</td>
      <td style="mso-number-format:'0.00';text-align:right">${r.total}</td>
      <td>${escapeHtml(r.notes)}</td>
    </tr>`;
  }).join("");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
</head>
<body>
  <table border="1" cellspacing="0" cellpadding="3">
    <thead>${head}</thead>
    <tbody>${body || `<tr><td colspan="15">No rows</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

// Build CSV (backup for Excel users)
function toCSV(rows: FlatOrderRow[]): string {
  const headers = [
    "order_id",
    "order_date",
    "customer_name",
    "phone",
    "address",
    "status",
    "item_size",
    "item_color",
    "item_qty",
    "item_price",
    "subtotal",
    "discount",
    "delivery_fee",
    "total",
    "notes",
  ];
  const esc = (v: string) => (/["\n,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = rows
    .map((r) =>
      [
        r.order_id,
        r.order_date,
        r.customer_name,
        r.phone,
        r.address,
        r.status,
        r.item_size,
        r.item_color,
        String(r.item_qty),
        String(r.item_price),
        String(r.subtotal),
        String(r.discount),
        String(r.delivery_fee),
        String(r.total),
        r.notes,
      ]
        .map(esc)
        .join(",")
    )
    .join("\n");
  return `${headers.join(",")}\n${body}`;
}

// ---------- Component ----------
export default function OrdersPage() {
  const supabase = createClient();

  // lookups
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [colors, setColors] = useState<ColorRow[]>([]);

  // header fields
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState<number | "">("");
  const [delivery, setDelivery] = useState<number | "">("");

  // items
  const [items, setItems] = useState<OrderItemDraft[]>([
    { sizeId: "", colorId: "", qty: "", price: "" },
  ]);

  // today orders + UI
  const [todayOrders, setTodayOrders] = useState<OrderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [s, c] = await Promise.all([
        supabase.from("sizes").select("id,name").order("name").returns<SizeRow[]>(),
        supabase.from("colors").select("id,name").order("name").returns<ColorRow[]>(),
      ]);
      if (s.error) toast.error(s.error.message);
      if (c.error) toast.error(c.error.message);
      setSizes(s.data ?? []);
      setColors(c.data ?? []);
      await loadToday();
    })().catch((e) => toast.error(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadToday() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_date,
        customer_name,
        phone,
        address,
        status,
        subtotal,
        discount,
        delivery_fee,
        total,
        notes,
        order_items (
          id,
          qty,
          price,
          size:sizes(name),
          color:colors(name)
        )
      `)
      .gte("order_date", today)
      .lte("order_date", today)
      .order("created_at", { ascending: false })
      .returns<OrderCard[]>();
    setLoading(false);
    if (error) return toast.error(error.message);
    setTodayOrders(
      (data ?? []).map((r) => ({
        ...r,
        subtotal: Number(r.subtotal ?? 0),
        discount: Number(r.discount ?? 0),
        delivery_fee: Number(r.delivery_fee ?? 0),
        total: Number(r.total ?? 0),
      }))
    );
  }

  const subtotal = useMemo(() => {
    return items.reduce((a, it) => {
      const q = Number(it.qty || 0);
      const p = Number(it.price || 0);
      return a + q * p;
    }, 0);
  }, [items]);

  const total = useMemo(() => {
    return subtotal - Number(discount || 0) + Number(delivery || 0);
  }, [subtotal, discount, delivery]);

  function addRow() {
    setItems((prev) => [...prev, { sizeId: "", colorId: "", qty: "", price: "" }]);
  }
  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function saveOrder() {
    try {
      if (!customer.trim()) return toast.error("Customer name is required");
      if (items.length === 0) return toast.error("Add at least one item");
      for (const [i, it] of items.entries()) {
        if (!it.sizeId) return toast.error(`Row ${i + 1}: Select a size`);
        if (!it.colorId) return toast.error(`Row ${i + 1}: Select a color`);
        if (!it.qty || Number(it.qty) <= 0) return toast.error(`Row ${i + 1}: Enter qty`);
        if (it.price === "" || Number(it.price) < 0) return toast.error(`Row ${i + 1}: Enter price`);
      }

      const header = {
        customer_name: customer.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        status: "new" as const,
        subtotal,
        discount: Number(discount || 0),
        delivery_fee: Number(delivery || 0),
        total,
        order_date: new Date().toISOString().slice(0, 10),
      };

      const { data: inserted, error: insErr } = await supabase
        .from("orders")
        .insert(header)
        .select("id")
        .single();

      if (insErr) return toast.error(insErr.message);
      const orderId = String(inserted?.id);

      const linePayload = items.map((it) => ({
        order_id: orderId,
        size_id: it.sizeId,
        color_id: it.colorId,
        qty: Number(it.qty || 0),
        price: Number(it.price || 0),
      }));

      const { error: liErr } = await supabase.from("order_items").insert(linePayload);
      if (liErr) return toast.error(liErr.message);

      toast.success("Order saved");
      // reset
      setCustomer("");
      setPhone("");
      setAddress("");
      setNotes("");
      setDiscount("");
      setDelivery("");
      setItems([{ sizeId: "", colorId: "", qty: "", price: "" }]);
      await loadToday();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function updateStatus(orderId: string, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) return toast.error(error.message);
    setTodayOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
  }

  async function deleteOrder(orderId: string) {
    try {
      setDeletingId(orderId);
      const { error } = await supabase.from("orders").delete().eq("id", orderId);
      if (error) return toast.error(error.message);
      setTodayOrders((prev) => prev.filter((o) => o.id !== orderId));
      toast.success("Order deleted");
    } finally {
      setDeletingId(null);
    }
  }

  // ---------- Exports ----------
  function exportPDF() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = buildFlatRows(todayOrders);

    const head =
      `<tr>
        <th align="left">Order ID</th>
        <th align="left">Date</th>
        <th align="left">Customer</th>
        <th align="left">Phone</th>
        <th align="left">Address</th>
        <th align="left">Status</th>
        <th align="left">Size</th>
        <th align="left">Color</th>
        <th align="right">Qty</th>
        <th align="right">Price</th>
        <th align="right">Subtotal</th>
        <th align="right">Discount</th>
        <th align="right">Delivery</th>
        <th align="right">Total</th>
        <th align="left">Notes</th>
      </tr>`;

    const body = rows
      .map((r) => {
        return `<tr>
          <td>${escapeHtml(r.order_id.slice(0, 8))}</td>
          <td>${escapeHtml(r.order_date)}</td>
          <td>${escapeHtml(r.customer_name)}</td>
          <td>${escapeHtml(r.phone)}</td>
          <td>${escapeHtml(r.address)}</td>
          <td>${escapeHtml(r.status)}</td>
          <td>${escapeHtml(r.item_size)}</td>
          <td>${escapeHtml(r.item_color)}</td>
          <td style="text-align:right">${numberFmt(r.item_qty)}</td>
          <td style="text-align:right">${numberFmt(r.item_price)}</td>
          <td style="text-align:right">${numberFmt(r.subtotal)}</td>
          <td style="text-align:right">${numberFmt(r.discount)}</td>
          <td style="text-align:right">${numberFmt(r.delivery_fee)}</td>
          <td style="text-align:right"><b>${numberFmt(r.total)}</b></td>
          <td>${escapeHtml(r.notes)}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Orders ${today}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; margin: 16px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; }
    th { background: #f5f5f5; }
    @page { margin: 12mm; }
  </style>
</head>
<body>
  <h1>Orders — ${today}</h1>
  <table>
    <thead>${head}</thead>
    <tbody>${body || `<tr><td colspan="15" style="text-align:center;color:#666;">No rows</td></tr>`}</tbody>
  </table>
</body>
</html>`;
    printHtml(html);
  }

  function exportExcel() {
    const today = new Date().toISOString().slice(0, 10);
    const rows = buildFlatRows(todayOrders);
    const html = buildExcelHtmlTable(rows, `Orders ${today}`);
    // Primary: .xls (HTML-based) — opens in Excel with formatting
    downloadBlob(html, "application/vnd.ms-excel;charset=utf-8", `orders-${today}.xls`);
    // Backup: CSV (for other tools)
    const csv = toCSV(rows);
    downloadBlob(csv, "text/csv;charset=utf-8", `orders-${today}.csv`);
  }

  // ---------- UI ----------
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Orders</h1>

      {/* Create Order */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Create Order</h2>

        {/* Customer block */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-4 mb-3">
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Customer name</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="John Doe"
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
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Address</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="No. 10, Flower Rd, Colombo"
            />
          </label>
        </div>

        {/* Items */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-2">Size</th>
                <th>Color</th>
                <th className="w-28">Qty</th>
                <th className="w-40">Price</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-t">
                  <td className="py-2">
                    <select
                      className="w-full rounded-md border bg-transparent p-1"
                      value={it.sizeId}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, sizeId: e.target.value } : row))
                        )
                      }
                    >
                      <option value="">-- Select --</option>
                      {sizes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="w-full rounded-md border bg-transparent p-1"
                      value={it.colorId}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, colorId: e.target.value } : row))
                        )
                      }
                    >
                      <option value="">-- Select --</option>
                      {colors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border bg-transparent p-1"
                      value={it.qty}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, qty: e.target.value === "" ? "" : Number(e.target.value) }
                              : row
                          )
                        )
                      }
                      placeholder="0"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className="w-full rounded-md border bg-transparent p-1"
                      value={it.price}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, price: e.target.value === "" ? "" : Number(e.target.value) }
                              : row
                          )
                        )
                      }
                      placeholder="0.00"
                    />
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => removeRow(idx)}
                      className={clsx(
                        "rounded-md border px-2 py-1",
                        items.length === 1 && "opacity-40 cursor-not-allowed"
                      )}
                      disabled={items.length === 1}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex gap-2">
            <button onClick={addRow} className="rounded-md border px-3 py-2">
              + Add Item
            </button>
          </div>
        </div>

        {/* totals */}
        <div className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-3 md:grid-cols-6">
          <div className="sm:col-span-2 md:col-span-3">
            <label className="text-sm block">
              <div className="mb-1 text-gray-500">Notes</div>
              <input
                className="w-full rounded-md border bg-transparent p-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special details…"
              />
            </label>
          </div>

          <label className="text-sm">
            <div className="mb-1 text-gray-500">Subtotal</div>
            <div className="rounded-md border bg-transparent p-2">Rs. {numberFmt(subtotal)}</div>
          </label>

          <label className="text-sm">
            <div className="mb-1 text-gray-500">Discount</div>
            <input
              type="number"
              step="0.01"
              min={0}
              className="w-full rounded-md border bg-transparent p-2"
              value={discount}
              onChange={(e) => setDiscount(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>

          <label className="text-sm">
            <div className="mb-1 text-gray-500">Delivery Fee</div>
            <input
              type="number"
              step="0.01"
              min={0}
              className="w-full rounded-md border bg-transparent p-2"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>

          <div className="text-sm">
            <div className="mb-1 text-gray-500">Total</div>
            <div className="rounded-md border bg-transparent p-2 font-semibold">
              Rs. {numberFmt(total)}
            </div>
          </div>

          <div className="flex items-end">
            <button onClick={saveOrder} className="rounded-md bg-primary text-white px-4 py-2">
              Save Order
            </button>
          </div>
        </div>
      </section>

      {/* Today’s Orders */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Today’s Orders</h2>
          <div className="flex items-center gap-2">
            <button onClick={exportPDF} className="rounded-md border px-3 py-1">
              Download PDF
            </button>
            <button onClick={exportExcel} className="rounded-md border px-3 py-1">
              Download Excel
            </button>
            <button onClick={loadToday} className="rounded-md border px-3 py-1" disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {todayOrders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders today.</p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {todayOrders.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border dark:border-gray-700 p-4 bg-white dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-xs text-gray-500">
                      {o.phone ?? "—"} • {o.address ?? "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-md border bg-transparent p-1 text-sm"
                      value={o.status}
                      onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <button
                      className={clsx(
                        "rounded-md border px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm",
                        deletingId === o.id && "opacity-50 cursor-wait"
                      )}
                      onClick={() => {
                        if (confirm("Delete this order? This cannot be undone.")) {
                          void deleteOrder(o.id);
                        }
                      }}
                      disabled={deletingId === o.id}
                      title="Delete order"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {o.order_items.map((li) => (
                    <div key={li.id} className="flex justify-between text-sm">
                      <span>
                        {li.qty} × {li.size?.name ?? "-"} / {li.color?.name ?? "-"}
                      </span>
                      <span>Rs. {numberFmt(li.price)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 border-t pt-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>Rs. {numberFmt(o.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span>- Rs. {numberFmt(o.discount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span>Rs. {numberFmt(o.delivery_fee)}</span>
                  </div>
                  <div className="flex justify-between font-semibold mb-5">
                    <span>Total</span>
                    <span>Rs. {numberFmt(o.total)}</span>
                  </div>
                  <Link href={`/receipts/${o.id}`} className="rounded-md bg-primary text-white px-4 py-2">
                    View Receipt
                  </Link>
                </div>

                {o.notes && <div className="mt-2 text-xs text-gray-500">Note: {o.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
