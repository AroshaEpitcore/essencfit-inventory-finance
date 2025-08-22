import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  weight: ["100","200","300","400","500","600","700","800","900"], // all weights
         // adjust if you need more
  variable: "--font-inter",          // <-- CSS variable
  display: "swap",
});

export const metadata = {
  title: "Inventory + Finance Dashboard",
  description: "Inventory + Finance dashboard powered by Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      {/* Map Tailwind's font-sans to Inter via the variable below */}
      <body className="font-sans">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
