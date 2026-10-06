"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, MailCheck, Send } from "lucide-react";
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Demande de lien de réinitialisation. */
export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await requestPasswordResetAction({ email: email.trim() });
      if (!result.success) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("La demande est momentanément indisponible.");
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success"
          >
            <MailCheck className="size-6" />
          </span>
          <p className="text-base font-semibold text-text">E-mail envoyé</p>
          <p className="max-w-sm text-sm text-text-muted">
            Si un compte existe avec cette adresse, vous recevrez un lien pour
            choisir un nouveau mot de passe. Pensez à vérifier vos courriers
            indésirables.
          </p>
          <Link href="/connexion" className="text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Mot de passe oublié</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Input
            label="Adresse e-mail du compte"
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            loadingLabel="Envoi en cours"
            disabled={isSubmitting}
          >
            <Send aria-hidden="true" className="size-4" />
            Recevoir le lien
          </Button>

          <p className="text-center text-sm text-text-muted">
            <Link href="/connexion" className="text-primary hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/** Choix du nouveau mot de passe (après clic sur le lien e-mail). */
export function PasswordResetConfirmForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await updatePasswordAction({ password, confirm_password: confirmPassword });
      if (!result.success) {
        setError(result.error);
        setIsSubmitting(false);
        return;
      }
      router.push("/connexion?mot-de-passe=reinitialise");
      router.refresh();
    } catch {
      setError("La mise à jour est momentanément indisponible.");
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>Choisir un nouveau mot de passe</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Input
            label="Nouveau mot de passe (8 caractères minimum, lettres et chiffres)"
            type="password"
            name="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <Input
            label="Confirmez le nouveau mot de passe"
            type="password"
            name="confirm_password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isSubmitting}
            loadingLabel="Mise à jour en cours"
            disabled={isSubmitting}
          >
            <KeyRound aria-hidden="true" className="size-4" />
            Mettre à jour
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
