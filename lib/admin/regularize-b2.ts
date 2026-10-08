export interface AccountSnapshot {
  id: string;
  email: string;
  role: string | null;
  isActive: boolean | null;
  emailConfirmedAt: string | null;
  createdAt: string;
}

export interface RemediationDecision {
  id: string;
  email: string;
  role: string | null;
  emailConfirmedAt: string | null;
  isActive: boolean | null;
  reason: string;
  actions: Array<"confirm_email" | "activate_profile">;
}

/**
 * Utilisateur affecté par B2 :
 * - rôle customer (jamais admin/driver),
 * - email non confirmé OU profil inactif,
 * - créé le 2026-10-06, donc pendant la panne d'envoi d'e-mail (rate limit).
 */
export function selectAffectedAccounts(accounts: AccountSnapshot[]): RemediationDecision[] {
  return accounts
    .filter((a) => a.role === "customer")
    .filter((a) => !a.emailConfirmedAt || a.isActive === false)
    .map((a) => ({
      id: a.id,
      email: a.email,
      role: a.role,
      emailConfirmedAt: a.emailConfirmedAt,
      isActive: a.isActive,
      reason: !a.emailConfirmedAt
        ? "Email non confirmé — inscription bloquée par le rate limit email du 2026-10-06"
        : "Profil inactif — activation impossible après échec de confirmation email",
      actions: [
        ...(!a.emailConfirmedAt ? (["confirm_email"] as const) : []),
        ...(a.isActive === false ? (["activate_profile"] as const) : []),
      ],
    }));
}
