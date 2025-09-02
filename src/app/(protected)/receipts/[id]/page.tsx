import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import ReceiptToolbar from "./toolbar";
import "./print-styles.css"; // Import the CSS file

type OrderRow = {
  id: string;
  customer_name: string | null;
  subtotal: number | string | null;
  discount: number | string | null;
  delivery_fee: number | string | null;
  total: number | string | null;
  order_date: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

type ItemWithPrice = {
  id: string;
  qty: number | string | null;
  price: number | string | null;
  size: { name: string } | null;
  color: { name: string } | null;
};

type ItemNoPrice = {
  id: string;
  qty: number | string | null;
  size: { name: string } | null;
  color: { name: string } | null;
};

const LOGO_URL =
  "https://essencefits.com/wp-content/uploads/2025/06/cropped-cropped-cropped-logo-black-130x63.png";

function fmt(n: number | string | null | undefined) {
  return Number(n ?? 0).toFixed(2);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export default async function ReceiptPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  // Await the params Promise
  const { id } = await params;
  
  const supabase = await createServerSupabase();

  // Order header
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select(
      "id, customer_name, subtotal, discount, delivery_fee, total, order_date, phone, address, notes"
    )
    .eq("id", id)
    .maybeSingle<OrderRow>();

  if (oErr) throw new Error(oErr.message);
  if (!order) return notFound();

  // Items (prefer price if it exists)
  let items: Array<{ id: string; qty: number; price?: number; size?: string; color?: string }> = [];

  const withPrice = await supabase
    .from("order_items")
    .select("id, qty, price, size:sizes(name), color:colors(name)")
    .eq("order_id", id)
    .returns<ItemWithPrice[]>();

  if (withPrice.error) {
    if (withPrice.error.code === "42703") {
      const withoutPrice = await supabase
        .from("order_items")
        .select("id, qty, size:sizes(name), color:colors(name)")
        .eq("order_id", id)
        .returns<ItemNoPrice[]>();

      if (withoutPrice.error) throw new Error(withoutPrice.error.message);
      items =
        (withoutPrice.data ?? []).map((it) => ({
          id: it.id,
          qty: Number(it.qty ?? 0),
          size: it.size?.name ?? undefined,
          color: it.color?.name ?? undefined,
        })) ?? [];
    } else {
      throw new Error(withPrice.error.message);
    }
  } else {
    items =
      (withPrice.data ?? []).map((it) => ({
        id: it.id,
        qty: Number(it.qty ?? 0),
        price: Number(it.price ?? 0),
        size: it.size?.name ?? undefined,
        color: it.color?.name ?? undefined,
      })) ?? [];
  }

  const total = Number(order.total ?? 0);
  const subtotal = Number(order.subtotal ?? 0);
  const discount = Number(order.discount ?? 0);
  const deliveryFee = Number(order.delivery_fee ?? 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Toolbar */}
        <div className="no-print mb-6">
          <ReceiptToolbar
            orderId={order.id}
            customer={order.customer_name ?? ""}
            total={total}
            defaultVatPct={0}
          />
        </div>

        {/* Receipt */}
        <div
          id="print-area"
          className="receipt-container bg-white shadow-2xl mx-auto max-w-2xl"
        >
          {/* Header Section */}
          <div className="receipt-header">
            {/* Company Info */}
            <div className="company-section">
              <img
                src={LOGO_URL}
                alt="EssenceFit"
                className="company-logo"
              />
              <div className="company-info">
                <h1 className="company-name">EssenceFit</h1>
                <p className="company-tagline">Premium Fitness Wear</p>
                <div className="company-details">
                  <p>📞 076 968 9093/ 076 2946381</p>
                  <p>🌐 essencefits.com</p>
                  <p>📧 info@essencefits.com</p>
                </div>
              </div>
            </div>

            {/* Invoice Info */}
            <div className="invoice-info">
              <div className="invoice-badge">
                <span className="invoice-label">RECEIPT</span>
              </div>
              <div className="invoice-details">
                <p><strong>Order #:</strong> {order.id.slice(0, 8).toUpperCase()}</p>
                <p><strong>Date:</strong> {formatDate(order.order_date)}</p>
                <p><strong>Time:</strong> {new Date().toLocaleTimeString('en-US', { 
                  hour12: true, 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}</p>
              </div>
            </div>
          </div>

          <div className="receipt-divider"></div>

          {/* Customer Section */}
          <div className="customer-section">
            <h3 className="section-title">Bill To:</h3>
            <div className="customer-info">
              <p className="customer-name">{order.customer_name || "Walk-in Customer"}</p>
              {order.phone && <p className="customer-detail">📱 {order.phone}</p>}
              {order.address && (
                <p className="customer-address">{order.address}</p>
              )}
            </div>
          </div>

          {/* Items Section */}
          <div className="items-section">
            <table className="items-table">
              <thead>
                <tr className="table-header">
                  <th className="item-desc">Description</th>
                  <th className="item-qty">Qty</th>
                  <th className="item-price">Unit Price</th>
                  <th className="item-total">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const line = (item.price ?? 0) * item.qty;
                  return (
                    <tr key={item.id} className="table-row">
                      <td className="item-desc">
                        <div className="item-name">EssenceFit DryFit Short</div>
                        <div className="item-details">
                          {item.size && <span className="item-attr">Size: {item.size}</span>}
                          {item.color && <span className="item-attr">Color: {item.color}</span>}
                        </div>
                      </td>
                      <td className="item-qty">{item.qty}</td>
                      <td className="item-price">Rs. {fmt(item.price ?? 0)}</td>
                      <td className="item-total">Rs. {fmt(line)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      No items found for this order
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="totals-section">
            <div className="totals-grid">
              <div className="total-row subtotal">
                <span className="total-label">Subtotal:</span>
                <span className="total-value">Rs. {fmt(subtotal)}</span>
              </div>
              
              {discount > 0 && (
                <div className="total-row discount">
                  <span className="total-label">Discount:</span>
                  <span className="total-value discount-amount">- Rs. {fmt(discount)}</span>
                </div>
              )}
              
              {deliveryFee > 0 && (
                <div className="total-row delivery">
                  <span className="total-label">Delivery Fee:</span>
                  <span className="total-value">Rs. {fmt(deliveryFee)}</span>
                </div>
              )}
              
              <div className="total-row grand-total">
                <span className="total-label">Total Amount:</span>
                <span className="total-value">Rs. {fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          {order.notes && (
            <div className="notes-section">
              <h3 className="section-title">Notes:</h3>
              <p className="notes-text">{order.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="receipt-footer">
            <div className="footer-content">
              <div className="footer-message">
                <h4>Thank you for choosing EssenceFit! 🙏</h4>
                <p>We appreciate your business and hope you love your new fitness wear.</p>
              </div>
              
              <div className="footer-policies">
                <p>• Exchange within 7 days with receipt</p>
                <p>• Items must be unworn with tags</p>
                <p>• For support: support@essencefits.com</p>
              </div>
              
              <div className="footer-social">
                <p>Follow us: @EssenceFit | #FitInStyle</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}