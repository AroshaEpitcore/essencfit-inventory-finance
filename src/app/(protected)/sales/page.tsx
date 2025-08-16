export default function Sales() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Sales</h1>
      <div className="rounded-xl bg-white dark:bg-gray-800 shadow-card p-4">
        <p className="text-sm text-gray-500">Record a sale (variant, qty, price) — DB trigger handles stock out.</p>
      </div>
    </div>
  );
}
