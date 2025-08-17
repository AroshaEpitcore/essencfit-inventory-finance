import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Lato } from "next/font/google";

const lato = Lato({
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata = {
  title: "Inventory + Finance Dashboard",
  description: "Inventory + Finance dashboard powered by Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={lato.variable}>
      <body className={lato.className}>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}