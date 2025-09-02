"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

/* ========= Types ========= */

type VProductProfitRow = {
  product_id: string;
  product_name: string;
  total_units_sold: number;
  total_revenue: number;
  total_cost: number;
  net_profit: number;
};

type HandoverRowIn = {
  id: string;
  amount: number;        // normalized to number on load
  manager_name: string;
  noted_at: string;      // ISO
};

type HandoverRowOut = HandoverRowIn & {
  remaining_after?: number; // computed client-side for display
};

type UsedRow = {
  id: string;
  amount: number;        // normalized to number on load
  reason: string;
  noted_at: string;      // ISO
};

type HandoverMoneyResult = {
  id: string;
  amount: number;
  manager_name: string;
  noted_at: string;
  remaining_after: number; // for toast only
};

type UseCashResult = {
  id: string;
  amount: number;
  reason: string;
  noted_at: string;
  remaining_after: number; // for toast only
};

type SaleLine = { total_price: number | string | null };

/* ========= Helpers ========= */

function fmtCurrency(n: number) {
  return `Rs. ${new Intl.NumberFormat().format(Number(n || 0))}`;
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t !== "" && !Number.isNaN(Number(t))) return Number(t);
  }
  return 0;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/* ========= Page ========= */

export default function FinancePage() {
  const supabase = createClient();

  // Totals (summary cards)
  const [allTimeSales, setAllTimeSales] = useState<number>(0); // matches Dashboard "All-time Sales"
  const [totalHanded, setTotalHanded] = useState<number>(0);
  const [totalUsed, setTotalUsed] = useState<number>(0);

  // Derived: Remaining = Sales − Handed − Used
  const remainingBalance = useMemo(
    () => Number((toNum(allTimeSales) - toNum(totalHanded) - toNum(totalUsed)).toFixed(2)),
    [allTimeSales, totalHanded, totalUsed]
  );

  // Product profit (cards)
  const [profits, setProfits] = useState<VProductProfitRow[]>([]);
  const [loadingProfit, setLoadingProfit] = useState(false);

  // Handovers (raw + display with computed remaining_after)
  const [handoversRaw, setHandoversRaw] = useState<HandoverRowIn[]>([]);
  const [handovers, setHandovers] = useState<HandoverRowOut[]>([]);
  const [loadingHandover, setLoadingHandover] = useState(false);

  // Used cash
  const [usedList, setUsedList] = useState<UsedRow[]>([]);
  const [loadingUsed, setLoadingUsed] = useState(false);

  // Forms
  const [handoverAmount, setHandoverAmount] = useState<string>("");
  const [managerName, setManagerName] = useState<string>("");

  const [usedAmount, setUsedAmount] = useState<string>("");
  const [usedReason, setUsedReason] = useState<string>("");

  useEffect(() => {
    void Promise.all([loadTotals(), loadProfit(), loadHandovers(), loadUsed()]);
  }, []);

  // Recompute per-record remaining_after whenever inputs change
  useEffect(() => {
    recomputeHandoverRemaining();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTimeSales, usedList, handoversRaw]);

  /* ---- Loaders ---- */

  async function loadTotals() {
    try {
      // 1) All-time Sales (view-only)
      const { data: salesRows, error: salesErr } = await supabase
        .from("sales")
        .select("total_price");
      if (salesErr) throw salesErr;
      const allSales = (salesRows ?? []).reduce((a, r: SaleLine) => a + toNum(r.total_price), 0);
      setAllTimeSales(allSales);

      // 2) Handed Over total
      const { data: handedRows, error: handedErr } = await supabase
        .from("finance_handovers")
        .select("amount");
      if (handedErr) throw handedErr;
      setTotalHanded((handedRows ?? []).reduce((a, r) => a + toNum((r as { amount: unknown }).amount), 0));

      // 3) Cash Used total
      const { data: usedRows, error: usedErr } = await supabase
        .from("finance_used")
        .select("amount");
      if (usedErr) throw usedErr;
      setTotalUsed((usedRows ?? []).reduce((a, r) => a + toNum((r as { amount: unknown }).amount), 0));
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

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
        .from("finance_handovers")
        .select("id, amount, manager_name, noted_at")
        .order("noted_at", { ascending: false })
        .returns<Array<{ id: string; amount: number | string | null; manager_name: string; noted_at: string }>>();
      if (error) throw error;

      setHandoversRaw(
        (data ?? []).map((r) => ({
          id: r.id,
          amount: toNum(r.amount),
          manager_name: r.manager_name,
          noted_at: r.noted_at,
        }))
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingHandover(false);
    }
  }

  async function loadUsed() {
    setLoadingUsed(true);
    try {
      const { data, error } = await supabase
        .from("finance_used")
        .select("id, amount, reason, noted_at")
        .order("noted_at", { ascending: true }) // ascending helps cumulative calc
        .returns<Array<{ id: string; amount: number | string | null; reason: string; noted_at: string }>>();
      if (error) throw error;

      setUsedList(
        (data ?? []).map((r) => ({
          id: r.id,
          amount: toNum(r.amount),
          reason: r.reason,
          noted_at: r.noted_at,
        }))
      );
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLoadingUsed(false);
    }
  }

  /* ---- Derived: remaining_after per handover ---- */

  function recomputeHandoverRemaining() {
    if (!handoversRaw.length) {
      setHandovers([]);
      return;
    }

    // Sort handovers ASC by time for cumulative sums
    const hAsc = [...handoversRaw].sort(
      (a, b) => new Date(a.noted_at).getTime() - new Date(b.noted_at).getTime()
    );
    // Used ASC already
    const uAsc = [...usedList].sort(
      (a, b) => new Date(a.noted_at).getTime() - new Date(b.noted_at).getTime()
    );

    let usedIdx = 0;
    let usedCum = 0;
    let handedCum = 0;

    const outAsc: HandoverRowOut[] = [];
    for (const h of hAsc) {
      const hTime = new Date(h.noted_at).getTime();
      while (usedIdx < uAsc.length && new Date(uAsc[usedIdx].noted_at).getTime() <= hTime) {
        usedCum += toNum(uAsc[usedIdx].amount);
        usedIdx++;
      }
      handedCum += toNum(h.amount);
      const remaining_after = allTimeSales - handedCum - usedCum;
      outAsc.push({ ...h, remaining_after });
    }

    // Keep display order DESC (newest first)
    setHandovers(outAsc.sort(
      (a, b) => new Date(b.noted_at).getTime() - new Date(a.noted_at).getTime()
    ));
  }

  /* ---- Actions ---- */

  async function submitHandover() {
    const amt = toNum(handoverAmount);
    if (!amt || amt <= 0) return toast.error("Enter a positive amount");
    if (!managerName.trim()) return toast.error("Enter manager name");

    try {
      const { data, error } = await supabase
        .rpc("handover_money", { p_amount: amt, p_manager: managerName.trim() })
        .single<HandoverMoneyResult>();
      if (error) throw error;

      toast.success(`Handover recorded. Remaining: ${fmtCurrency(toNum(data.remaining_after))}`);

      setHandoverAmount("");
      await Promise.all([loadHandovers(), loadTotals()]);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  async function submitUsed() {
    const amt = toNum(usedAmount);
    if (!amt || amt <= 0) return toast.error("Enter a positive amount");
    if (!usedReason.trim()) return toast.error("Enter a reason");

    try {
      const { data, error } = await supabase
        .rpc("use_cash", { p_amount: amt, p_reason: usedReason.trim() })
        .single<UseCashResult>();
      if (error) throw error;

      toast.success(`Cash used recorded. Remaining: ${fmtCurrency(toNum(data.remaining_after))}`);
      setUsedAmount("");
      setUsedReason("");
      await Promise.all([loadUsed(), loadTotals()]);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  }

  /* ---- Render ---- */

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Finance</h1>

      {/* SUMMARY BAR */}
      <section className="grid gap-4 grid-cols-1 sm:grid-cols-4">
        <SummaryCard label="All-time Sales (Gross)" value={fmtCurrency(allTimeSales)} />
        <SummaryCard label="Handed Over (Total)" value={fmtCurrency(totalHanded)} />
        <SummaryCard label="Cash Used (Total)" value={fmtCurrency(totalUsed)} />
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

        <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
          <Field label="Amount">
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-md border bg-transparent p-2"
              value={handoverAmount}
              onChange={(e) => setHandoverAmount(e.target.value)}
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
            <button onClick={submitHandover} className="rounded-md bg-primary text-white px-4 py-2">
              Record Handover
            </button>
            <button
              onClick={() => {
                void loadHandovers();
                void loadTotals();
              }}
              className="rounded-md border px-4 py-2"
              disabled={loadingHandover}
            >
              {loadingHandover ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-4">
          {handovers.length === 0 ? (
            <p className="text-sm text-gray-500">No handovers recorded yet.</p>
          ) : (
            handovers.map((h) => (
              <div key={h.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Amount</div>
                    <div className="text-lg font-semibold">{fmtCurrency(toNum(h.amount))}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Remaining After</div>
                    <div className="text-lg font-semibold">
                      {fmtCurrency(toNum(h.remaining_after ?? remainingBalance))}
                    </div>
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

      {/* CASH USED */}
      <section className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Cash Used</h2>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
          <Field label="Amount">
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-md border bg-transparent p-2"
              value={usedAmount}
              onChange={(e) => setUsedAmount(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <input
              className="w-full rounded-md border bg-transparent p-2"
              value={usedReason}
              onChange={(e) => setUsedReason(e.target.value)}
              placeholder="e.g. Petty cash, delivery fuel"
            />
          </Field>
          <div className="md:col-span-2 flex items-end gap-2">
            <button onClick={submitUsed} className="rounded-md bg-primary text-white px-4 py-2">
              Record Cash Used
            </button>
            <button
              onClick={() => {
                void loadUsed();
                void loadTotals();
              }}
              className="rounded-md border px-4 py-2"
              disabled={loadingUsed}
            >
              {loadingUsed ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-4">
          {usedList.length === 0 ? (
            <p className="text-sm text-gray-500">No cash usage recorded yet.</p>
          ) : (
            usedList.map((u) => (
              <div key={u.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Amount</div>
                    <div className="text-lg font-semibold">{fmtCurrency(toNum(u.amount))}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <MetricCard label="Reason" value={u.reason} />
                  <MetricCard label="Date/Time" value={new Date(u.noted_at).toLocaleString()} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

/* ========= Small UI ========= */

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
