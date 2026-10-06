import type { Metadata } from "next";
import { CheckoutView } from "@/app/_components/checkout-view";
import { listActiveDeliveryZones } from "@/lib/data/delivery-zones";
import { getCaptchaSiteKey } from "@/lib/services/captcha";

/**
 * Rendue à la demande : la disponibilité des articles et les frais de livraison
 * doivent toujours refléter la base au moment de la visite.
 */
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Finaliser ma commande",
  description:
    "Renseignez vos coordonnées et votre adresse de livraison à Niamey pour confirmer votre commande avec paiement à la livraison.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  // Les zones proviennent de la base : le client ne peut pas choisir ses
  // frais. Le serveur les recalcule de toute façon à la validation, l'affichage
  // n'est qu'un miroir de cette règle.
  //
  // Si la base est injoignable, la liste est vide et le champ devient une saisie
  // libre : le checkout reste utilisable plutôt que bloqué sur une erreur.
  const zones = await listActiveDeliveryZones();
  const quarters = [...new Set(zones.flatMap((zone) => zone.quarters))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <CheckoutView
        quarters={quarters}
        zones={zones.map((zone) => ({
          name: zone.name,
          city: zone.city,
          fee: zone.fee,
          quarters: zone.quarters,
        }))}
        captchaSiteKey={getCaptchaSiteKey()}
      />
    </div>
  );
}