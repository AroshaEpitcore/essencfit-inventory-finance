"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

// ---------- Types ----------
type Option = { id: string; name: string };

type OrderStatus = "pending" | "done";

type OrderRow = {
  id: string;
  order_date: string; // yyyy-mm-dd
  customer_name: string;
  phone: string | null;
  address: string | null;
  total_price: number | string | null;
  status: OrderStatus;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  size_id: string;
  qty: number | string | null;
};

type OrderCard = {
  order: OrderRow;
  items: Array<{ sizeName: string; qty: number }>;
};

// ---------- Helpers ----------
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(num: number | string | null | undefined) {
  return new Intl.NumberFormat().format(Number(num ?? 0));
}

function toCSV(rows: Record<string, unknown>[], headers: string[]) {
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

// --------------------------------------------------------------
//                           PAGE
// --------------------------------------------------------------
export default function OrdersPage() {
  const supabase = createClient();

  // Lookups
  const [sizes, setSizes] = useState<Option[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [total, setTotal] = useState<number | "">("");
  const [status, setStatus] = useState<OrderStatus>("pending");
  const [items, setItems] = useState<Array<{ sizeId: string; qty: number | "" }>>([
    { sizeId: "", qty: "" },
  ]);

  // Today cards
  const [todayCards, setTodayCards] = useState<OrderCard[]>([]);
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  // Report
  const [from, setFrom] = useState<string>(todayISO());
  const [to, setTo] = useState<string>(todayISO());
  const [reportCards, setReportCards] = useState<OrderCard[]>([]);

  const todayFiltered = useMemo(
    () =>
      showOnlyPending ? todayCards.filter((c) => c.order.status === "pending") : todayCards,
    [todayCards, showOnlyPending]
  );

  // -------- Load lookups --------
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("sizes").select("id,name").order("name").returns<Option[]>();
      if (error) toast.error(error.message);
      setSizes(data ?? []);
    })();
  }, [supabase]);

  // -------- Load today's orders --------
  useEffect(() => {
    void reloadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function reloadToday() {
    const day = todayISO();

    const { data: orders, error: oErr } = await supabase
      .from("orders")
      .select("id, order_date, customer_name, phone, address, total_price, status, created_at")
      .eq("order_date", day)
      .order("created_at", { ascending: false })
      .returns<OrderRow[]>();

    if (oErr) {
      toast.error(oErr.message);
      return;
    }

    const ids = (orders ?? []).map((o) => o.id);
    let itemsByOrder = new Map<string, Array<{ sizeName: string; qty: number }>>();

    if (ids.length > 0) {
      const { data: lineItems, error: liErr } = await supabase
        .from("order_items")
        .select("order_id, size_id, qty")
        .in("order_id", ids)
        .returns<OrderItemRow[]>();

      if (liErr) {
        toast.error(liErr.message);
        return;
      }

      // map size id -> name
      const sizeMap = new Map(sizes.map((s) => [s.id, s.name]));

      itemsByOrder = (lineItems ?? []).reduce((acc, it) => {
        const list = acc.get(it.order_id) ?? [];
        list.push({ sizeName: sizeMap.get(it.size_id) ?? "", qty: Number(it.qty ?? 0) });
        acc.set(it.order_id, list);
        return acc;
      }, new Map<string, Array<{ sizeName: string; qty: number }>>());
    }

    const cards: OrderCard[] =
      (orders ?? []).map((o) => ({ order: o, items: itemsByOrder.get(o.id) ?? [] }));
    setTodayCards(cards);
  }

  // -------- Create new order --------
  function addItemRow() {
    setItems((prev) => [...prev, { sizeId: "", qty: "" }]);
  }
  function removeItemRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function normalizeItems() {
    return items
      .map((it) => ({ sizeId: it.sizeId, qty: Number(it.qty || 0) }))
      .filter((it) => it.sizeId && it.qty > 0);
  }

  async function saveOrder() {
    const cleanItems = normalizeItems();
    if (!name.trim()) return toast.error("Enter customer name");
    if (cleanItems.length === 0) return toast.error("Select at least one size with qty > 0");

    const payload = {
      order_date: todayISO(),
      customer_name: name.trim(),
      phone: phone.trim() || null,
      address: address.trim() || null,
      total_price: Number(total || 0),
      status,
    };

    const { data: inserted, error } = await supabase
      .from("orders")
      .insert(payload)
      .select("id")
      .single()
      .returns<{ id: string }>();

    if (error) return toast.error(error.message);
    const orderId = inserted?.id;
    if (!orderId) return;

    const lineRows = cleanItems.map((it) => ({
      order_id: orderId,
      size_id: it.sizeId,
      qty: it.qty,
    }));

    const { error: errItems } = await supabase.from("order_items").insert(lineRows);
    if (errItems) return toast.error(errItems.message);

    toast.success("Order saved");
    // reset form
    setName("");
    setPhone("");
    setAddress("");
    setTotal("");
    setStatus("pending");
    setItems([{ sizeId: "", qty: "" }]);

    await reloadToday();
  }

  // -------- Actions on a card --------
  async function updateStatus(orderId: string, next: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", orderId);
    if (error) toast.error(error.message);
    else {
      setTodayCards((prev) =>
        prev.map((c) => (c.order.id === orderId ? { ...c, order: { ...c.order, status: next } } : c))
      );
      toast.success("Status updated");
    }
  }

  async function deleteOrder(orderId: string) {
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) toast.error(error.message);
    else {
      setTodayCards((prev) => prev.filter((c) => c.order.id !== orderId));
      toast.success("Order deleted");
    }
  }

  // -------- Report --------
  async function runReport() {
    if (!from || !to) return toast.error("Pick a date range");

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, order_date, customer_name, phone, address, total_price, status, created_at")
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<OrderRow[]>();

    if (error) return toast.error(error.message);

    const ids = (orders ?? []).map((o) => o.id);
    let itemsByOrder = new Map<string, Array<{ sizeName: string; qty: number }>>();

    if (ids.length > 0) {
      const { data: lineItems, error: liErr } = await supabase
        .from("order_items")
        .select("order_id, size_id, qty")
        .in("order_id", ids)
        .returns<OrderItemRow[]>();
      if (liErr) return toast.error(liErr.message);

      const sizeMap = new Map(sizes.map((s) => [s.id, s.name]));
      itemsByOrder = (lineItems ?? []).reduce((acc, it) => {
        const list = acc.get(it.order_id) ?? [];
        list.push({ sizeName: sizeMap.get(it.size_id) ?? "", qty: Number(it.qty ?? 0) });
        acc.set(it.order_id, list);
        return acc;
      }, new Map<string, Array<{ sizeName: string; qty: number }>>());
    }

    const cards: OrderCard[] =
      (orders ?? []).map((o) => ({ order: o, items: itemsByOrder.get(o.id) ?? [] }));
    setReportCards(cards);
  }

  function exportReportCSV() {
    if (reportCards.length === 0) return toast("Nothing to export");
    const rows = reportCards.map((c) => ({
      order_date: c.order.order_date,
      name: c.order.customer_name,
      phone: c.order.phone ?? "",
      address: c.order.address ?? "",
      sizes: c.items.map((i) => `${i.sizeName}×${i.qty}`).join("; "),
      total_price: Number(c.order.total_price ?? 0),
      status: c.order.status,
    }));
    const csv = toCSV(rows, ["order_date", "name", "phone", "address", "sizes", "total_price", "status"]);
    downloadCSV(csv, `orders_${from}_to_${to}.csv`);
  }

  const todayTotal = useMemo(
    () => todayFiltered.reduce((a, c) => a + Number(c.order.total_price ?? 0), 0),
    [todayFiltered]
  );

  // ---------- UI ----------
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Orders</h1>

      {/* New Order form */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <h2 className="font-semibold mb-3">Add WhatsApp Order</h2>
        <div className="grid gap-3 grid-cols-1 md:grid-cols-6">
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Customer name</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Phone</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+94 ..."
            />
          </label>
          <label className="text-sm md:col-span-2">
            <div className="mb-1 text-gray-500">Address</div>
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Delivery address"
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">Total price</div>
            <input
              type="number"
              step="0.01"
              min={0}
              className="w-full rounded-md border bg-transparent p-2"
              value={total}
              onChange={(e) => setTotal(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="e.g. 3490.00"
            />
          </label>
        </div>

        {/* items (sizes) */}
        <div className="mt-4">
          <div className="text-sm text-gray-500 mb-1">Sizes</div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-md border bg-transparent p-2"
                  value={it.sizeId}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, sizeId: e.target.value } : row))
                    )
                  }
                >
                  <option value="">-- Size --</option>
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  className="w-28 rounded-md border bg-transparent p-2"
                  value={it.qty}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, qty: e.target.value === "" ? "" : Number(e.target.value) } : row))
                    )
                  }
                  placeholder="Qty"
                />
                {items.length > 1 && (
                  <button
                    onClick={() => removeItemRow(idx)}
                    className="rounded-md border px-3 py-2"
                    title="Remove row"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2">
            <button onClick={addItemRow} className="rounded-md border px-3 py-2">
              + Add size
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm flex items-center gap-2">
            <span className="text-gray-500">Status</span>
            <select
              className="rounded-md border bg-transparent p-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
            >
              <option value="pending">Pending</option>
              <option value="done">Done</option>
            </select>
          </label>
          <button onClick={saveOrder} className="ml-auto rounded-md bg-primary text-white px-4 py-2">
            Save Order
          </button>
        </div>
      </section>

      {/* Today’s Orders */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="font-semibold">Today’s Orders</h2>
          <label className="text-sm flex items-center gap-2 ml-auto">
            <input
              type="checkbox"
              checked={showOnlyPending}
              onChange={(e) => setShowOnlyPending(e.target.checked)}
            />
            <span>Show only pending</span>
          </label>
          <div className="text-sm">
            Total: <b>Rs. {fmt(todayTotal)}</b>
          </div>
        </div>

        {todayFiltered.length === 0 ? (
          <p className="text-sm text-gray-500">No orders today.</p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {todayFiltered.map((card) => (
              <OrderCardView
                key={card.order.id}
                card={card}
                onSetStatus={(s) => updateStatus(card.order.id, s)}
                onDelete={() => deleteOrder(card.order.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Report */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <h2 className="font-semibold mr-auto">Orders Report</h2>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">From</div>
            <input
              type="date"
              className="rounded-md border bg-transparent p-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <div className="mb-1 text-gray-500">To</div>
            <input
              type="date"
              className="rounded-md border bg-transparent p-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button onClick={runReport} className="rounded-md bg-primary text-white px-3 py-2">
            Run
          </button>
          <button
            onClick={exportReportCSV}
            className="rounded-md border px-3 py-2"
            disabled={reportCards.length === 0}
          >
            Export CSV
          </button>
        </div>

        {reportCards.length === 0 ? (
          <p className="text-sm text-gray-500">No rows.</p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {reportCards.map((card) => (
              <OrderCardView
                key={card.order.id}
                card={card}
                // no actions in report cards
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Tiny card component ----------
function OrderCardView(props: {
  card: OrderCard;
  onSetStatus?: (s: OrderStatus) => void;
  onDelete?: () => void;
}) {
  const { card, onSetStatus, onDelete } = props;
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{card.order.customer_name}</div>
          <div className="text-xs text-gray-500">
            {card.order.phone ?? "—"} • {card.order.order_date}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            card.order.status === "done" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {card.order.status}
        </span>
      </div>

      <div className="mt-2 text-sm">
        {card.items.length === 0 ? (
          <div className="text-gray-500">No sizes</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {card.items.map((it, i) => (
              <span key={i} className="px-2 py-0.5 text-xs rounded bg-white dark:bg-gray-800 border">
                {it.sizeName} × {it.qty}
              </span>
            ))}
          </div>
        )}
      </div>

      {card.order.address && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 line-clamp-2">{card.order.address}</div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm">
          Total: <b>Rs. {fmt(card.order.total_price)}</b>
        </div>
        {(onSetStatus || onDelete) && (
          <div className="flex gap-2">
            {onSetStatus && (
              <>
                <button
                  onClick={() => onSetStatus("pending")}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  Mark Pending
                </button>
                <button
                  onClick={() => onSetStatus("done")}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  Mark Done
                </button>
              </>
            )}
            {onDelete && (
              <button onClick={onDelete} className="rounded-md border px-2 py-1 text-xs text-red-600">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
