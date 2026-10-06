import type { ActionResult } from "@/lib/actions/types";
import type { PaymentMethod, PaymentStatus } from "@/types";

/**
 * Abstraction des moyens de paiement.
 *
 * Au MVP, **un seul mode est réel : le paiement à la livraison (COD)**. Aucun
 * moyen de paiement en ligne n'est simulé, simulé ou présenté comme tel.
 *
 * Cette interface existe pour que l'ajout ultérieur de Mobile Money ou de la
 * carte bancaire soit une *implémentation supplémentaire* et non une
 * refonte du checkout. Elle est volontairement étroite : ce qu'un moyen de
 * paiement doit savoir faire, c'est être disponible, puis produire une
 * intention de paiement. Tout le reste — validation, persistance, notification
 * — reste du ressort des services de commande.
 *
 * À l'ajout d'un fournisseur, deux points seulement sont à modifier :
 * écrire la classe, puis l'enregistrer dans `registry`.
 */

export interface PaymentIntent {
  /** Montant attendu, en XOF (francs CFA). */
  amount: number;
  currency: string;
  /** Référence de la commande concernée. */
  orderId: string;
  orderNumber: string;
  /** Moyen de paiement demandé. */
  method: PaymentMethod;
  /**
   * Statut initial du paiement. Pour le COD, le paiement n'est pas « en
   * attente de traitement » mais « à encaisser à la livraison ».
   */
  status: PaymentStatus;
  /**
   * Données à transmettre au fournisseur. `null` si le paiement ne se fait pas
   * en ligne : le COD n'a rien à envoyer.
   */
  providerPayload: Record<string, string> | null;
}

export interface PaymentProvider {
  /** Identifiant technique du moyen de paiement. */
  readonly id: PaymentMethod;

  /** Libellé affiché au client. */
  readonly label: string;

  /** Explication courte affichée sous le libellé. */
  readonly description: string;

  /**
   * Le paiement se fait-il en ligne ?
   * Un moyen « en ligne » déclenche une redirection ou l'affichage d'un widget ;
   * un moyen hors ligne (COD) se règle au livreur.
   */
  readonly isOnline: boolean;

  /** Le moyen est-il réellement disponible ? */
  isAvailable(): boolean;

  /**
   * Construit l'intention de paiement.
   * Ne lève pas d'exception en fonctionnement normal : un moyen indisponible
   * doit produire un refus explicite, exploitable par l'appelant.
   */
  createIntent(input: {
    amount: number;
    currency: string;
    orderId: string;
    orderNumber: string;
  }): PaymentIntent;

/**
   * Vérifie qu'un paiement a bien été réglé.
   *
   * La méthode est **pure** : elle ne fait aucune lecture. La donnée lui est
   * fournie par l'appelant, qui la lit en base. Cette contrainte est délibérée :
   * ce module est importé par des composants clients (le checkout affiche la
   * liste des moyens disponibles), il ne peut donc pas accéder au serveur.
   *
   * Pour le COD, la preuve n'est pas une réponse de fournisseur mais
   * l'**encaissement réellement enregistré** par le livreur.
   */
  verifyPayment(input: PaymentVerificationInput): PaymentVerification;

  /** Rembourse un paiement. Réservé aux moyens en ligne. */
  refund?(input: { reference: string; amount: number }): Promise<ActionResult<never>>;

  /**
   * Traite une notification asynchrone du fournisseur (webhook).
   *
   * La signature de la requête est spécifique à chaque fournisseur : le contrat
   * impose seulement que la vérification de la source soit faite **avant** tout
   * effet de bord, sans quoi un tiers pourrait marquer une commande payée.
   */
  handleWebhook?(payload: unknown): Promise<ActionResult<never>>;
}

/**
 * Données fournies pour vérifier un paiement.
 *
 * `collectedAmount` n'est renseigné que pour les moyens hors ligne, où la
 * preuve vient d'un encaissement. `null` signifie « aucune preuve » : pour un
 * moyen en ligne, c'est la réponse du fournisseur qui fait foi.
 */
export interface PaymentVerificationInput {
  /** Référence de la transaction ou de l'encaissement. */
  reference: string;
  /** Montant attendu par la commande, en XOF. */
  expectedAmount: number;
  /** Montant réellement encaissé, si connu. */
  collectedAmount?: number | null;
}

export interface PaymentVerification {
  verified: boolean;
  /** Référence conservée pour l'audit. */
  reference: string | null;
  /** Montant confirmé, s'il est connu. */
  amount: number | null;
  reason?: string;
}

/**
 * Paiement à la livraison.
 *
 * Le seul fournisseur réel. Aucun appel réseau, aucune donnée transmise à un
 * tiers : l'encaissement est performed par le livreur, puis enregistré en base
 * par `collectCashAction`.
 */
export class CashOnDeliveryProvider implements PaymentProvider {
  readonly id: PaymentMethod = "COD";
  readonly label = "Paiement à la livraison";
  readonly description = "Vous réglez en espèces au livreur, à la réception de votre commande.";
  readonly isOnline = false;

  isAvailable(): boolean {
    return true;
  }

  createIntent(input: {
    amount: number;
    currency: string;
    orderId: string;
    orderNumber: string;
  }): PaymentIntent {
    return {
      amount: input.amount,
      currency: input.currency,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      method: this.id,
      status: "COD_PENDING",
      providerPayload: null,
    };
  }

  /**
   * La preuve de paiement COD, c'est l'encaissement enregistré.
   *
   * On ne se fie pas au statut de la commande : seul le montant réellement
   * collecté compte. Un encaissement partiel n'est pas traité comme un
   * non-paiement — un client peut régler moins que le total — mais il est
   * signalé, pour que la différence soit suivie.
   */
  verifyPayment(input: PaymentVerificationInput): PaymentVerification {
    const collected = input.collectedAmount;

    if (collected === null || collected === undefined) {
      return {
        verified: false,
        reference: null,
        amount: null,
        reason: "aucun encaissement enregistré pour cette livraison",
      };
    }

    return {
      verified: collected >= input.expectedAmount,
      reference: input.reference,
      amount: collected,
      ...(collected < input.expectedAmount
        ? { reason: `encaissement partiel : ${collected} sur ${input.expectedAmount}` }
        : {}),
    };
  }

  /**
   * Le COD ne se rembourse pas en ligne : un retour passe par le processus
   * de retour en dépôt, pas par un remboursement fournisseur.
   */
  async refund(): Promise<ActionResult<never>> {
    return {
      success: false,
      error: "Un retour se traite par le processus de retour en dépôt, pas par un remboursement.",
    };
  }

  /**
   * Aucun webhook : le paiement à la livraison ne produit aucune notification
   * asynchrone. La méthode reste présente pour que le contrat soit complet.
   */
  async handleWebhook(): Promise<ActionResult<never>> {
    return { success: false, error: "Le paiement à la livraison n'émet pas de webhook." };
  }
}

/**
 * Fournisseurs non encore implémentés (Mobile Money, carte bancaire).
 *
 * Ils sont **enregistrés mais indisponibles**. Cette distinction est
 * volontaire : le code peut référencer un moyen futur sans jamais laisser
 * croire au client qu'un paiement en ligne est possible. `isAvailable()`
 * renvoie `false`, ce qui les exclut de toute liste affichée.
 */
class UnavailableProvider implements PaymentProvider {
  constructor(
    readonly id: PaymentMethod,
    readonly label: string,
    readonly description: string,
    readonly isOnline = true
  ) {}

  isAvailable(): boolean {
    return false;
  }

  createIntent(): PaymentIntent {
    throw new Error(
      `Le moyen de paiement « ${this.label} » n'est pas encore disponible.`
    );
  }

  /** Un moyen non disponible ne peut avoir aucun paiement vérifié. */
  verifyPayment(input: PaymentVerificationInput): PaymentVerification {
    return {
      verified: false,
      reference: input.reference ?? null,
      amount: null,
      reason: "moyen de paiement non disponible",
    };
  }
}

const cashOnDelivery = new CashOnDeliveryProvider();

const registry: readonly PaymentProvider[] = [
  cashOnDelivery,
  new UnavailableProvider(
    "MOBILE_MONEY",
    "Mobile Money",
    "Orange Money, Moov Money, Airtel Money"
  ),
  new UnavailableProvider("CARD", "Carte bancaire", "Visa, Mastercard"),
  new UnavailableProvider("OTHER", "Autre moyen de paiement", "Virement, espèces"),
];

const byId = new Map<PaymentMethod, PaymentProvider>(
  registry.map((provider) => [provider.id, provider])
);

/** Fournisseur du paiement à la livraison. */
export function getCashOnDeliveryProvider(): PaymentProvider {
  return cashOnDelivery;
}

/** Tous les moyens enregistrés, y compris ceux qui ne sont pas encore actifs. */
export function listPaymentProviders(): readonly PaymentProvider[] {
  return registry;
}

/**
 * Moyens de paiement réellement actifs.
 *
 * C'est cette liste, et elle seule, qui doit alimenter l'interface : elle ne
 * contient aujourd'hui que le paiement à la livraison.
 */
export function listAvailablePaymentProviders(): readonly PaymentProvider[] {
  return registry.filter((provider) => provider.isAvailable());
}

/** Recherche un fournisseur par identifiant. */
export function getPaymentProvider(method: PaymentMethod): PaymentProvider | null {
  return byId.get(method) ?? null;
}

/**
 * Vérifie qu'un moyen demandé existe et fonctionne.
 * Utilisé par `createOrderAction`, qui ne doit accepter que `COD` au MVP.
 */
export function isSupportedPaymentMethod(method: unknown): method is PaymentMethod {
  if (typeof method !== "string") return false;
  const provider = byId.get(method as PaymentMethod);
  return provider ? provider.isAvailable() : false;
}