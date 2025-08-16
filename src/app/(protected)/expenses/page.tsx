export default function Expenses() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Expenses</h1>
      <div className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <p className="text-sm text-gray-500">Admin-only per RLS — add expense entries here.</p>
      </div>
    </div>
  );
}
