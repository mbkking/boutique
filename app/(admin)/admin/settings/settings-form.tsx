"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettingsAction } from "@/lib/actions/admin/settings";
import { uploadBrandingImageAction } from "@/lib/actions/admin/branding";
import { SETTINGS_LABELS, type Settings } from "@/lib/validations/settings-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SettingsFormProps {
  settings: Settings;
  canWrite: boolean;
}

const IDENTIFICATION_KEYS = [
  "company_name",
  "company_phone",
  "company_email",
  "company_address",
  "company_hours",
  "support_whatsapp",
] as const;

const LONG_TEXT_KEYS = ["cod_policy", "delivery_rules", "legal_notice"] as const;

const PLATFORM_KEYS = [
  "pwa_short_name",
  "pwa_theme_color",
  "pwa_background_color",
  "seo_title",
  "seo_description",
  "notifications_channels",
] as const;

const PLATFORM_HINTS: Partial<Record<(typeof PLATFORM_KEYS)[number], string>> = {
  seo_title: "70 caractères maximum.",
  seo_description: "160 caractères maximum.",
  notifications_channels: "Canaux séparés par des virgules : WEB, EMAIL, SMS, PUSH.",
};

/**
 * Formulaire de parametrage.
 *
 * Le type de chaque champ vient du schema partage avec le serveur : la
 * validation du navigateur ne peut pas diverger de celle qui fait foi. Le
 * navigateur n'ameliore que le retour ; la decision reste au serveur.
 */
export function SettingsForm({ settings, canWrite }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState(settings.brand_logo_url ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1] ?? "";
      startTransition(async () => {
        const outcome = await uploadBrandingImageAction({
          fileName: file.name,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/avif",
          size: file.size,
          content: base64,
        });
        setUploading(false);
        if (!outcome.success) {
          setUploadError(outcome.error ?? "L'envoi a Échou�.");
          return;
        }
        setLogoUrl(outcome.url);
      });
    };
    reader.onerror = () => {
      setUploading(false);
      setUploadError("Lecture du fichier impossible.");
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};

    for (const [key, value] of form.entries()) {
      if (typeof value === "string") payload[key] = value;
    }

    startTransition(async () => {
      const result = await saveSettingsAction(payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <Alert variant="info">
        Votre role autorise la consultation des parametres, mais pas leur
        modification.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? <Alert variant="success">Parametres enregistres.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Identite</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          {IDENTIFICATION_KEYS.map((key) => (
            <Input
              key={key}
              id={key}
              name={key}
              label={SETTINGS_LABELS[key]}
              type={key === "company_email" ? "email" : "text"}
              defaultValue={settings[key]}
              required={key === "company_name"}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Commerce et livraison</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input
            id="high_value_threshold"
            name="high_value_threshold"
            label={SETTINGS_LABELS.high_value_threshold}
            hint="Montant en FCFA au-dela duquel la commande est confirmee manuellement."
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            defaultValue={settings.high_value_threshold}
          />

          {/*
            Pas de composant `Select` : les quelques modes de confirmation ne
            justifient pas l'appeler, et le libelle reste porte par le champ.
          */}
          <FormField
            htmlFor="confirmation_mode"
            label={SETTINGS_LABELS.confirmation_mode}
          >
            <select
              id="confirmation_mode"
              name="confirmation_mode"
              defaultValue={settings.confirmation_mode}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text focus-visible:focus-ring"
            >
              <option value="automatique">Automatique</option>
              <option value="manuelle">Manuelle</option>
              <option value="hybride">Hybride selon le montant</option>
            </select>
          </FormField>

          {LONG_TEXT_KEYS.map((key) => (
            <Textarea
              key={key}
              id={key}
              name={key}
              label={SETTINGS_LABELS[key]}
              rows={key === "legal_notice" ? 5 : 3}
              defaultValue={settings[key]}
              className="sm:col-span-2"
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plateforme et referencement</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          {PLATFORM_KEYS.map((key) => (
            <Input
              key={key}
              id={key}
              name={key}
              label={SETTINGS_LABELS[key]}
              hint={PLATFORM_HINTS[key]}
              type={
                key === "pwa_theme_color" || key === "pwa_background_color"
                  ? "color"
                  : "text"
              }
              defaultValue={settings[key]}
              className={
                key === "seo_description" || key === "notifications_channels"
                  ? "sm:col-span-2"
                  : undefined
              }
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apparence du site</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Input
            id="brand_primary"
            name="brand_primary"
            label={SETTINGS_LABELS.brand_primary}
            type="color"
            defaultValue={settings.brand_primary}
          />
          <Input
            id="brand_secondary"
            name="brand_secondary"
            label={SETTINGS_LABELS.brand_secondary}
            type="color"
            defaultValue={settings.brand_secondary}
          />
          <Input
            id="brand_accent"
            name="brand_accent"
            label={SETTINGS_LABELS.brand_accent}
            type="color"
            defaultValue={settings.brand_accent}
          />
          <Input
            id="site_tagline"
            name="site_tagline"
            label={SETTINGS_LABELS.site_tagline}
            type="text"
            defaultValue={settings.site_tagline}
          />

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="brand_logo_file" className="text-sm font-medium text-text">
              Logo (remplace l&apos;image par défaut)
            </label>
            <input
              id="brand_logo_file"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={handleLogoFile}
              disabled={uploading || isPending}
              className="text-sm text-text-muted"
            />
            {uploading ? <p className="text-sm text-text-muted">Envoi du logo�?¦</p> : null}
            {uploadError ? <Alert variant="danger">{uploadError}</Alert> : null}
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Aperçu du logo" className="h-16 w-16 rounded-lg object-cover" />
            ) : null}
            <input type="hidden" name="brand_logo_url" value={logoUrl} readOnly />
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" isLoading={isPending} loadingLabel="Enregistrement">
          Enregistrer les parametres
        </Button>
      </div>
    </form>
  );
}