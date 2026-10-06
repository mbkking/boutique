"use client";

import Link from "next/link";
import Image from "next/image";
import { Banknote, MapPin, Clock } from "lucide-react";
import { useSpace } from "@/lib/auth/use-space";

interface FooterColumn {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}

const COLUMNS: readonly FooterColumn[] = [
  {
    title: "Entreprise",
    links: [
      { href: "/about", label: "À propos" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Informations",
    links: [
      { href: "/conditions-de-vente", label: "Conditions de vente" },
      { href: "/politique-de-retour", label: "Politique de retour" },
      {
        href: "/politique-de-confidentialite",
        label: "Politique de confidentialité",
      },
    ],
  },
];

export function Footer({
  siteName = "ISF NAF-CHOPOP",
  quarters = [],
}: {
  siteName?: string;
  quarters?: readonly string[];
}) {
  // Pied de page de la boutique uniquement (séparation stricte active).
  const spaceInfo = useSpace();
  if (
    spaceInfo &&
    spaceInfo.enforced &&
    (spaceInfo.space === "admin" || spaceInfo.space === "driver")
  ) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-surface-alt pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Colonne marque */}
          <div className="flex flex-col gap-4">
            <Link
              href="/"
              className="flex w-fit items-center gap-3 rounded-lg text-xl font-bold tracking-tight text-primary focus-visible:focus-ring"
            >
              <Image
                src="/images/logo.jpeg"
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded-lg object-cover"
              />
              {siteName}
            </Link>
            <p className="text-sm leading-relaxed text-text-muted">
              Achat en ligne à Niamey : meubles, vêtements, chaussures, parfums et
              accessoires. Vous commandez en quelques clics et vous payez à la
              réception de votre colis.
            </p>
            <div className="flex flex-col gap-2">
              <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text">
                <Banknote
                  aria-hidden="true"
                  className="size-4 shrink-0 text-success"
                />
                Paiement à la livraison
              </p>
              <p className="inline-flex items-center gap-2 text-xs text-text-muted">
                <Clock aria-hidden="true" className="size-3.5" />
                Lun – Sam : 8h – 18h
              </p>
            </div>
          </div>

          {/* Colonnes de liens */}
          {COLUMNS.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="flex flex-col gap-3"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text">
                {column.title}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded text-sm text-text-muted transition-colors hover:text-primary focus-visible:focus-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Zone de livraison */}
          <section aria-labelledby="zone-livraison" className="flex flex-col gap-3">
            <h2
              id="zone-livraison"
              className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text"
            >
              <MapPin aria-hidden="true" className="size-4 text-primary" />
              Zone de livraison
            </h2>
            <p className="text-sm text-text-muted">
              Livraison à Niamey et dans les quartiers de la capitale.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {quarters.map((quarter) => (
                <li
                  key={quarter}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary-light hover:text-primary"
                >
                  {quarter}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Barre inférieure */}
        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{`© ${currentYear} ${siteName}. Tous droits réservés.`}</p>
          <p className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-3.5" />
            Niamey, Niger
          </p>
        </div>
      </div>
    </footer>
  );
}
