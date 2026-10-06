import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Truck, ShieldCheck, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "Découvrez ISF NAF-CHOPOP, votre boutique en ligne de confiance à Niamey. Paiement à la livraison et service client réactif.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-text sm:text-4xl">À propos d&apos;ISF NAF-CHOPOP</h1>
        <p className="text-base text-text-muted">
          Votre boutique en ligne de confiance à Niamey, Niger.
        </p>
      </div>

      <div className="mt-8">
        <Card>
          <CardContent className="space-y-8 pt-6">
            <section>
              <h2 className="text-lg font-semibold text-text">Notre histoire</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                ISF NAF-CHOPOP est n&eacute;e d&apos;une id&eacute;e simple&nbsp;: rendre l&apos;achat en ligne
                accessible et fiable pour tous les habitants de Niamey. Nous s&eacute;lectionnons
                avec soin des produits de qualit&eacute; &mdash; meubles, v&ecirc;tements, chaussures, parfums
                et accessoires &mdash; pour r&eacute;pondre aux besoins de la vie quotidienne.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">Notre mission</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Offrir une exp&eacute;rience d&apos;achat en ligne simple, transparente et s&eacute;curis&eacute;e.
                Pas de paiement en ligne compliqu&eacute;&nbsp;: vous commandez, vous recevez, et vous
                payez en esp&egrave;ces &agrave; la livraison. C&apos;est aussi simple que &ccedil;a.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">Pourquoi nous choisir&nbsp;?</h2>
              <ul className="mt-3 space-y-3">
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                    <Truck aria-hidden="true" className="size-4" />
                  </div>
                  <span>
                    <strong className="font-medium text-text">Livraison rapide&nbsp;:</strong>{" "}
                    dans les principaux quartiers de Niamey, souvent en 24 &agrave; 48h.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                    <ShieldCheck aria-hidden="true" className="size-4" />
                  </div>
                  <span>
                    <strong className="font-medium text-text">Paiement &agrave; la livraison&nbsp;:</strong>{" "}
                    vous ne payez qu&apos;une fois le produit entre vos mains.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                    <Users aria-hidden="true" className="size-4" />
                  </div>
                  <span>
                    <strong className="font-medium text-text">Service client&nbsp;:</strong>{" "}
                    une &eacute;quipe disponible pour vous accompagner avant, pendant et apr&egrave;s votre
                    commande.
                  </span>
                </li>
                <li className="flex items-start gap-3 text-sm text-text-muted">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                    <MapPin aria-hidden="true" className="size-4" />
                  </div>
                  <span>
                    <strong className="font-medium text-text">Ancrage local&nbsp;:</strong>{" "}
                    nous connaissons Niamey et ses quartiers. Votre livraison est assur&eacute;e
                    par des livreurs qui connaissent la ville.
                  </span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">Contact</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Une question&nbsp;? Notre &eacute;quipe est &agrave; votre &eacute;coute&nbsp;:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-text-muted">
                <li>T&eacute;l&eacute;phone&nbsp;: +227 90 12 34 56</li>
                <li>Email&nbsp;: contact@boutiqueniger.com</li>
                <li>Horaires&nbsp;: Lun &ndash; Sam : 8h &ndash; 18h</li>
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
          {" | "}
          <Link href="/politique-de-retour" className="underline hover:text-primary">
            Politique de retour
          </Link>
        </p>
        <p>Livraison &agrave; Niamey et quartiers &mdash; Paiement &agrave; la livraison</p>
      </div>
    </div>
  );
}
