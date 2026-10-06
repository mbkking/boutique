"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { signInAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Formulaire de connexion unique pour tous les rôles.
 *
 * Une seule connexion suffit : après authentification, le serveur renvoie la
 * destination calculée depuis le rôle réel (`/compte`, `/admin` ou
 * `/livreur`). Le navigateur n'a qu'à s'y rendre, sans jamais décider.
 */
export function SignInForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (email.trim() === "" || password === "") {
      setError("Renseignez votre adresse e-mail et votre mot de passe.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signInAction({
        email: email.trim(),
        password,
        returnTo: returnTo ?? null,
      });

      if (!result.success) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }

      router.push(result.destination);
      router.refresh();
    } catch {
      setError("Le service de connexion est momentanément indisponible.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Connexion à votre compte</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Input
            label="Adresse e-mail"
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="flex flex-col gap-1">
            <div className="relative">
              <Input
                label="Mot de passe"
                type={showPassword ? "text" : "password"}
                name="password"
                required
                autoComplete="current-password"
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
            <Link
              href="/mot-de-passe-oublie"
              className="self-end rounded text-xs text-primary hover:underline focus-visible:focus-ring"
            >
              Mot de passe oublié&nbsp;?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            loadingLabel="Connexion en cours"
            disabled={isSubmitting}
          >
            <LogIn aria-hidden="true" className="size-4" />
            Se connecter
          </Button>

          <p className="text-center text-sm text-text-muted">
            Vous n&apos;avez pas encore de compte&nbsp;?{" "}
            <Link
              href="/inscription"
              className="rounded font-medium text-primary hover:underline focus-visible:focus-ring"
            >
              Créer un compte
            </Link>
          </p>

          <p className="text-xs text-text-muted">
            Vous pouvez aussi commander sans compte : la commande invité vous est
            confirmée par téléphone.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
