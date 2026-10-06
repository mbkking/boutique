import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordResetConfirmForm } from "@/app/_components/password-reset-forms";
import { Alert } from "@/components/ui/alert";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour votre compte.",
  alternates: { canonical: "/reinitialiser-mot-de-passe" },
  robots: { index: false, follow: false },
};

/**
 * Choix du nouveau mot de passe.
 *
 * Accessible uniquement avec une session de récupération valide, ouverte par
 * `/auth/callback` depuis le lien reçu par e-mail. Sans session, un message
 * invite à demander un nouveau lien au lieu d'afficher un formulaire inopérant.
 */
export default async function ReinitialiserMotDePassePage() {
  let hasSession = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    hasSession = Boolean(data.user);
  } catch {
    hasSession = false;
  }

  if (!hasSession) {
    redirect("/mot-de-passe-oublie?lien=expire");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Nouveau mot de passe</h1>
        <p className="text-sm text-text-muted">
          Choisissez un mot de passe robuste, différent de l&apos;ancien.
        </p>
      </header>

      <Alert variant="info" className="mx-auto w-full max-w-md">
        Ne partagez jamais ce lien : il donne accès à votre compte.
      </Alert>

      <div className="bg-hero-pattern rounded-2xl border border-border p-6 sm:p-8">
        <PasswordResetConfirmForm />
      </div>
    </div>
  );
}
