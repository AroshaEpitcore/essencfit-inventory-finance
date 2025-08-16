import "./globals.css";
import { Toaster } from "react-hot-toast";

export const metadata = {
  title: "Inventory + Finance Dashboard",
  description: "Inventory + Finance dashboard powered by Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
