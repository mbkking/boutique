"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCouponAction, updateCouponAction } from "@/lib/actions/admin/coupons";
import { computeCouponDiscount, type CouponScopeType } from "@/lib/domain/coupons";
import { formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup } from "@/components/ui/radio";

type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export interface CouponFormValues {
  id?: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  /** ISO 8601. */
  startsAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  isActive: boolean;
  scopeType: CouponScopeType;
  appliesToCategoryId: string | null;
  appliesToProductId: string | null;
}

export interface CouponFormProps {
  mode: "create" | "edit";
  initial?: CouponFormValues;
  categories: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
}

/**
 * Réinitialise un horodatage ISO au format `datetime-local` (heure locale).
 * Un champ `datetime-local` ne accepte pas la forme « Z » de l'ISO.
 */
function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join("T");
}

function nowDateTimeLocal(): string {
  return toDateTimeLocal(new Date().toISOString());
}

const EMPTY_VALUES: CouponFormValues = {
  code: "",
  description: null,
  discountType: "PERCENTAGE",
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscountAmount: null,
  startsAt: new Date().toISOString(),
  expiresAt: null,
  maxUses: null,
  maxUsesPerUser: null,
  isActive: true,
  scopeType: "all",
  appliesToCategoryId: null,
  appliesToProductId: null,
};

/** Champ numérique facultatif : `null` si vide, sinon entier ≥ 0. */
function readOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Formulaire d'écriture d'un code promo (création et modification).
 *
 * La portée est pilotée par un seul champ de référence : selon le choix
 * (boutique / catégorie / produit), l'identifiant correspondant est transmis —
 * et l'autre colonne est forcée à `null` côté serveur.
 *
 * L'aperçu descript ci-dessous calcule la remise avec le miroir TypeScript de
 * `lib/domain/coupons.ts` : il éclaire l'administrateur, il ne décide de rien.
 * La décision appartient à `coupon_is_valid`, en base, au moment de la commande.
 */
export function CouponForm({ mode, initial, categories, products }: CouponFormProps) {
  const router = useRouter();
  const values = initial ?? EMPTY_VALUES;

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [code, setCode] = useState(values.code);
  const [description, setDescription] = useState(values.description ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>(values.discountType);
  const [discountValue, setDiscountValue] = useState(String(values.discountValue));
  const [minOrderAmount, setMinOrderAmount] = useState(String(values.minOrderAmount));
  const [maxDiscountAmount, setMaxDiscountAmount] = useState(
    values.maxDiscountAmount === null ? "" : String(values.maxDiscountAmount)
  );
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(values.startsAt) || nowDateTimeLocal());
  const [expiresAt, setExpiresAt] = useState(toDateTimeLocal(values.expiresAt));
  const [maxUses, setMaxUses] = useState(
    values.maxUses === null ? "" : String(values.maxUses)
  );
  const [maxUsesPerUser, setMaxUsesPerUser] = useState(
    values.maxUsesPerUser === null ? "" : String(values.maxUsesPerUser)
  );
  const [isActive, setIsActive] = useState(values.isActive);
  const [scopeType, setScopeType] = useState<CouponScopeType>(values.scopeType);
  const [reference, setReference] = useState(
    values.scopeType === "category"
      ? (values.appliesToCategoryId ?? "")
      : values.scopeType === "product"
        ? (values.appliesToProductId ?? "")
        : ""
  );
  const [previewAmount, setPreviewAmount] = useState(
    String(Math.max(values.minOrderAmount, 10000))
  );

  // Aperçu : identique au montant éligible transmis au serveur.
  const parsedPreview = Number.parseInt(previewAmount.trim() || "0", 10);
  const previewSubtotal = Number.isFinite(parsedPreview) ? Math.max(0, parsedPreview) : 0;
  const parsedMinOrder = Number.parseInt(minOrderAmount.trim() || "0", 10);
  const minOrder = Number.isFinite(parsedMinOrder) ? Math.max(0, parsedMinOrder) : 0;
  const parsedValue = Number.parseInt(discountValue.trim() || "0", 10);
  const discountValueNumber = Number.isFinite(parsedValue) ? parsedValue : 0;

  const previewDiscount =
    previewSubtotal >= minOrder
      ? computeCouponDiscount(
          {
            discountType,
            discountValue: discountValueNumber,
            minOrderAmount: minOrder,
            maxDiscountAmount: readOptionalNumber(maxDiscountAmount),
          },
          previewSubtotal,
          previewSubtotal
        )
      : 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);

    const payload = {
      ...(values.id ? { id: values.id } : {}),
      code: code.trim(),
      description: description.trim() === "" ? null : description.trim(),
      discountType,
      discountValue: Number.parseInt(discountValue.trim() || "0", 10),
      minOrderAmount: Number.parseInt(minOrderAmount.trim() || "0", 10),
      maxDiscountAmount: readOptionalNumber(maxDiscountAmount),
      startsAt,
      expiresAt: expiresAt === "" ? null : expiresAt,
      maxUses: readOptionalNumber(maxUses),
      maxUsesPerUser: readOptionalNumber(maxUsesPerUser),
      isActive,
      scopeType,
      appliesToCategoryId: scopeType === "category" ? reference || null : null,
      appliesToProductId: scopeType === "product" ? reference || null : null,
    };

    startTransition(async () => {
      const action =
        mode === "create" ? createCouponAction : updateCouponAction;
      const result = await action(payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      if (mode === "create") {
        router.push("/admin/coupons");
        router.refresh();
        return;
      }

      setSaved("Modifications enregistrées.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {mode === "create" ? "Nouveau code promo" : `Modifier ${values.code}`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {saved}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Code"
              name="code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              hint="3 à 24 caractères, saisi par le client au checkout."
              autoComplete="off"
            />

            <Input
              label="Valeur de la remise"
              name="discountValue"
              type="number"
              min={1}
              max={discountType === "PERCENTAGE" ? 100 : undefined}
              required
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              hint={
                discountType === "PERCENTAGE"
                  ? "Pourcentage du montant éligible (1 à 100)."
                  : "Montant en F CFA retiré du montant éligible."
              }
            />
          </div>

          <Textarea
            label="Description"
            name="description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            hint="Visible uniquement en administration."
          />

          <RadioGroup
            name="discountType"
            legend="Type de remise"
            value={discountType}
            onChange={(value) => setDiscountType(value as DiscountType)}
            options={[
              { value: "PERCENTAGE", label: "Pourcentage", hint: "10 % du montant éligible, par exemple." },
              { value: "FIXED_AMOUNT", label: "Montant fixe", hint: "Un montant dégressif en F CFA." },
            ]}
          />

          <RadioGroup
            name="scopeType"
            legend="Portée du code"
            hint="Le code n'agit que sur les articles éligibles ; sans article éligible, il est refusé."
            value={scopeType}
            onChange={(value) => {
              setScopeType(value as CouponScopeType);
              setReference("");
            }}
            options={[
              { value: "all", label: "Toute la boutique", hint: "Le sous-total entier du panier." },
              { value: "category", label: "Une catégorie", hint: "Uniquement les articles de cette catégorie." },
              { value: "product", label: "Un produit", hint: "Uniquement les articles de ce produit." },
            ]}
          />

          {scopeType === "category" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="scopeCategory" className="text-sm font-medium text-gray-700">
                Catégorie visée
              </label>
              <select
                id="scopeCategory"
                required
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Choisir une catégorie</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {scopeType === "product" ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="scopeProduct" className="text-sm font-medium text-gray-700">
                Produit visé
              </label>
              <select
                id="scopeProduct"
                required
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Choisir un produit</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Montant minimum de commande"
              name="minOrderAmount"
              type="number"
              min={0}
              value={minOrderAmount}
              onChange={(event) => setMinOrderAmount(event.target.value)}
              hint="Sous-total à atteindre, en F CFA."
            />

            <Input
              label="Plafond de remise"
              name="maxDiscountAmount"
              type="number"
              min={1}
              value={maxDiscountAmount}
              onChange={(event) => setMaxDiscountAmount(event.target.value)}
              hint="Vide : aucun plafond."
            />

            <Input
              label="Début de validité"
              name="startsAt"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />

            <Input
              label="Fin de validité"
              name="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              hint="Vide : sans date de fin."
            />

            <Input
              label="Utilisations maximales"
              name="maxUses"
              type="number"
              min={1}
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
              hint="Vide : illimité."
            />

            <Input
              label="Utilisations par client"
              name="maxUsesPerUser"
              type="number"
              min={1}
              value={maxUsesPerUser}
              onChange={(event) => setMaxUsesPerUser(event.target.value)}
              hint="Compté par numéro de téléphone. Vide : illimité."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="size-4"
            />
            Actif (accepté au checkout)
          </label>

          {/* Aperçu */}
          <section aria-labelledby="coupon-preview" className="rounded-xl border border-border bg-surface-alt p-4">
            <h3 id="coupon-preview" className="text-sm font-semibold text-gray-900">
              Aperçu de la remise
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Simulation sur un montant éligible. La remise définitive est
              recalculée en base au moment de la commande.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex w-48 flex-col gap-1.5">
                <label htmlFor="previewAmount" className="text-sm font-medium text-gray-700">
                  Montant éligible (F CFA)
                </label>
                <input
                  id="previewAmount"
                  type="number"
                  min={0}
                  value={previewAmount}
                  onChange={(event) => setPreviewAmount(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                />
              </div>

              <div className="flex flex-col">
                <span className="text-xs text-gray-500">Remise simulée</span>
                <span className="text-lg font-bold text-gray-900">
                  {previewSubtotal >= minOrder && previewDiscount > 0
                    ? `-${formatPrice(previewDiscount)}`
                    : "0 F CFA"}
                </span>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              {previewSubtotal < minOrder
                ? `Sous le minimum de commande (${formatPrice(minOrder)}) : le code serait refusé.`
                : previewDiscount <= 0
                  ? "La remise serait nulle : le code serait refusé."
                  : `Après remise : ${formatPrice(Math.max(0, previewSubtotal - previewDiscount))}.`}
            </p>
          </section>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isPending}
              loadingLabel={mode === "create" ? "Création" : "Enregistrement"}
              disabled={isPending}
            >
              {mode === "create" ? "Créer le code" : "Enregistrer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={isPending}
              onClick={() => router.push("/admin/coupons")}
            >
              Retour
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
