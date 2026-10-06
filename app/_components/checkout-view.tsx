"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Package,
  ShieldCheck,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import { z } from "zod";
import { phoneSchema } from "@/lib/validations/schemas";
import {
  submitOrderAction,
  recoverOrderByIdempotencyKeyAction,
  applyCouponAction,
} from "@/lib/actions/checkout";
import { listAvailablePaymentProviders } from "@/lib/payments/providers";
import { useCart } from "@/components/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TurnstileWidget } from "@/components/captcha/turnstile-widget";
import { Price } from "@/components/ui/price";
import { formatPrice } from "@/lib/services/pricing";
import { cn } from "@/lib/utils";

/**
 * Validation de la partie « client » du formulaire.
 * Le payload complet est revalidé côté serveur par `orderCreateSchema`.
 */
const checkoutFormSchema = z.object({
  full_name: z.string().trim().min(2, "Le nom complet est requis").max(120),
  phone: phoneSchema,
  quarter: z.string().trim().min(1, "Le quartier est requis"),
  landmark: z.string().trim().min(1, "Le repère est requis"),
  sector: z.string().trim().max(120),
  instructions: z.string().trim().max(300),
  notes: z.string().trim().max(500),
  coupon_code: z.string().trim().max(24),
});

type CheckoutFormValues = z.input<typeof checkoutFormSchema>;

const EMPTY_FORM: CheckoutFormValues = {
  full_name: "",
  phone: "",
  quarter: "",
  landmark: "",
  sector: "",
  instructions: "",
  notes: "",
  coupon_code: "",
};

const DEFAULT_CITY = "Niamey";

/**
 * Clé d'idempotence de la tentative de commande en cours.
 *
 * Elle est **persistée** dans `sessionStorage`, pas seulement en mémoire : si
 * l'onglet se ferme ou si le réseau coupe après l'envoi, un nouvel essai
 * réutilise la même clé et le serveur reconnaît la commande existante au lieu
 * d'en créer une seconde.
 */
const IDEMPOTENCY_STORAGE_KEY = "boutique-niger:idempotency-key";

function readStoredIdempotencyKey(): string {
  try {
    const stored = window.sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // Stockage indisponible (navigation privée) : on reste en mémoire.
  }
  return crypto.randomUUID();
}

function storeIdempotencyKey(key: string): void {
  try {
    window.sessionStorage.setItem(IDEMPOTENCY_STORAGE_KEY, key);
  } catch {
    // Sans stockage, la clé reste valable pour la durée de la page.
  }
}

function clearIdempotencyKey(): void {
  try {
    window.sessionStorage.removeItem(IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // Rien à faire : la clé sera de toute façon remplacée après succès.
  }
}

/** Étapes logiques du checkout, dans l'ordre. */
const STEPS = [
  { id: 1, label: "Coordonnées", icon: User },
  { id: 2, label: "Livraison", icon: MapPin },
  { id: 3, label: "Récapitulatif", icon: ChevronRight },
  { id: 4, label: "Paiement", icon: Wallet },
] as const;

export interface DeliveryZoneView {
  name: string;
  city: string;
  fee: number;
  quarters: string[];
}

export interface CheckoutViewProps {
  /** Quartiers desservis, issus des zones de livraison actives. */
  quarters: string[];
  /** Zones complètes : permettent d'afficher la zone et les frais réels. */
  zones: DeliveryZoneView[];
  /**
   * Clé publique Turnstile, ou chaîne vide si le CAPTCHA n'est pas configuré.
   * Envoyée par le serveur pour qu'aucune variable d'environnement ne soit
   * lue dans le paquet du navigateur.
   */
  captchaSiteKey?: string;
}

/**
 * Page de commande.
 *
 * Trois protections indissociables :
 *
 * 1. **Clé d'idempotence persistée** — un double-clic, un rechargement ou une
 *    coupure réseau ne peuvent pas créer deux commandes. Après un échec réseau,
 *    l'écran propose explicitement de récupérer la commande.
 * 2. **Aucune donnée de prix venue du client** — le récapitulatif n'est qu'un
 *    aperçu ; le serveur relit les prix, le stock, la zone et les promotions,
 *    puis recalcule le total.
 * 3. **Paiement hors ligne explicite** — seul le paiement à la livraison est
 *    proposé, issu de l'abstraction fournisseurs.
 */
export function CheckoutView({ quarters, zones, captchaSiteKey = "" }: CheckoutViewProps) {
  const router = useRouter();
  const { lines, subtotal, clear, isHydrated } = useCart();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [values, setValues] = useState<CheckoutFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [canRecover, setCanRecover] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [isCouponPending, startCouponTransition] = useTransition();

  /**
   * Empreinte du panier au moment où l'aperçu du code a été calculé :
   * variante et quantité de chaque ligne.
   *
   * Un panier modifié invalide l'aperçu — la portée du code a pu changer
   * (article retiré) sans que le sous-total bouge. L'invalider se fait par
   * comparaison au rendu, sans effet ni remise d'état : c'est un aperçu, la
   * décision définitive appartient à `create_order`.
   */
  const cartSignature = lines
    .map((line) => `${line.variant_id}:${line.quantity}`)
    .join(",");
  const [couponStateCart, setCouponStateCart] = useState<string | null>(null);
  // Le code affiché doit être celui qui est encore saisi : le modifier rend
  // l'aperçu caduc immédiatement.
  const [couponStateCode, setCouponStateCode] = useState<string | null>(null);
  const couponStateIsCurrent =
    couponStateCart === cartSignature &&
    couponStateCode === values.coupon_code.trim().toUpperCase();
  const appliedDiscount = couponStateIsCurrent ? couponDiscount : 0;

  // La clé est stable tant que la commande n'a pas abouti : elle est relue au
  // montage puis réutilisée par tous les essais.
  const idempotencyKeyRef = useRef<string>("");

  /**
   * Anti-robot (§46).
   *
   * `formStartedAtRef` horodate le montage du formulaire. Le serveur refuse une
   * soumission arrivée moins de deux secondes après : c'est le temps minimal
   * pour saisir un nom, un téléphone et une adresse. Un script qui remplit le
   * formulaire en une boucle n'a pas le temps de le faire.
   */
  const formStartedAtRef = useRef<number>(0);
  /**
   * Piège à miel : champ invisible et retiré de la tabulation. Un humain ne le
   * voit pas, un robot qui parcourt le DOM le remplit.
   */
  const [honeypotValue, setHoneypotValue] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaEnabled = captchaSiteKey.length > 0;

  useEffect(() => {
    if (!idempotencyKeyRef.current) {
      const key = readStoredIdempotencyKey();
      idempotencyKeyRef.current = key;
      storeIdempotencyKey(key);
    }
    formStartedAtRef.current = Date.now();
  }, []);

  // Zone correspondant au quartier saisi, et frais associés.
  const selectedZone = zones.find((zone) => zone.quarters.includes(values.quarter)) ?? null;
  const deliveryFee = selectedZone ? selectedZone.fee : null;
  const estimatedTotal = Math.max(0, subtotal - appliedDiscount) + (deliveryFee ?? 0);

  function updateField(field: keyof CheckoutFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  /**
   * Applique le code promo saisi.
   *
   * Isolé dans une fonction pour être appelé aussi bien par le bouton que par
   * la touche Entrée : le bloc étant un `div` et non un `form`, il n'existe
   * plus de soumission native à détourner.
   */
  function applyCoupon() {
    const code = values.coupon_code.trim();
    if (code === "") return;

    setCouponError(null);
    setCouponMessage(null);

    startCouponTransition(async () => {
      // Le téléphone est transmis pour que la limite par utilisateur soit
      // évaluée dès la saisie du code, plutôt qu'à la validation finale de la
      // commande. Les lignes servent à évaluer la portée catégorie/produit.
      const result = await applyCouponAction({
        code,
        subtotal,
        // `undefined` et non `null` : le schéma de `applyCouponAction` déclare
      // `phone` comme optionnel (`string`), et Zod rejette un `null` explicite
      // — la validation du code échouait avec « expected string, received
      // null » dès que le téléphone n'était pas encore saisi.
      phone: values.phone || undefined,
        items: lines.map((line) => ({
          variant_id: line.variant_id,
          line_total: line.unit_price * line.quantity,
        })),
      });

      if (!result.success) {
        setCouponDiscount(0);
        setCouponError(result.error);
        setCouponStateCart(cartSignature);
        setCouponStateCode(code.toUpperCase());
        return;
      }

      setCouponDiscount(result.discount);
      setCouponMessage(result.message);
      setCouponStateCart(cartSignature);
      setCouponStateCode(code.toUpperCase());
    });
  }

  /** Valide un sous-ensemble de champs et ne renvoie que ses erreurs. */
  function validateFields(fields: Array<keyof CheckoutFormValues>): boolean {
    const shape = Object.fromEntries(
      fields.map((field) => [field, values[field]])
    ) as Record<string, unknown>;

    const partial = checkoutFormSchema.partial().safeParse(shape);
    const errors: Record<string, string> = {};

    for (const issue of partial.error?.issues ?? []) {
      const key = String(issue.path[0] ?? "formulaire");
      if (!errors[key]) errors[key] = issue.message;
    }

    setFieldErrors((current) => ({ ...current, ...errors }));
    setFormError(
      Object.keys(errors).length > 0
        ? "Certains champs sont incomplets ou invalides. Corrigez-les puis continuez."
        : null
    );

    return Object.keys(errors).length === 0;
  }

  function goToStep(next: 1 | 2 | 3) {
    setFormError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNext() {
    if (step === 1 && !validateFields(["full_name", "phone"])) return;
    if (step === 2 && !validateFields(["quarter", "landmark"])) return;
    goToStep(step === 1 ? 2 : 3);
  }

  async function handleRecover() {
    const key = idempotencyKeyRef.current;
    if (!key) return;

    setIsSubmitting(true);
    setFormError(null);

    const recovered = await recoverOrderByIdempotencyKeyAction(key);
    setIsSubmitting(false);

    if (recovered.success) {
      setOrderNumber(recovered.orderNumber);
      clear();
      clearIdempotencyKey();
      return;
    }

    // Aucune commande n'existe : l'utilisateur peut réessayer sans risque.
    setFormError(recovered.error);
    setCanRecover(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitOrder();
  }

  /**
   * Valide le formulaire puis enregistre la commande.
   *
   * Point d'entrée unique, appelé par le bouton de confirmation comme par la
   * soumission native du formulaire (touche Entrée). Aucune des deux voies ne
   * dépend d'une soumission HTML implicite : voir le commentaire du bouton de
   * pied de formulaire.
   */
  async function submitOrder(): Promise<void> {
    setFormError(null);
    setCanRecover(false);

    if (lines.length === 0) {
      setFormError("Votre panier est vide. Ajoutez au moins un article avant de commander.");
      return;
    }

    const parsed = checkoutFormSchema.safeParse(values);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "formulaire");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      setFormError("Certains champs sont incomplets ou invalides. Corrigez-les puis réessayez.");
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = readStoredIdempotencyKey();
    }

    const result = await submitOrderAction({
      items: lines.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
      })),
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      city: DEFAULT_CITY,
      quarter: parsed.data.quarter,
      landmark: parsed.data.landmark,
      sector: parsed.data.sector.length > 0 ? parsed.data.sector : null,
      instructions: parsed.data.instructions.length > 0 ? parsed.data.instructions : null,
      notes:
        parsed.data.notes.length > 0
          ? parsed.data.notes
          : parsed.data.instructions.length > 0
            ? parsed.data.instructions
            : null,
      payment_method: "COD",
      coupon_code: values.coupon_code.trim() === "" ? null : values.coupon_code,
      idempotency_key: idempotencyKeyRef.current,
      company_website: honeypotValue,
      form_started_at: formStartedAtRef.current,
      captcha_token: captchaToken,
    });

    setIsSubmitting(false);

    if (!result.success) {
      // Le message provient du serveur : il nomme le produit concerné lorsque le
      // stock a changé, ou l'anomalie de la promotion.
      setFormError(result.error);
      // Un échec réseau ne permet pas de savoir si la commande est passée :
      // on propose explicitement la récupération plutôt qu'un nouvel essai.
      setCanRecover(true);
      return;
    }

    setOrderNumber(result.orderNumber);
    clear();
    clearIdempotencyKey();
    router.refresh();
  }

  if (!isHydrated) {
    return (
      <div aria-busy="true" className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <Skeleton className="h-96 w-full" />
        </div>
        <div className="lg:w-80">
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (orderNumber) {
    return <Confirmation orderNumber={orderNumber} />;
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Finaliser la commande</h1>
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title="Votre panier est vide"
          description="Ajoutez des articles à votre panier avant de passer commande."
          actionLabel="Voir le catalogue"
          actionHref="/categories"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Finaliser la commande</h1>
        <CheckoutStepper currentStep={step} />
      </header>

      {formError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-danger bg-danger/5 p-4 text-sm text-danger"
        >
          <p>{formError}</p>
          {canRecover ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecover}
              isLoading={isSubmitting}
              loadingLabel="Recherche de votre commande"
              disabled={isSubmitting}
              className="w-fit"
            >
              Vérifier si ma commande a bien été enregistrée
            </Button>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col gap-6">
          {step === 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Vos coordonnées</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Input
                  label="Nom complet"
                  name="full_name"
                  required
                  autoComplete="name"
                  value={values.full_name}
                  onChange={(event) => updateField("full_name", event.target.value)}
                  error={fieldErrors.full_name ?? null}
                  hint="Nous vous appelons à ce numéro pour confirmer votre commande."
                />

                <Input
                  label="Téléphone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="tel"
                  placeholder="90123456 ou +22790123456"
                  value={values.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  error={fieldErrors.phone ?? null}
                />
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Adresse de livraison</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Input
                    label="Ville"
                    name="city"
                    defaultValue={DEFAULT_CITY}
                    readOnly
                    hint="Nous livrons pour le moment à Niamey et ses quartiers."
                  />

                  {quarters.length > 0 ? (
                    <Select
                      label="Quartier"
                      name="quarter"
                      required
                      value={values.quarter}
                      onChange={(event) => updateField("quarter", event.target.value)}
                      error={fieldErrors.quarter ?? null}
                      hint="Le quartier détermine les frais de livraison."
                    >
                      <option value="">Sélectionnez votre quartier</option>
                      {quarters.map((quarter) => (
                        <option key={quarter} value={quarter}>
                          {quarter}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="Quartier"
                      name="quarter"
                      required
                      value={values.quarter}
                      onChange={(event) => updateField("quarter", event.target.value)}
                      error={fieldErrors.quarter ?? null}
                    />
                  )}

                  {selectedZone ? (
                    <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
                      {`Zone « ${selectedZone.name} » — frais de livraison : ${
                        selectedZone.fee === 0
                          ? "offerts"
                          : `${selectedZone.fee.toLocaleString("fr-FR")} XOF`
                      }.`}
                    </p>
                  ) : null}

                  <Input
                    label="Point de repère"
                    name="landmark"
                    required
                    placeholder="Ex. : devant la pharmacie Saint-Jean, près du marché"
                    value={values.landmark}
                    onChange={(event) => updateField("landmark", event.target.value)}
                    error={fieldErrors.landmark ?? null}
                    hint="Un repère précis facilite la livraison."
                  />

                  <Input
                    label="Secteur (facultatif)"
                    name="sector"
                    value={values.sector}
                    onChange={(event) => updateField("sector", event.target.value)}
                    error={fieldErrors.sector ?? null}
                  />

                  <Textarea
                    label="Instructions de livraison (facultatif)"
                    name="instructions"
                    rows={3}
                    placeholder="Ex. : appeler avant d'arriver, portail bleu…"
                    value={values.instructions}
                    onChange={(event) => updateField("instructions", event.target.value)}
                    error={fieldErrors.instructions ?? null}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Note pour notre équipe (facultatif)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    label="Instructions complémentaires"
                    name="notes"
                    rows={3}
                    placeholder="Ex. : appeler à 14 h pour confirmer"
                    value={values.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    error={fieldErrors.notes ?? null}
                  />
                </CardContent>
              </Card>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Récapitulatif</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Nom</dt>
                      <dd className="text-right font-medium text-text">{values.full_name}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Téléphone</dt>
                      <dd className="text-right font-medium text-text">{values.phone}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Adresse</dt>
                      <dd className="text-right font-medium text-text">
                        {`${values.quarter}${values.sector ? `, ${values.sector}` : ""} — ${DEFAULT_CITY}`}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-text-muted">Point de repère</dt>
                      <dd className="text-right font-medium text-text">{values.landmark}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {/*
                Paiement : la liste provient de l'abstraction fournisseurs, qui
                ne contient aujourd'hui que le COD. Aucun moyen de paiement en
                ligne n'est proposé, car aucun n'est réel.
              */}
              <Card>
                <CardHeader>
                  <CardTitle>Mode de paiement</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {listAvailablePaymentProviders().map((provider) => (
                    <label
                      key={provider.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary bg-primary/5 p-4"
                    >
                      <input
                        type="radio"
                        name="payment_method"
                        value={provider.id}
                        defaultChecked
                        className="mt-1 size-4"
                      />
                      <span className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-text">{provider.label}</span>
                        <span className="text-xs text-text-muted">{provider.description}</span>
                      </span>
                    </label>
                  ))}

                  <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
                    Le montant total, frais de livraison compris, est confirmé par
                    téléphone avant toute expédition.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : null}

          {/* Piège à miel : masqué du champ de vision, retiré de la tabulation
              et du lecteur d'écran. Un humain ne peut pas le remplir. */}
          <input
            type="text"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-hidden="true"
            className="pointer-events-none absolute -left-[9999px] h-px w-px opacity-0"
            value={honeypotValue}
            onChange={(event) => setHoneypotValue(event.target.value)}
          />

          {captchaEnabled ? (
            <div className="flex flex-col gap-2">
              <TurnstileWidget siteKey={captchaSiteKey} onToken={setCaptchaToken} />
              {captchaToken === null ? (
                <p className="text-xs text-muted">
                  Confirmez la vérification anti-robot pour valider votre commande.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            {step > 1 ? (
              <Button type="button" variant="ghost" size="md" onClick={() => goToStep((step - 1) as 1 | 2)}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                Retour
              </Button>
            ) : (
              <Link href="/cart" className="text-sm text-primary hover:underline">
                <ArrowLeft aria-hidden="true" className="mr-1 inline size-4" />
                Modifier mon panier
              </Link>
            )}

            {/*
              Un seul bouton, toujours en `type="button"`, dont l'action et le
              libellé dépendent de l'étape.

              Les deux rendus précédents (« Continuer » puis « Confirmer ma
              commande ») étaient deux `Button` du même type à la même
              position : React réutilisait le nœud et faisait passer son
              attribut `type` de `button` à `submit` pendant le clic. Le
              comportement d'activation HTML étant évalué après le clic, cliquer
              « Continuer » à l'étape adresse soumettait le formulaire et
              créait la commande avant l'étape récapitulatif et le code promo.
            */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={step < 3 ? handleNext : () => void submitOrder()}
              isLoading={step === 3 && isSubmitting}
              loadingLabel="Enregistrement de votre commande"
              disabled={step === 3 && (isSubmitting || (captchaEnabled && captchaToken === null))}
            >
              {step < 3 ? "Continuer" : "Confirmer ma commande"}
              {step < 3 ? <ChevronRight aria-hidden="true" className="size-4" /> : null}
            </Button>
          </div>
        </div>

        {/* Récapitulatif latéral : visible à tout moment pour éviter les allers-retours. */}
        <div className="flex w-full flex-col gap-4 lg:sticky lg:top-20 lg:w-96">
          <Card>
            <CardHeader>
              <CardTitle>Votre commande</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ul className="flex flex-col gap-3">
                {lines.map((line) => (
                  <li key={line.variant_id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-text">{line.name}</span>
                      {line.variant_label ? (
                        <span className="text-xs text-text-muted">{line.variant_label}</span>
                      ) : null}
                      <span className="text-xs text-text-muted">
                        {`${line.quantity} × ${formatPrice(line.unit_price)}`}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium text-text">
                      {formatPrice(line.unit_price * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-text-muted">Sous-total</span>
                  <span className="font-semibold text-text">{formatPrice(subtotal)}</span>
                </div>

                {/*
                  Code promo : le client saisit un code, jamais un montant. La
                  remise affichée ici est un aperçu — elle est recalculée
                  en base au moment de la commande.

                  ⚠️ `div` et non `form` : ce bloc est déjà dans le formulaire
                  de commande, et HTML interdit d'imbriquer deux `<form>`. Le
                  navigateur réécrivait le DOM, ce qui cassait l'hydratation
                  React : le champ se vidait à la saisie et le message de
                  refus ne s'affichait jamais. La touche Entrée est traitée
                  par `onKeyDown` et le bouton est en `type="button"` — aucune
                  soumission native n'est nécessaire.
                */}
                <div
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void applyCoupon();
                  }}
                  className="flex flex-col gap-1.5"
                >
                  <label htmlFor="coupon_code" className="text-xs font-medium text-text-muted">
                    Code promo
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="coupon_code"
                      name="coupon_code"
                      value={values.coupon_code}
                      onChange={(event) => updateField("coupon_code", event.target.value.toUpperCase())}
                      placeholder="SAISIR LE CODE"
                      maxLength={24}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm uppercase"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void applyCoupon()}
                      disabled={isCouponPending || values.coupon_code.trim() === ""}
                      isLoading={isCouponPending}
                      loadingLabel="Vérification"
                    >
                      Appliquer
                    </Button>
                  </div>
                  {couponMessage && couponStateIsCurrent ? (
                    <p role="status" className="text-xs text-success">
                      {couponMessage}
                    </p>
                  ) : null}
                  {couponError && couponStateIsCurrent ? (
                    <p role="alert" className="text-xs text-danger">
                      {couponError}
                    </p>
                  ) : null}
                </div>

                {appliedDiscount > 0 ? (
                  <div className="flex items-baseline justify-between">
                    <span className="text-text-muted">Remise</span>
                    <span className="font-semibold text-success">
                      -{formatPrice(appliedDiscount)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between">
                  <span className="text-text-muted">Livraison</span>
                  {deliveryFee === null ? (
                    <span className="text-text-muted">Selon votre quartier</span>
                  ) : (
                    <span className="font-semibold text-text">
                      {deliveryFee === 0 ? "Offerte" : formatPrice(deliveryFee)}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-2">
                  <span className="font-semibold text-text">Total estimé</span>
                  <Price amount={estimatedTotal} size="lg" />
                </div>
              </div>

              {deliveryFee === null && step < 3 ? (
                <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
                  Choisissez votre quartier pour connaître les frais de livraison exacts.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <ul className="flex flex-col gap-2 text-xs text-text-muted">
            <li className="flex items-start gap-2">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Paiement à la livraison uniquement, en espèces.</span>
            </li>
            <li className="flex items-start gap-2">
              <Truck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>Livraison dans les principaux quartiers de Niamey.</span>
            </li>
          </ul>
        </div>
      </form>
    </div>
  );
}

/** Indicateur d'avancement, mobile-first. */
function CheckoutStepper({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const currentIndex = STEPS.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="Étapes de la commande">
      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step.id} className="flex flex-1 flex-col gap-1.5">
              <div
                className={cn(
                  "h-1.5 rounded-full transition-colors",
                  isDone ? "bg-success" : isCurrent ? "bg-primary" : "bg-border"
                )}
              />
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  isCurrent ? "text-primary" : isDone ? "text-success" : "text-text-muted"
                )}
              >
                {isDone ? (
                  <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" />
                ) : null}
                <span className="truncate">
                  <span className="hidden sm:inline">{`${step.id}. `}</span>
                  {step.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Confirmation({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 px-4 py-12 text-center">
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-success/10 text-success"
      >
        <CheckCircle2 className="size-8" />
      </span>

      <h1 className="text-2xl font-bold text-text sm:text-3xl">
        Merci, votre commande est enregistrée
      </h1>

      <p className="text-base text-text-muted">
        Nous vous appelons très vite pour confirmer la disponibilité des articles
        et convenir du créneau de livraison.
      </p>

      <div className="rounded-xl border border-border bg-surface px-6 py-4">
        <p className="text-sm text-text-muted">Numéro de commande</p>
        <p className="mt-1 text-xl font-bold text-primary">{orderNumber}</p>
      </div>

      <p className="text-sm text-text-muted">
        Conservez ce numéro : il vous permet de suivre l&apos;avancement de votre
        commande à tout moment.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href={`/orders/${orderNumber}`}>
          <Button variant="primary" size="lg">
            Suivre ma commande
          </Button>
        </Link>
        <Link href="/categories">
          <Button variant="outline" size="lg">
            Continuer mes achats
          </Button>
        </Link>
      </div>
    </div>
  );
}
