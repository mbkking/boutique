import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Phone, User } from "lucide-react";
import { getSessionProfile } from "@/lib/supabase/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/app/_components/sign-out-button";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Mon profil livreur",
  robots: { index: false, follow: false },
};

/**
 * Profil du livreur connecté.
 *
 * Lecture seule : le livreur ne peut pas modifier son rôle ni son statut, et
 * la RLS n'autorise de toute façon que `full_name` et `phone` en écriture.
 */
export default async function LivreurProfilPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/connexion?returnTo=/livreur/profil");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Mon profil</h1>
          <p className="text-sm text-text-muted">
            Vos informations de livreur, utilisées pour vos missions.
          </p>
        </div>
        <SignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-1 text-sm text-text-muted">
                <User aria-hidden="true" className="size-4" />
                Nom complet
              </dt>
              <dd className="text-sm font-medium text-text">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-sm text-text-muted">
                <Phone aria-hidden="true" className="size-4" />
                Téléphone
              </dt>
              <dd className="text-sm font-medium text-text">{profile.phone}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Rôle</dt>
              <dd className="text-sm font-medium text-text">Livreur</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Statut du compte</dt>
              <dd className="text-sm font-medium text-success">Actif</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <p className="text-xs text-text-muted">
        Pour modifier vos informations, contactez l&apos;administration de la
        boutique.
      </p>
    </div>
  );
}
