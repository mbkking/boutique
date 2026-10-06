import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Lock, UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Découvrez comment ISF NAF-CHOPOP collecte, utilise et protège vos données personnelles.",
  alternates: { canonical: "/politique-de-confidentialite" },
};

export default function PolitiqueDeConfidentialite() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-text sm:text-4xl">Politique de confidentialité</h1>
        <p className="text-base text-text-muted">
          Dernière mise à jour : octobre 2026
        </p>
      </div>

      <div className="mt-8">
        <Card>
          <CardContent className="space-y-8 pt-6">
            <section>
              <h2 className="text-lg font-semibold text-text">1. Collecte des données</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Nous collectons uniquement les données nécessaires à la gestion de votre
                commande et à l&apos;amélioration de votre expérience&nbsp;:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Informations de contact (nom, téléphone, adresse)</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Historique des commandes</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Adresses de livraison enregistrées</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">2. Utilisation des données</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Vos données sont utilisées exclusivement pour&nbsp;:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Shield aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Traiter et livrer vos commandes</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Shield aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Vous contacter concernant vos commandes</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-text-muted">
                  <Shield aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>Améliorer nos services et votre expérience</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">3. Protection des données</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Nous mettons en œuvre des mesures de sécurité appropriées pour protéger vos
                données contre tout accès non autorisé, toute modification, toute
                divulgation ou toute destruction.
              </p>
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary-50 p-3">
                <p className="flex items-start gap-2 text-sm text-text-muted">
                  <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    Vos données ne sont jamais vendues ou partagées avec des tiers à des
                    fins commerciales.
                  </span>
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">4. Vos droits</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Vous disposez d&apos;un droit d&apos;accès, de rectification et de suppression de
                vos données personnelles. Pour exercer ces droits, contactez-nous&nbsp;:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-text-muted">
                <li>Téléphone&nbsp;: +227 90 12 34 56</li>
                <li>Email&nbsp;: contact@boutiqueniger.com</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-text">5. Cookies</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                Nous utilisons des cookies pour améliorer votre expérience de navigation
                et mémoriser vos préférences. Vous pouvez désactiver les cookies dans les
                paramètres de votre navigateur, mais certaines fonctionnalités pourraient ne
                plus être disponibles.
              </p>
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
        <p>Livraison à Niamey et quartiers — Paiement à la livraison</p>
      </div>
    </div>
  );
}
