import "server-only";

/**
 * Fournisseur WhatsApp sortant.
 *
 * L'interface est préparée pour brancher ultérieurement l'API WhatsApp
 * Business / Meta sans toucher aux actions qui l'appellent. Aujourd'hui,
 * **aucun fournisseur réel n'est configuré** : `getWhatsAppProvider()`
 * renvoie un fournisseur qui rapporte `{ sent: false, reason: "WhatsApp
 * non configuré." }`, afin de ne jamais simuler un envoi.
 */

export interface WelcomeMessage {
  toPhone: string;
  driverName: string;
  companyName: string;
  accessUrl: string;
}

export interface NotificationSendResult {
  sent: boolean;
  reason?: string;
}

export interface NotificationProvider {
  readonly name: string;
  sendWelcome(message: WelcomeMessage): Promise<NotificationSendResult>;
}

class UnconfiguredWhatsAppProvider implements NotificationProvider {
  readonly name = "whatsapp-unconfigured";

  async sendWelcome(): Promise<NotificationSendResult> {
    return { sent: false, reason: "WhatsApp non configuré." };
  }
}

/**
 * Retourne le fournisseur WhatsApp courant.
 *
 * Quand les variables d'environnement d'un fournisseur réel seront en
 * place (`WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`), remplacer
 * le retour par l'impl�mentation correspondante. Jusque-là, on dit
 * clairement que rien n'est envoyé.
 */
export function getWhatsAppProvider(): NotificationProvider {
  const token = process.env.WHATSAPP_BUSINESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return new UnconfiguredWhatsAppProvider();
  }

  return new UnconfiguredWhatsAppProvider();
}

/** Texte de bienvenue partagé par tous les canaux � venir. */
export function buildWelcomeMessage(input: {
  companyName: string;
  driverName: string;
  accessUrl: string;
  contactPhone: string;
}): string {
  return [
    `Bienvenue chez ${input.companyName}.`,
    "",
    `Bonjour ${input.driverName},`,
    "",
    "Votre compte livreur vient d'être cré�.",
    "",
    `Vous pouvez accèder � votre espace livreur ici : ${input.accessUrl}`,
    "",
    "Nous sommes heureux de vous compter parmi nos livreurs.",
    `Contact : ${input.contactPhone}`,
  ].join("\n");
}
