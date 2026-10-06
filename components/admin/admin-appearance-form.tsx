"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  resetAdminThemeAction,
  saveAdminThemeAction,
  uploadAdminThemeAssetAction,
} from "@/lib/actions/admin/theme";
import {
  CARD_SHADOW_PRESETS,
  RADIUS_PRESETS,
  DEFAULT_ADMIN_THEME,
  buildAdminBackgroundStyle,
  buildAdminThemeVariables,
  checkAdminThemeContrast,
  type AdminTheme,
} from "@/lib/theme/admin-theme";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Champ couleur : sélecteur + saisie HEX, conformément à la validation serveur. */
function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="h-10 w-12 cursor-pointer rounded border border-border bg-surface"
          aria-label={`${label} — sélecteur de couleur`}
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          spellCheck={false}
          aria-label={`${label} — valeur hexadécimale`}
          className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 font-mono text-sm"
        />
      </div>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | number;
  options: ReadonlyArray<{ value: string | number; label: string }>;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <select
        id={id}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Formulaire « Apparence » du back-office.
 *
 * L'aperçu est une simple instance de la même couche de thème (`.admin-theme`)
 * alimentée par l'état local : il montre exactement ce qui sera appliqué, sans
 * écrire en base. La persistance n'a lieu qu'au clic sur « Enregistrer ».
 */
export function AdminAppearanceForm({
  initialTheme,
  canWrite,
}: {
  initialTheme: AdminTheme;
  canWrite: boolean;
}) {
  const router = useRouter();
  const logoInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [theme, setTheme] = useState<AdminTheme>(initialTheme);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "background" | null>(null);

  const warnings = useMemo(() => checkAdminThemeContrast(theme), [theme]);
  const previewVariables = useMemo(
    () => buildAdminThemeVariables(theme) as React.CSSProperties,
    [theme]
  );
  const previewBackground = useMemo(() => buildAdminBackgroundStyle(theme), [theme]);

  function update<K extends keyof AdminTheme>(field: K, value: AdminTheme[K]) {
    setSaved(false);
    setTheme((current) => ({ ...current, [field]: value }));
  }

  function upload(kind: "logo" | "background", file: File) {
    setUploadError(null);
    setUploading(kind);

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.split(",")[1] ?? "";

      startTransition(async () => {
        const outcome = await uploadAdminThemeAssetAction({
          kind,
          fileName: file.name,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
          size: file.size,
          content: base64,
        });

        setUploading(null);

        if (!outcome.success) {
          setUploadError(outcome.error ?? "L'envoi a échoué.");
          return;
        }

        update(kind === "logo" ? "logo_url" : "background_image_url", outcome.url);
      });
    };
    reader.onerror = () => {
      setUploading(null);
      setUploadError("Lecture du fichier impossible.");
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await saveAdminThemeAction(theme);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSaved(true);
      router.refresh();
    });
  }

  function handleReset() {
    if (!window.confirm("Voulez-vous restaurer l'apparence par défaut ?")) return;

    startTransition(async () => {
      const result = await resetAdminThemeAction();

      if (!result.success) {
        setError(result.error);
        return;
      }

      setTheme(DEFAULT_ADMIN_THEME);
      setSaved(true);
      router.refresh();
    });
  }

  if (!canWrite) {
    return (
      <Alert variant="info">
        Votre rôle autorise la consultation des paramètres, mais pas la
        modification de l&apos;apparence.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {saved ? <Alert variant="success">Apparence enregistrée.</Alert> : null}
      {warnings.map((warning) => (
        <Alert key={warning} variant="warning">
          {warning}
        </Alert>
      ))}

      {/* ---------------- Aperçu ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Aperçu</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="admin-theme rounded-xl p-4"
            style={{ ...previewVariables, ...previewBackground }}
          >
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--admin-muted-text)" }}>
                Aperçu local — non enregistré
              </p>

              <div
                data-admin-surface="true"
                className="rounded-xl border bg-surface p-4 shadow-sm"
                style={{ borderColor: "var(--admin-card-border)" }}
              >
                <p className="text-base font-semibold" style={{ color: "var(--admin-card-title)" }}>
                  Carte d&apos;aperçu
                </p>
                <p className="text-sm" style={{ color: "var(--admin-card-text)" }}>
                  Titre, description et métadonnées de la carte.
                </p>
                <p className="text-xs" style={{ color: "var(--admin-muted-text)" }}>
                  Texte secondaire · 12 articles · 45 000 FCFA
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-admin-button="true"
                  className="rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Bouton principal
                </button>
                <span
                  data-admin-badge="true"
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                >
                  Badge
                </span>
                <input
                  data-admin-input="true"
                  type="text"
                  placeholder="Champ de saisie"
                  aria-label="Champ de saisie d'aperçu"
                  className="h-10 rounded-lg border px-3 text-sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Identité ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {theme.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={theme.logo_url}
                alt="Logo actuel"
                className="h-16 w-16 rounded-lg object-cover"
              />
            ) : (
              <span className="text-sm text-text-muted">
                Aucun logo personnalisé (logo par défaut utilisé).
              </span>
            )}

            <input
              ref={logoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload("logo", file);
                event.target.value = "";
              }}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={uploading !== null}
                onClick={() => logoInput.current?.click()}
              >
                {uploading === "logo" ? "Envoi…" : "Modifier le logo"}
              </Button>
              {theme.logo_url ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading !== null}
                  onClick={() => update("logo_url", "")}
                >
                  Supprimer le logo
                </Button>
              ) : null}
            </div>
          </div>

          {uploadError ? <Alert variant="danger">{uploadError}</Alert> : null}
        </CardContent>
      </Card>

      {/* ---------------- Arrière-plan ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Arrière-plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text">Mode</legend>
            <div className="flex flex-wrap gap-4">
              {(["color", "image"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="background_mode"
                    checked={theme.background_mode === mode}
                    onChange={() => update("background_mode", mode)}
                  />
                  {mode === "color" ? "Couleur" : "Image"}
                </label>
              ))}
            </div>
          </fieldset>

          <ColorField
            id="background_color"
            label="Couleur de fond"
            value={theme.background_color}
            onChange={(value) => update("background_color", value)}
          />

          {theme.background_mode === "image" ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-4">
                {theme.background_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={theme.background_image_url}
                    alt="Arrière-plan choisi"
                    className="h-20 w-32 rounded-lg object-cover"
                  />
                ) : (
                  <span className="text-sm text-text-muted">Aucune image choisie.</span>
                )}

                <input
                  ref={backgroundInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload("background", file);
                    event.target.value = "";
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading !== null}
                    onClick={() => backgroundInput.current?.click()}
                  >
                    {uploading === "background" ? "Envoi…" : "Choisir une image"}
                  </Button>
                  {theme.background_image_url ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading !== null}
                      onClick={() => update("background_image_url", "")}
                    >
                      Supprimer l&apos;image
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="background_position"
                  label="Position"
                  value={theme.background_position}
                  options={[
                    { value: "center", label: "Centre" },
                    { value: "top", label: "Haut" },
                    { value: "bottom", label: "Bas" },
                    { value: "left", label: "Gauche" },
                    { value: "right", label: "Droite" },
                  ]}
                  onChange={(value) =>
                    update(
                      "background_position",
                      value as AdminTheme["background_position"]
                    )
                  }
                />

                <SelectField
                  id="background_size"
                  label="Taille"
                  value={theme.background_size}
                  options={[
                    { value: "cover", label: "Couvrir toute la page" },
                    { value: "contain", label: "Contenir" },
                    { value: "auto", label: "Taille originale" },
                  ]}
                  onChange={(value) =>
                    update("background_size", value as AdminTheme["background_size"])
                  }
                />

                <SelectField
                  id="background_repeat"
                  label="Répétition"
                  value={theme.background_repeat}
                  options={[
                    { value: "no-repeat", label: "Aucune" },
                    { value: "repeat", label: "Répétée" },
                    { value: "repeat-x", label: "Répétée horizontalement" },
                    { value: "repeat-y", label: "Répétée verticalement" },
                  ]}
                  onChange={(value) =>
                    update("background_repeat", value as AdminTheme["background_repeat"])
                  }
                />

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="background_overlay_opacity"
                    className="text-sm font-medium text-text"
                  >
                    {`Opacité du voile : ${theme.background_overlay_opacity} %`}
                  </label>
                  <input
                    id="background_overlay_opacity"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={theme.background_overlay_opacity}
                    onChange={(event) =>
                      update("background_overlay_opacity", Number(event.target.value))
                    }
                    className="h-10"
                  />
                </div>

                <ColorField
                  id="background_overlay_color"
                  label="Couleur du voile"
                  value={theme.background_overlay_color}
                  onChange={(value) => update("background_overlay_color", value)}
                />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------- Couleurs ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Couleurs du thème</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="primary_color"
            label="Couleur principale"
            value={theme.primary_color}
            onChange={(value) => update("primary_color", value)}
          />
          <ColorField
            id="secondary_color"
            label="Couleur secondaire"
            value={theme.secondary_color}
            onChange={(value) => update("secondary_color", value)}
          />
          <ColorField
            id="accent_color"
            label="Couleur d'accent"
            value={theme.accent_color}
            onChange={(value) => update("accent_color", value)}
          />
          <ColorField
            id="link_color"
            label="Couleur des liens"
            value={theme.link_color}
            onChange={(value) => update("link_color", value)}
          />
          <ColorField
            id="page_text_color"
            label="Couleur des textes"
            value={theme.page_text_color}
            onChange={(value) => update("page_text_color", value)}
          />
          <ColorField
            id="muted_text_color"
            label="Couleur des textes secondaires"
            value={theme.muted_text_color}
            onChange={(value) => update("muted_text_color", value)}
          />
          <ColorField
            id="button_background_color"
            label="Couleur des boutons"
            value={theme.button_background_color}
            onChange={(value) => update("button_background_color", value)}
          />
          <ColorField
            id="button_text_color"
            label="Texte des boutons"
            value={theme.button_text_color}
            onChange={(value) => update("button_text_color", value)}
          />
          <ColorField
            id="button_hover_color"
            label="Boutons au survol"
            value={theme.button_hover_color}
            onChange={(value) => update("button_hover_color", value)}
          />
        </CardContent>
      </Card>

      {/* ---------------- Cartes ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Apparence des cartes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              id="card_background_color"
              label="Fond des cartes"
              value={theme.card_background_color}
              onChange={(value) => update("card_background_color", value)}
            />
            <ColorField
              id="card_border_color"
              label="Couleur des bordures"
              value={theme.card_border_color}
              onChange={(value) => update("card_border_color", value)}
            />
            <ColorField
              id="card_text_color"
              label="Texte des cartes"
              value={theme.card_text_color}
              onChange={(value) => update("card_text_color", value)}
            />
            <ColorField
              id="card_title_color"
              label="Titres des cartes"
              value={theme.card_title_color}
              onChange={(value) => update("card_title_color", value)}
            />
            <ColorField
              id="input_background_color"
              label="Fond des champs"
              value={theme.input_background_color}
              onChange={(value) => update("input_background_color", value)}
            />
            <ColorField
              id="input_border_color"
              label="Bordure des champs"
              value={theme.input_border_color}
              onChange={(value) => update("input_border_color", value)}
            />
            <ColorField
              id="badge_background_color"
              label="Fond des badges"
              value={theme.badge_background_color}
              onChange={(value) => update("badge_background_color", value)}
            />
            <ColorField
              id="badge_text_color"
              label="Texte des badges"
              value={theme.badge_text_color}
              onChange={(value) => update("badge_text_color", value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="border_style"
              label="Style de bordure"
              value={theme.border_style}
              options={[
                { value: "solid", label: "Continue" },
                { value: "dashed", label: "Tirets" },
                { value: "dotted", label: "Pointillés" },
                { value: "none", label: "Aucune" },
              ]}
              onChange={(value) =>
                update("border_style", value as AdminTheme["border_style"])
              }
            />

            <SelectField
              id="border_width"
              label="Épaisseur des bordures"
              value={theme.border_width}
              options={[0, 1, 2, 3, 4].map((width) => ({
                value: width,
                label: `${width} px`,
              }))}
              onChange={(value) => update("border_width", Number(value))}
            />

            <SelectField
              id="card_radius"
              label="Rayon des cartes (panneaux, cartes, sections)"
              value={theme.card_radius}
              options={RADIUS_PRESETS.map((preset) => ({
                value: preset.value,
                label: preset.label,
              }))}
              onChange={(value) => update("card_radius", Number(value))}
            />

            <SelectField
              id="border_radius"
              label="Rayon des éléments (boutons, champs, badges)"
              value={theme.border_radius}
              options={RADIUS_PRESETS.map((preset) => ({
                value: preset.value,
                label: preset.label,
              }))}
              onChange={(value) => update("border_radius", Number(value))}
            />

            <SelectField
              id="card_shadow"
              label="Ombre des cartes"
              value={theme.card_shadow}
              options={CARD_SHADOW_PRESETS.map((preset) => ({
                value: preset.value,
                label: preset.label,
              }))}
              onChange={(value) =>
                update("card_shadow", value as AdminTheme["card_shadow"])
              }
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="card_opacity" className="text-sm font-medium text-text">
                {`Opacité des cartes : ${theme.card_opacity} %`}
              </label>
              <input
                id="card_opacity"
                type="range"
                min={40}
                max={100}
                step={5}
                value={theme.card_opacity}
                onChange={(event) => update("card_opacity", Number(event.target.value))}
                className="h-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Actions ---------------- */}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" isLoading={isPending} loadingLabel="Enregistrement">
          Enregistrer les modifications
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={handleReset}
        >
          Restaurer par défaut
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setTheme(initialTheme);
            setSaved(false);
          }}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}