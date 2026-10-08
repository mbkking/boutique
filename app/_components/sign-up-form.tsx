"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { signUpAction } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Formulaire d'inscription publique.
 *
 * Seul un compte CLIENT peut être créé ici : le formulaire n'envoie aucun
 * rôle, et le serveur comme la base (`handle_new_user`) forcent `customer`.
 * Tenter d'ajouter `role: "admin"` à la requête ne change strictement rien.
 */
export function SignUpForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cguAccepted, setCguAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogle() {
    setError(null);
    try {
      const supabase = createClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/compte`,
        },
      });
    } catch {
      setError("La connexion Google est momentanément indisponible. Réessayez.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (!cguAccepted) {
      setError("Vous devez accepter les conditions de vente.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signUpAction({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirm_password: confirmPassword,
        cgu_accepted: cguAccepted,
      });

      if (!result.success) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      if (result.signedIn) {
        router.push("/compte");
        router.refresh();
      } else {
        router.push("/connexion?inscription=reussie");
      }
    } catch {
      setError("La création du compte est momentanément indisponible.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Créer un compte client</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleGoogle}
          >
            <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
              <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
            </svg>
            Continuer avec Google
          </Button>

          <div className="relative py-2 text-center text-xs text-text-muted">
            <span className="px-2">ou</span>
          </div>

          <Input
            label="Nom complet"
            type="text"
            name="full_name"
            required
            autoComplete="name"
            placeholder="Amina Diallo"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />

          <Input
            label="Adresse e-mail"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="amina@exemple.ne"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Input
            label="Téléphone"
            type="tel"
            name="phone"
            required
            autoComplete="tel"
            placeholder="90123456 ou +22790123456"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <div className="relative">
            <Input
              label="Mot de passe (8 caractères minimum, lettres et chiffres)"
              type={showPassword ? "text" : "password"}
              name="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={showPassword}
              className="tap-target absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg px-3 text-text-muted hover:text-text focus-visible:focus-ring"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>

          <Input
            label="Confirmez le mot de passe"
            type={showPassword ? "text" : "password"}
            name="confirm_password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <label className="flex cursor-pointer items-start gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={cguAccepted}
              onChange={(event) => setCguAccepted(event.target.checked)}
              className="tap-target mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              J&apos;accepte les{" "}
              <Link
                href="/conditions-de-vente"
                className="rounded text-primary hover:underline focus-visible:focus-ring"
              >
                conditions de vente
              </Link>
              .
            </span>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            loadingLabel="Création en cours"
            disabled={isSubmitting}
          >
            <UserPlus aria-hidden="true" className="size-4" />
            Créer mon compte
          </Button>

          <p className="text-center text-sm text-text-muted">
            Vous avez déjà un compte&nbsp;?{" "}
            <Link
              href="/connexion"
              className="rounded font-medium text-primary hover:underline focus-visible:focus-ring"
            >
              Se connecter
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
