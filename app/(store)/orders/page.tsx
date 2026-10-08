import { redirect } from "next/navigation";

/**
 * L'historique des commandes est exposé sous /compte (et le détail sous
 * /orders/[id]). On redirige l'index pour éviter la 404.
 */
export default function OrdersIndexPage() {
  redirect("/compte");
}
