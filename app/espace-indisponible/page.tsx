import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Store, ShieldCheck, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  SPACE_LABELS,
  getSpaceFromHost,
  siblingSpaceUrl,
  type Space,
} from "@/lib/auth/space";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Espace indisponible",
  robots: { index: false, follow: false },
};

const SPACE_ICONS = {
  client: Store,
  admin: ShieldCheck,
  driver: Truck,
} as const;

const SPACE_PATHS: Record<Space, string> = {
  client: "/",
  admin: "/admin",
  driver: "/livreur",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/**
 * Page d'orientation entre espaces.
 *
 * Affichée (sans changer l'URL) quand un chemin est demandé sur le mauvais
 * port/hôte : elle indique où aller au lieu de renvoyer une 404 muette.
 * Accessible depuis tous les espaces, sans session.
 */
export default async function EspaceIndisponiblePage({ searchParams }: PageProps) {
  const query = await searchParams;
  const host = (await headers()).get("host") ?? "localhost:3000";
  const current = getSpaceFromHost(host);
  const requested = firstParam(query.from);

  const spaces: Space[] = ["client", "admin", "driver"];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">
          Cet espace n&apos;est pas disponible ici
        </h1>
        <p className="text-sm text-text-muted">
          {requested ? (
            <>
              La page <code className="rounded bg-surface-alt px-1">{requested}</code>{" "}
              appartient à un autre espace. Choisissez votre espace ci-dessous.
            </>
          ) : (
            "Choisissez votre espace ci-dessous."
          )}
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-3">
        {spaces.map((space) => {
          const Icon = SPACE_ICONS[space];
          const url = `${siblingSpaceUrl(host, space)}${SPACE_PATHS[space]}`;
          const isCurrent = space === current;
          return (
            <li key={space}>
              <Card
                className={
                  isCurrent ? "border-primary-light ring-1 ring-primary-light/30" : ""
                }
              >
                <CardContent className="flex flex-col items-center gap-2 p-5 text-center">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary-50 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="text-sm font-semibold text-text">
                    {SPACE_LABELS[space]}
                    {isCurrent ? " (ici)" : ""}
                  </span>
                  <Link
                    href={url}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Ouvrir
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="text-center text-xs text-text-muted">
        Boutique : catalogue et commandes · Administration : gestion ·
        Livreur : tournées. Une seule base de données partagée.
      </p>
    </div>
  );
}
