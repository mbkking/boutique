import type { Metadata } from "next";
import { CartView } from "@/app/_components/cart-view";

export const metadata: Metadata = {
  title: "Mon panier",
  description:
    "Retrouvez les articles de votre panier et proceedez à votre commande avec paiement à la livraison.",
  alternates: { canonical: "/cart" },
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <CartView />
    </div>
  );
}