import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X } from "lucide-react";

export default function PolitiqueDeRetour() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-text sm:text-4xl">Politique de retour</h1>
        <p className="text-base text-text-muted">
          Notre politique de retour vous permet de retourner un produit qui ne vous
          convient pas, sous certaines conditions.
        </p>
      </div>

      <div className="mt-8">
        <Card>
          <CardContent className="space-y-8 pt-6">
            <section>
              <h2 className="text-lg font-semibold text-text">Conditions de retour</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Vous pouvez retourner tout produit acheté sur ISF NAF-CHOPOP dans un délai
                de 7 jours après la réception de votre colis, à condition que&nbsp;:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>Le produit soit dans son &eacute;tat d&apos;origine, non utilisé et complet</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>L&apos;emballage d&apos;origine soit intact</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>L&apos;étiquette d&apos;origine soit toujours attachée</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">D&eacute;lai</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Les retours doivent être initiés dans les 7 jours suivant la livraison.
                Le délai de traitement du remboursement est de 7 à 10 jours ouvrés après
                réception et inspection du produit retourné.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">Produits concernés</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Sont éligibles au retour&nbsp;: les vêtements, les accessoires, les meubles
                (dans leur état d&apos;origine) et les chaussures.
              </p>
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="flex items-start gap-2 text-sm text-text-muted">
                  <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
                  <span>
                    Les produits personnalisés et les denrées alimentaires ne sont pas
                    &eacute;ligibles au retour.
                  </span>
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">Procédure</h2>
              <ol className="mt-3 space-y-3">
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                    1
                  </span>
                  <span>Contactez-nous pour initier le retour</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                    2
                  </span>
                  <span>Nous vous fournirons un label de retour et les instructions</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                    3
                  </span>
                  <span>Emballez le produit dans son emballage d&apos;origine si possible</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                    4
                  </span>
                  <span>Envoyez le colis dans les 7 jours suivant l&apos;autorisation</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary">
                    5
                  </span>
                  <span>Une fois réceptionné et inspecté, votre remboursement sera traité</span>
                </li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">État du produit</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Les produits doivent être retournés dans le même état que lors de la
                réception. Tout produit endommagé, utilisé ou incomplet sera refusé et
                renvoyé à l&apos;expéditeur aux frais du client.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">Contact</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Pour toute question concernant notre politique de retour, contactez-nous&nbsp;:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-text-muted">
                <li>Téléphone&nbsp;: +227 90 12 34 56</li>
                <li>Email&nbsp;: contact@boutiqueniger.com</li>
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
          <Link href="/conditions-de-vente" className="underline hover:text-primary">
            Conditions de vente
          </Link>
        </p>
        <p>Livraison à Niamey et quartiers — Paiement à la livraison</p>
      </div>
    </div>
  );
}


