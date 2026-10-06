"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Formulaire de modification du nom et du téléphone du client connecté. */
export function ProfileForm({
  defaultFullName,
  defaultPhone,
}: {
  defaultFullName: string;
  defaultPhone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await updateProfileAction({
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSuccessMessage("Vos informations ont été enregistrées.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes informations</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nom complet"
            name="fullName"
            defaultValue={defaultFullName}
            autoComplete="name"
            required
          />

          <Input
            label="Téléphone"
            name="phone"
            defaultValue={defaultPhone}
            hint="Format attendu : 90123456 ou +22790123456"
            autoComplete="tel"
            required
          />

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p role="status" className="text-sm text-success">
              {successMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            isLoading={isPending}
            loadingLabel="Enregistrement"
            disabled={isPending}
          >
            Enregistrer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}