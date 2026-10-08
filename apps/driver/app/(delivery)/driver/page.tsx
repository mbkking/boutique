import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  Truck,
} from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { getDriverDashboard } from "@/lib/data/driver";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";

export const metadata = {
  title: "Mes livraisons",
  robots: { index: false, follow: false },
};

/** Rendue à la demande : les statuts de tournée évoluent en continu. */
export const dynamic = "force-dynamic";

interface Tile {
  label: string;
  value: string | number;
  icon: typeof Clock;
  tone: string;
}

/**
 * Tableau de bord du livreur.
 *
 * Tous les chiffres sont agrégés côté serveur à partir des livraisons qui lui
 * sont assignées. Aucun montant n'est calculé dans le navigateur : le montant
 * « à encaisser » est celui des commandes, pas une estimation locale.
 */
export default async function DriverDashboardPage() {
  const auth = await getAuthenticatedUser();
  if (!auth.authenticated) redirect("/account");

  const isAdmin = auth.profile.role === "admin";
  const stats = await getDriverDashboard(auth.profile.id, isAdmin);

  const tiles: Tile[] = [
    {
      label: "Missions du jour",
      value: stats.todayCount,
      icon: Package,
      tone: "bg-primary-50 text-primary-light",
    },
    {
      label: "En attente",
      value: stats.pendingCount,
      icon: Clock,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "En cours",
      value: stats.inProgressCount,
      icon: Truck,
      tone: "bg-green-50 text-green-700",
    },
    {
      label: "Terminées",
      value: stats.completedCount,
      icon: CheckCircle2,
      tone: "bg-gray-100 text-gray-700",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Assignation par l'administration : le tableau de bord se met à jour. */}
      <RealtimeRefresh
        bindings={
          isAdmin
            ? [{ table: "deliveries" }]
            : [{ table: "deliveries", filter: `driver_id=eq.${auth.profile.id}` }]
        }
      />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">Mes livraisons</h1>
        <p className="text-sm text-text-muted">
          {stats.todayCount > 0
            ? `${stats.deliveredToday} terminée${stats.deliveredToday > 1 ? "s" : ""} aujourd'hui sur ${stats.todayCount} mission${stats.todayCount > 1 ? "s" : ""}.`
            : "Aucune mission prévue pour aujourd'hui."}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex flex-col gap-2 p-4">
              <span
                aria-hidden="true"
                className={`flex size-9 items-center justify-center rounded-lg ${tile.tone}`}
              >
                <tile.icon className="size-4" />
              </span>
              <span className="text-2xl font-bold text-text">{tile.value}</span>
              <span className="text-xs text-text-muted">{tile.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <span className="flex items-center gap-2 text-sm text-text-muted">
              <Banknote aria-hidden="true" className="size-4" />
              Montant attendu
            </span>
            <span className="text-lg font-bold text-text">
              {formatPrice(stats.expectedAmount)}
            </span>
          </CardContent>
        </Card>

        {/*
          Le montant encaissé est affiché au livreur : le cahier des charges
          l'autorise explicitement (« selon permissions »). Il provient de la
          table `cash_collections`, donc de ce que l'encaissement a réellement
          enregistré, pas d'une saisie libre.
        */}
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <span className="flex items-center gap-2 text-sm text-text-muted">
              <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
              Montant encaissé
            </span>
            <span className="text-lg font-bold text-text">
              {formatPrice(stats.collectedAmount)}
            </span>
          </CardContent>
        </Card>
      </div>

      {stats.pendingCount === 0 && stats.inProgressCount === 0 ? (
        <EmptyState
          icon={<MapPin aria-hidden="true" className="size-6" />}
          title="Aucune livraison en cours"
          description="Vos missions apparaîtront ici dès que l'administration vous en affecte une."
          actionLabel="Voir mon historique"
          actionHref="/driver/history"
        />
      ) : (
        <Link href="/driver/deliveries" className="w-fit">
          <Button variant="primary" size="lg" className="w-full sm:w-auto">
            <Truck aria-hidden="true" className="size-4" />
            {`Voir mes ${stats.pendingCount + stats.inProgressCount} mission${
              stats.pendingCount + stats.inProgressCount > 1 ? "s" : ""
            }`}
          </Button>
        </Link>
      )}
    </div>
  );
}
