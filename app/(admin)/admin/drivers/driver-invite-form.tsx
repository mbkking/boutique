"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { inviteDriverAction } from "@/lib/actions/admin/drivers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface DriverInviteFormProps {
  canWrite: boolean;
}

/**
 * Invitation d'un livreur.
 *
 * Le livreur reçoit une invitation par e-mail et définit lui-même son mot de
 * passe : personne d'autre ne connaît son accès, et il n'y a pas de mot de
 * passe provisoire à transmettre par téléphone.
 *
 * Le rôle `driver` est attribué côté serveur, jamais depuis le navigateur.
 */
export function DriverInviteForm({ canWrite }: DriverInviteFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInvitedEmail(null);

    startTransition(async () => {
      const result = await inviteDriverAction({
        full_name: fullName,
        email,
        phone,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setInvitedEmail(email);
      setFullName("");
      setEmail("");
      setPhone("");
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <Alert variant="info">
        Votre role autorise la consultation des livreurs, mais pas l&apos;invitation de
        nouveaux comptes.
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inviter un livreur</CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {invitedEmail ? (
            <Alert variant="success">
              {`Invitation envoyee à ${invitedEmail}. Le livreur definira son mot de passe depuis le lien recu.`}
            </Alert>
          ) : null}

          <Input
            id="driver-name"
            label="Nom complet"
            required
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />

          <Input
            id="driver-email"
            label="Adresse e-mail"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Input
            id="driver-phone"
            label="Téléphone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="+227 90 00 00 00"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <div>
            <Button type="submit" isLoading={isPending} loadingLabel="Envoi de l'invitation">
              <UserPlus aria-hidden="true" className="size-4" />
              Envoyer l&apos;invitation
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}