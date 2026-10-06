"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createUserAction } from "@/lib/actions/admin/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLES = [
  { value: "customer", label: "Client" },
  { value: "driver", label: "Livreur" },
  { value: "order_operator", label: "Opérateur de commandes" },
  { value: "stock_manager", label: "Gestionnaire de stock" },
  { value: "admin", label: "Administrateur" },
] as const;

/**
 * Création d'un compte depuis l'administration.
 *
 * Le compte est créé avec un mot de passe provisoire, affiché **une seule
 * fois** : il n'est stocké nulle part en clair. L'administrateur le transmet à
 * la personne concernée, qui pourra le changer à sa première connexion.
 */
export function CreateUserForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    email: string;
    role: string;
    temporaryPassword: string;
  } | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // `event.currentTarget` est remis à null après le gestionnaire : la
    // référence au formulaire est capturée avant la transition.
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    startTransition(async () => {
      const result = await createUserAction({
        fullName: String(form.get("fullName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        role: String(form.get("role") ?? "customer"),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setCredentials({
        email: result.email,
        role: result.role,
        temporaryPassword: result.temporaryPassword,
      });

      // Pas de `router.refresh()` ici : le rafraîchissement du serveur
      // remonterait le composant et faisait disparaître le mot de passe
      // provisoire avant qu'il ait pu être lu. La liste se met à jour par le
      // bouton dédié, une fois le mot de passe transmis.
      formElement.reset();
    });
  }

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2">
        {credentials ? (
          <Alert variant="success">
            <p className="font-medium">
              {`Compte créé : ${credentials.email} (${credentials.role})`}
            </p>
            <p className="mt-1">
              Mot de passe provisoire :{" "}
              <code
                data-temporary-password="true"
                className="rounded bg-black/10 px-1 py-0.5 font-mono"
              >
                {credentials.temporaryPassword}
              </code>
            </p>
            <p className="mt-1 text-xs">
              Communiquez-le à la personne concernée : il ne sera plus affiché
              ensuite. Aucune invitation e-mail n&apos;est envoyée.
            </p>
            <button
              type="button"
              className="mt-2 text-xs underline"
              onClick={() => setCredentials(null)}
            >
              Masquer
            </button>
            <button
              type="button"
              className="ml-3 mt-2 text-xs underline"
              onClick={() => router.refresh()}
            >
              Actualiser la liste
            </button>
          </Alert>
        ) : null}

        <Button type="button" onClick={() => setIsOpen(true)} className="w-fit">
          <UserPlus aria-hidden="true" className="size-4" />
          Créer un utilisateur
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un utilisateur</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {credentials ? (
            <Alert variant="success">
              <p>
                {`Compte ${credentials.email} créé (rôle : ${credentials.role}).`}
              </p>
              <p className="mt-1">
                Mot de passe provisoire :{" "}
                <code
                  data-temporary-password="true"
                  className="rounded bg-black/10 px-1 py-0.5 font-mono"
                >
                  {credentials.temporaryPassword}
                </code>
              </p>
              <p className="mt-1 text-xs">
                Communiquez-le à la personne concernée, puis faites-le changer.
                Aucune invitation e-mail n&apos;est envoyée.
              </p>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nom complet"
              name="fullName"
              required
              placeholder="Prénom et nom"
            />
            <Input
              label="Adresse e-mail"
              name="email"
              type="email"
              required
              placeholder="personne@exemple.ne"
            />
            <Input
              label="Téléphone"
              name="phone"
              type="tel"
              required
              placeholder="+227 90 00 00 00"
              hint="Sert aussi de référence pour les fiches clients."
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-user-role" className="text-sm font-medium text-text">
                Rôle
              </label>
              <select
                id="new-user-role"
                name="role"
                defaultValue="customer"
                className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-muted">
                Le rôle détermine les accès : un livreur n&apos;a pas accès à la
                gestion des commandes, un client n&apos;a pas accès à
                l&apos;administration.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={isPending} loadingLabel="Création">
              Créer le compte
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setIsOpen(false)}
            >
              Fermer
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

