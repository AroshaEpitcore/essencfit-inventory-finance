"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

/* =========================
   Types for DB rows/views
   ========================= */

type VProductProfitRow = {
  product_id: string;
  product_name: string;
  total_units_sold: number;
  total_revenue: number;
  total_cost: number;
  net_profit: number;
};

type VTotalCollectedRow = {
  total_collected: number;
};

type VFinanceHandoversRow = {
  id: string;
  amount: number;
  manager_name: string;
  noted_at: string; // ISO string
  remaining_after: number;
};

type FinanceHandoversRow = {
  amount: number;
};

type HandoverMoneyResult = {
  id: string;
  amount: number;
  manager_name: string;
  noted_at: string;
  remaining_after: number;
};

/* =========================
   Helpers (no explicit any)
   ========================= */

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" }); // change currency if needed
}

function toNum(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  }
  return 0;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/* =========================
   Page
   ========================= */

export default function FinancePage() {
  const supabase = createClient();

  // Product profit
  const [profits, setProfits] = useState<VProductProfitRow[]>([]);
  const [loadingProfit, setLoadingProfit] = useState(false);

  // Handovers
  const [handovers, setHandovers] = useState<VFinanceHandoversRow[]>([]);
  const [loadingHandover, setLoadingHandover] = useState(false);

  // Totals
  const [totalCollected, setTotalCollected] = useState<number>(0);
  const [totalHandedOver, setTotalHandedOver] = useState<number>(0);
  const remainingBalance = useMemo(
    () => Number((totalCollected - totalHandedOver).toFixed(2)),
    [totalCollected, totalHandedOver]
  );

  // Form
  const [amount, setAmount] = useState<string>("");
  const [managerName, setManagerName] = useState<string>("");

  useEffect(() => {
    void loadProfit();
    void loadHandovers();
    void loadTotals();
  }, []);

  /* -------- Loaders -------- */

  async function loadProfit() {
    setLoadingProfit(true);
    try {
      const { data, error } = await supabase
        .from("v_product_profit")
        .select("*")
        .returns<VProductProfitRow[]>();
      if (error) throw error;
      setProfits(
        (data ?? []).map((r) => ({
          product_id: r.product_id,
          product_name: r.product_name,
          total_units_sold: toNum(r.total_units_sold),
          total_revenue: toNum(r.total_revenue),
          total_cost: toNum(r.total_cost),
          net_profit: toNum(r.net_profit),
        }))
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingProfit(false);
    }
  }

  async function loadHandovers() {
    setLoadingHandover(true);
    try {
      const { data, error } = await supabase
        .from("v_finance_handovers")
        .select("*")
        .order("noted_at", { ascending: false })
        .returns<VFinanceHandoversRow[]>();
      if (error) throw error;
      setHandovers(
        (data ?? []).map((r) => ({
          id: r.id,
          amount: toNum(r.amount),
          manager_name: r.manager_name,
          noted_at: r.noted_at,
          remaining_after: toNum(r.remaining_after),
        }))
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingHandover(false);
    }
  }

  async function loadTotals() {
    // total collected
    try {
      const { data, error } = await supabase
        .from("v_total_collected")
        .select("total_collected")
        .maybeSingle()
        .returns<VTotalCollectedRow | null>();
      if (error) throw error;
      setTotalCollected(toNum(data?.total_collected ?? 0));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }

    // total handed over so far
    try {
      const { data, error } = await supabase
        .from("finance_handovers")
        .select("amount")
        .returns<FinanceHandoversRow[]>();
      if (error) throw error;
      const sum = (data ?? []).reduce<number>((acc, r) => acc + toNum(r.amount), 0);
      setTotalHandedOver(Number(sum.toFixed(2)));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  /* -------- Actions -------- */

  async function submitHandover() {
    const amt = toNum(amount);
    if (!amt || amt <= 0) return toast.error("Enter a positive amount");
    if (!managerName.trim()) return toast.error("Enter manager name");

    try {
      // IMPORTANT: use .single() because the RPC returns ONE row
      const { data, error } = await supabase
        .rpc("handover_money", {
          p_amount: amt,
          p_manager: managerName.trim(),
        })
        .single<HandoverMoneyResult>();
      if (error) throw error;

      const newRemaining = toNum(data?.remaining_after ?? 0);
      toast.success(
        `Handover recorded. Remaining: ${fmtCurrency(newRemaining)}`
      );

      setAmount(""); // keep manager name for convenience
      await Promise.all([loadHandovers(), loadTotals()]);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  /* -------- Render -------- */

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Finance</h1>

      {/* SUMMARY BAR */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <SummaryCard label="Total Collected" value={fmtCurrency(totalCollected)} />
        <SummaryCard label="Total Handed Over" value={fmtCurrency(totalHandedOver)} />
        <SummaryCard label="Remaining Balance" value={fmtCurrency(remainingBalance)} highlight />
      </section>

      {/* PRODUCT PROFIT */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Product Profit</h2>
          <button
            onClick={loadProfit}
            className="rounded-md border px-3 py-2 text-sm"
            disabled={loadingProfit}
          >
            {loadingProfit ? "Loading..." : "Refresh"}
          </button>
        </div>

        {profits.length === 0 ? (
          <p className="text-sm text-gray-500">No sales yet.</p>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {profits.map((p) => (
              <div key={p.product_id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="text-sm text-gray-500 mb-1">Product</div>
                <div className="font-semibold">{p.product_name}</div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <MetricCard label="Units Sold" value={String(p.total_units_sold)} />
                  <MetricCard label="Revenue" value={fmtCurrency(p.total_revenue)} />
                  <MetricCard label="Cost" value={fmtCurrency(p.total_cost)} />
                  <MetricCard
                    label="Net Profit"
                    value={fmtCurrency(p.net_profit)}
                    colorClass={p.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MONEY HANDOVER */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Money Handover</h2>
        </div>

        {/* Handover form */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
          <Field label="Amount">
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-md border bg-transparent p-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Manager">
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </Field>
          <div className="md:col-span-2 flex items-end gap-2">
            <button
              onClick={submitHandover}
              className="rounded-md bg-primary text-white px-4 py-2"
            >
              Record Handover
            </button>
            <button
              onClick={loadHandovers}
              className="rounded-md border px-4 py-2"
              disabled={loadingHandover}
            >
              {loadingHandover ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Handover cards */}
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-4">
          {handovers.length === 0 ? (
            <p className="text-sm text-gray-500">No handovers recorded yet.</p>
          ) : (
            handovers.map((h) => (
              <div key={h.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Amount</div>
                    <div className="text-lg font-semibold">{fmtCurrency(h.amount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Remaining After</div>
                    <div className="text-lg font-semibold">{fmtCurrency(h.remaining_after)}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <MetricCard label="Manager" value={h.manager_name} />
                  <MetricCard label="Date/Time" value={new Date(h.noted_at).toLocaleString()} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/* =========================
   Small UI pieces
   ========================= */

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-gray-50 dark:bg-gray-900"
      }`}
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
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

function MetricCard({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="p-2 rounded bg-white/70 dark:bg-black/20">
      <div className="text-gray-500">{label}</div>
      <div className={`font-semibold ${colorClass ?? ""}`}>{value}</div>
    </div>
  );
}
