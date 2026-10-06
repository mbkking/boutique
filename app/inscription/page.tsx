import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/session";
import { homePathForRole } from "@/lib/auth/redirect";
import { SignUpForm } from "@/app/_components/sign-up-form";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Créer un compte",
  description:
    "Créez votre compte client ISF NAF-CHOPOP pour commander plus vite et suivre vos livraisons.",
  alternates: { canonical: "/inscription" },
  robots: { index: false, follow: false },
};

/**
 * Inscription publique : crée uniquement des comptes CLIENT.
 *
 * Un visiteur déjà connecté est renvoyé vers son espace. Aucun rôle ne
 * transite par cette page : le serveur et la base forcent `customer`.
 */
export default async function InscriptionPage() {
  const profile = await getSessionProfile();

  if (profile) {
    redirect(homePathForRole(profile.role) ?? "/");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Créer un compte</h1>
        <p className="text-sm text-text-muted">
          Gratuit et sans engagement : commandez plus vite et retrouvez vos
          adresses de livraison. Le paiement reste à la livraison.
        </p>
      </header>

      <div className="bg-hero-pattern rounded-2xl border border-border p-6 sm:p-8">
        <SignUpForm />
      </div>
    </div>
  );
}
