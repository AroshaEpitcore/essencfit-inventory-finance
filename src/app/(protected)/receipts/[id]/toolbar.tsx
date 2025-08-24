"use client";

import { useMemo, useState } from "react";
import { Printer, Share2, Download, FileText } from "lucide-react";

type Props = {
  orderId: string;
  customer: string;
  total: number;          // DB total (subtotal - discount + delivery)
  defaultVatPct?: number; // e.g., 0 or 15
};

export default function ReceiptToolbar({
  orderId,
  customer,
  total,
  defaultVatPct = 0,
}: Props) {
  const [vatPct, setVatPct] = useState<number>(defaultVatPct);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const vat = useMemo(() => (total * (vatPct || 0)) / 100, [total, vatPct]);
  const grand = useMemo(() => total + vat, [total, vat]);

  function onPrint() {
    window.print();
  }

  // Generate PDF using browser's print to PDF functionality
  async function generatePDF() {
    setIsGeneratingPdf(true);
    
    try {
      // Create a new window with just the receipt content
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
      }

      // Get the receipt content
      const receiptContent = document.getElementById('print-area');
      if (!receiptContent) {
        throw new Error('Receipt content not found');
      }

      // Get all stylesheets
      const stylesheets = Array.from(document.styleSheets)
        .map(sheet => {
          try {
            return Array.from(sheet.cssRules)
              .map(rule => rule.cssText)
              .join('\n');
          } catch (e) {
            // Handle CORS issues with external stylesheets
            return '';
          }
        })
        .join('\n');

      // Write the complete HTML document
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt ${orderId.slice(0, 8)}</title>
            <meta charset="utf-8">
            <style>
              ${stylesheets}
              
              /* Ensure print styles are applied */
              body { 
                margin: 0; 
                padding: 20px; 
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
              }
              
              @media print {
                body { margin: 0; padding: 0; }
                @page { margin: 15mm; size: A4; }
              }
            </style>
          </head>
          <body>
            ${receiptContent.outerHTML}
            <script>
              window.onload = function() {
                setTimeout(() => {
                  window.print();
                  // Close the window after printing
                  setTimeout(() => window.close(), 1000);
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      
      printWindow.document.close();
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + (error as Error).message);
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  // Share PDF using Web Share API (if supported) or fallback to WhatsApp text
  async function sharePDF() {
    const shareData = {
      title: `Receipt #${orderId.slice(0, 8)}`,
      text: `Receipt for ${customer || 'Customer'} - Total: Rs. ${grand.toFixed(2)}`,
      url: window.location.href // Share the current receipt URL
    };

    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare(shareData)
    ) {
      try {
        // For modern browsers with Web Share API
        await navigator.share(shareData);
      } catch (error) {
        console.log('Web Share cancelled or failed, falling back to WhatsApp');
        shareViaWhatsApp();
      }
    } else {
      // Fallback to WhatsApp share
      shareViaWhatsApp();
    }
  }

  function shareViaWhatsApp() {
    const lines = [
      `🧾 Receipt #${orderId.slice(0, 8).toUpperCase()}`,
      `👤 Customer: ${customer || "Walk-in Customer"}`,
      `💰 Amount: Rs. ${grand.toFixed(2)}`,
      vatPct ? `📊 (incl. VAT ${vatPct}%: Rs. ${vat.toFixed(2)})` : "",
      `🔗 View Receipt: ${window.location.href}`,
      "",
      "✨ Thank you for choosing EssenceFit!"
    ].filter(Boolean);
    
    const url = `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
    window.open(url, '_blank');
  }

  // Download receipt as HTML file
  function downloadReceipt() {
    const receiptContent = document.getElementById('print-area');
    if (!receiptContent) return;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Receipt ${orderId.slice(0, 8)}</title>
    <meta charset="utf-8">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            margin: 20px; 
            line-height: 1.6; 
        }
        .receipt-container { max-width: 800px; margin: 0 auto; }
        @media print { 
            body { margin: 0; } 
            @page { margin: 15mm; size: A4; }
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        ${receiptContent.innerHTML}
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${orderId.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="print:hidden flex items-center justify-between gap-3 bg-white/80 backdrop-blur-sm dark:bg-gray-800/80 border rounded-xl px-4 py-3 shadow-lg">
      <div className="text-sm">
        <span className="font-semibold text-gray-700 dark:text-gray-300">Total:</span> 
        <span className="font-bold text-lg text-gray-900 dark:text-white ml-1">Rs. {total.toFixed(2)}</span>
        {vatPct > 0 && (
          <span className="text-gray-500 ml-2">
            • VAT {vatPct}%: Rs. {vat.toFixed(2)} • Grand:{" "}
            <span className="font-bold text-blue-600">Rs. {grand.toFixed(2)}</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
          <span className="text-gray-600 dark:text-gray-300 font-medium">VAT %</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            className="w-16 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-center py-1 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={vatPct}
            onChange={(e) => setVatPct(Number(e.target.value || 0))}
          />
        </label>

        <button
          onClick={downloadReceipt}
          className="rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-2 flex items-center gap-2 transition-colors"
          title="Download Receipt"
        >
          <Download size={16} className="text-gray-600 dark:text-gray-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Download</span>
        </button>

        <button
          onClick={generatePDF}
          disabled={isGeneratingPdf}
          className="rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 dark:border-orange-600 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 px-3 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
          title="Generate PDF"
        >
          <FileText size={16} className="text-orange-600 dark:text-orange-400" />
          <span className="text-sm text-orange-700 dark:text-orange-300">
            {isGeneratingPdf ? 'Generating...' : 'PDF'}
          </span>
        </button>

        <button
          onClick={sharePDF}
          className="rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 dark:border-green-600 dark:bg-green-900/20 dark:hover:bg-green-900/30 px-3 py-2 flex items-center gap-2 transition-colors"
          title="Share Receipt"
        >
          <Share2 size={16} className="text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300">Share</span>
        </button>

        <button
          onClick={onPrint}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 flex items-center gap-2 font-medium shadow-md transition-colors"
        >
          <Printer size={16} />
          <span className="text-sm">Print</span>
        </button>
      </div>
    </div>
  );
}