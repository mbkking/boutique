import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/session";
import { homePathForRole } from "@/lib/auth/redirect";
import { PasswordResetRequestForm } from "@/app/_components/password-reset-forms";
import { Alert } from "@/components/ui/alert";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Recevez un lien pour choisir un nouveau mot de passe.",
  alternates: { canonical: "/mot-de-passe-oublie" },
  robots: { index: false, follow: false },
};

export default async function MotDePasseOubliePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await getSessionProfile();
  if (profile) {
    redirect(homePathForRole(profile.role) ?? "/");
  }

  const query = (await searchParams) ?? {};
  const lien = query.lien;
  const lienExpire = lien === "expire" || (Array.isArray(lien) && lien[0] === "expire");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Mot de passe oublié</h1>
        <p className="text-sm text-text-muted">
          Indiquez l&apos;adresse e-mail de votre compte : vous recevrez un lien
          sécurisé pour en choisir un nouveau.
        </p>
      </header>

      {lienExpire ? (
        <Alert variant="warning" title="Lien expiré ou invalide" className="mx-auto w-full max-w-md">
          Demandez un nouveau lien ci-dessous : chaque lien n&apos;est valable
          qu&apos;une fois et pour une durée limitée.
        </Alert>
      ) : null}

      <div className="bg-hero-pattern rounded-2xl border border-border p-6 sm:p-8">
        <PasswordResetRequestForm />
      </div>
    </div>
  );
}
