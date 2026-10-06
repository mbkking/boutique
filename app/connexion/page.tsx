import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/session";
import { resolveLoginDestination } from "@/lib/auth/redirect";
import { SignInForm } from "@/app/_components/sign-in-form";
import { Alert } from "@/components/ui/alert";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre compte ISF NAF-CHOPOP.",
  alternates: { canonical: "/connexion" },
  robots: { index: false, follow: false },
};

interface ConnexionPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

/**
 * Portail de connexion unique.
 *
 * Un visiteur déjà connecté n'a rien à y faire : il est renvoyé vers son
 * espace, en honorant le `returnTo` s'il lui est autorisé.
 */
export default async function ConnexionPage({ searchParams }: ConnexionPageProps) {
  const query = await searchParams;
  const profile = await getSessionProfile();

  if (profile) {
    const host = (await headers()).get("host");
    redirect(
      resolveLoginDestination(host, profile.role, firstParam(query.returnTo))
    );
  }

  const justRegistered = firstParam(query.inscription) === "reussie";
  const justReset = firstParam(query["mot-de-passe"]) === "reinitialise";
  const erreur = firstParam(query.erreur);
  const lienMessage =
    erreur === "lien-expire"
      ? "Ce lien est invalide ou a expiré. Demandez-en un nouveau ci-dessous."
      : erreur === "lien-invalide"
        ? "Ce lien de connexion est invalide."
        : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Connexion</h1>
        <p className="text-sm text-text-muted">
          Clients, administrateurs et livreurs se connectent ici avec la même
          adresse e-mail et le même mot de passe.
        </p>
      </header>

      {justRegistered ? (
        <Alert variant="success" title="Compte créé" className="mx-auto w-full max-w-md">
          Vérifiez votre boîte e-mail et cliquez le lien de confirmation, puis
          connectez-vous.
        </Alert>
      ) : null}

      {justReset ? (
        <Alert variant="success" title="Mot de passe mis à jour" className="mx-auto w-full max-w-md">
          Connectez-vous avec votre nouveau mot de passe.
        </Alert>
      ) : null}

      {lienMessage ? (
        <Alert variant="warning" title="Lien invalide" className="mx-auto w-full max-w-md">
          {lienMessage}
        </Alert>
      ) : null}

      <div className="bg-hero-pattern rounded-2xl border border-border p-6 sm:p-8">
        <SignInForm returnTo={firstParam(query.returnTo)} />
      </div>
    </div>
  );
}
