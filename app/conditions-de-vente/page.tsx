import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default function ConditionsDeVente() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-text sm:text-4xl">Conditions de vente</h1>
        <p className="text-base text-text-muted">
          Les conditions suivantes régissent toutes les commandes passées sur ISF NAF-CHOPOP.
        </p>
      </div>

      <div className="mt-8">
        <Card>
          <CardContent className="space-y-8 pt-6">
            <section>
              <h2 className="text-lg font-semibold text-text">1. Commandes</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Toutes les commandes pass&eacute;es sur ISF NAF-CHOPOP sont soumises aux pr&eacute;sentes
                conditions de vente. En passant commande, vous acceptez ces conditions.
                Chaque commande est confirm&eacute;e par t&eacute;l&eacute;phone avant exp&eacute;dition.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">2. Confirmation</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Apr&egrave;s avoir pass&eacute; votre commande, notre &eacute;quipe vous contacte par t&eacute;l&eacute;phone
                pour confirmer la disponibilit&eacute; des produits, l&apos;adresse de livraison et
                le montant total. Aucune commande n&apos;est exp&eacute;di&eacute;e sans confirmation
                t&eacute;l&eacute;phonique.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">3. Prix</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Tous les prix sont affich&eacute;s en francs CFA (XOF). Les prix peuvent &ecirc;tre
                modifi&eacute;s &agrave; tout moment, mais le prix confirm&eacute; lors de la commande reste
                valable. Les frais de livraison sont calcul&eacute;s en fonction de votre quartier
                et sont communiqu&eacute;s avant la validation de la commande.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">4. Paiement</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Le paiement s&apos;effectue &agrave; la livraison uniquement. Vous r&eacute;glerez le montant
                exact de votre commande au moment de la r&eacute;ception de votre colis, en esp&egrave;ces,
                directement au livreur. Nous n&apos;acceptons ni paiement en ligne ni virement
                bancaire.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">5. Livraison</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                La livraison est disponible &agrave; Niamey et dans ses quartiers. Les d&eacute;lais de
                livraison varient de 2 &agrave; 5 jours ouvr&eacute;s selon l&apos;emplacement. Les frais de
                livraison sont offerts pour toute commande sup&eacute;rieure &agrave; 20 000 FCFA.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">6. Retours</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Vous disposez d&apos;un d&eacute;lai de 7 jours apr&egrave;s r&eacute;ception de votre colis pour
                demander un retour. Les produits doivent &ecirc;tre dans leur &eacute;tat d&apos;origine,
                non utilis&eacute;s et dans leur emballage d&apos;origine. Contactez-nous pour initier
                un retour.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">7. Responsabilité</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                ISF NAF-CHOPOP ne peut &ecirc;tre tenue responsable des dommages r&eacute;sultant
                d&apos;une utilisation incorrecte des produits. La responsabilit&eacute; de
                l&apos;enseigne ISF NAF-CHOPOP est limit&eacute;e au montant pay&eacute; pour la
                commande concern&eacute;e.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">8. Contact</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Pour toute question concernant ces conditions de vente, veuillez nous
                contacter&nbsp;:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-text-muted">
                <li>Téléphone : +227 90 12 34 56</li>
                <li>Email : contact@boutiqueniger.com</li>
                <li>Adresse : Niamey, Niger</li>
              </ul>
            </section>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 text-center text-sm text-text-muted">
        <p>
          <Link href="/contact" className="underline hover:text-primary">
            Contact
          </Link>
          {" | "}
          <Link href="/politique-de-retour" className="underline hover:text-primary">
            Politique de retour
          </Link>
        </p>
        <p>Livraison à Niamey et quartiers — Paiement à la livraison</p>
      </div>
    </div>
  );
}
