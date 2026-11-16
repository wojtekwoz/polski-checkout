import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_SHOP_NAME ? `${process.env.NEXT_PUBLIC_SHOP_NAME} - checkout` : "Checkout",
  robots: { index: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? "pl"}>
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
