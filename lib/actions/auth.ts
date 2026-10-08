"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import { headers } from "next/headers";
import {
  homePathForRole,
  resolveLoginDestination,
} from "@/lib/auth/redirect";
import { phoneSchema } from "@/lib/validations/schemas";
import { consumeRateLimit, getClientIp, RATE_LIMITS } from "@/lib/services/rate-limit";
import { logger } from "@/lib/observability/logger";

/**
 * Déconnexion du client.
 *
 * La révocation du jeton est effectuée côté serveur ; un échec est signalé à
 * l'utilisateur plutôt que d'être silencieusement ignoré.
 */
export async function signOutAction(): Promise<ActionResult<Record<never, never>>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.warn("[auth] déconnexion :", error.message);
      return failure("La déconnexion a échoué. Réessayez dans un instant.");
    }

    revalidatePath("/", "layout");
    return success({});
  } catch {
    return failure("La déconnexion est momentanément indisponible.");
  }
}

// ============================================================
// Inscription publique : CLIENTS UNIQUEMENT
// ============================================================

const signUpSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Indiquez votre nom complet")
      .max(120, "Ce nom est trop long"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Adresse e-mail invalide")
      .max(254),
    phone: phoneSchema,
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères")
      .max(128, "Ce mot de passe est trop long")
      .regex(/[A-Za-z]/, "Le mot de passe doit contenir au moins une lettre")
      .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
    confirm_password: z.string(),
    cgu_accepted: z.literal(true, {
      error: "Vous devez accepter les conditions de vente",
    }),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirm_password"],
  });

export interface SignUpResult {
  /** Session ouverte immédiatement (confirmation e-mail désactivée). */
  signedIn: boolean;
}

/**
 * Crée un compte CLIENT depuis le formulaire public.
 *
 * Sécurité :
 * - le schéma zod ignore toute clé inconnue : un champ `role: "admin"`
 *   envoyé par le navigateur est abandonné avant tout traitement ;
 * - le trigger SQL `handle_new_user` force le rôle `customer` quoi qu'il
 *   arrive ;
 * - le rôle n'est donc jamais lu depuis la requête, à aucun niveau.
 */
export async function signUpAction(
  payload: unknown
): Promise<ActionResult<SignUpResult>> {
  const ip = await getClientIp();
  const limit = await consumeRateLimit(RATE_LIMITS.signUp, ip);
  if (!limit.allowed) {
    return failure(
      "Trop de créations de compte depuis cette connexion. Réessayez plus tard."
    );
  }

  const parsed = signUpSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { full_name, email, phone, password } = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, phone },
      },
    });

    if (error) {
      const detail = error.message.toLowerCase();
      if (
        detail.includes("already registered") ||
        detail.includes("already been registered") ||
        detail.includes("user already exists")
      ) {
        return failure(
          "Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez votre mot de passe."
        );
      }
      if (
        detail.includes("rate limit") ||
        detail.includes("too many requests") ||
        (error as { status?: number }).status === 429
      ) {
        logger.warn("auth: inscription bloquee par la limite e-mail", { error: error.message });
        return failure(
          "L'envoi des e-mails de confirmation est temporairement saturé. Réessayez dans quelques minutes."
        );
      }
      logger.warn("auth: inscription refusee", { error: error.message });
      return failure("La création du compte a échoué. Réessayez dans un instant.");
    }

    // Confirmation e-mail exigée par le projet : aucun jeton, le visiteur
    // doit cliquer le lien reçu avant de se connecter.
    if (!data.session) {
      return success({ signedIn: false });
    }

    revalidatePath("/", "layout");
    return success({ signedIn: true });
  } catch {
    return failure("La création du compte est momentanément indisponible.");
  }
}

// ============================================================
// Connexion unique pour tous les rôles
// ============================================================

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254),
  password: z.string().min(1, "Indiquez votre mot de passe").max(128),
  returnTo: z.string().max(2048).optional().nullable(),
});

export interface SignInResult {
  /**
   * Destination finale calculée côté serveur depuis le rôle réel : le
   * `returnTo` demandé s'il est interne et autorisé au rôle, sinon l'espace
   * d'atterrissage du rôle. Le navigateur n'a qu'à s'y rendre.
   */
  destination: string;
}

/**
 * Connecte un utilisateur puis renvoie son espace d'atterrissage.
 *
 * Le rôle est lu en base, jamais dans la requête : un client ne peut pas
 * choisir sa destination. Un `returnTo` n'est honoré que s'il est interne ET
 * autorisé au rôle (anti open-redirect + anti contournement d'espace).
 */
export async function signInAction(
  payload: unknown
): Promise<ActionResult<SignInResult>> {
  const ip = await getClientIp();
  const limit = await consumeRateLimit(RATE_LIMITS.signIn, ip);
  if (!limit.allowed) {
    return failure(
      "Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes."
    );
  }

  const parsed = signInSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { email, password, returnTo } = parsed.data;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return failure(
        "Connexion impossible : vérifiez votre adresse e-mail et votre mot de passe."
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      logger.warn("auth: profil manquant ou inactif apres connexion", { email });
      return failure(
        "Votre compte n'est pas encore activé. Contactez la boutique pour finaliser votre inscription."
      );
    }

    const homePath = homePathForRole(
      profile.role as "customer" | "admin" | "order_operator" | "stock_manager" | "driver"
    );

    if (!homePath) {
      await supabase.auth.signOut();
      logger.error("auth: role inconnu apres connexion", { email });
      return failure("Votre compte a un rôle inconnu. Contactez la boutique.");
    }

    // Le panier invité est rattaché au compte dès la connexion.
    try {
      const { mergeGuestCartAction } = await import("@/lib/actions/cart");
      await mergeGuestCartAction();
    } catch {
      // Non bloquant : la commande reste possible, le panier local est conservé.
    }

    revalidatePath("/", "layout");

    const role = profile.role as
      | "customer"
      | "admin"
      | "order_operator"
      | "stock_manager"
      | "driver";
    const host = (await headers()).get("host");
    return success({
      destination: resolveLoginDestination(host, role, returnTo),
    });
  } catch {
    return failure("La connexion est momentanément indisponible.");
  }
}

// ============================================================
// Mot de passe oublié
// ============================================================

const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254),
});

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Envoie le lien de réinitialisation. Réponse identique que le compte existe
 * ou non : on ne révèle jamais l'existence d'un compte.
 */
export async function requestPasswordResetAction(
  payload: unknown
): Promise<ActionResult<{ sent: boolean }>> {
  const ip = await getClientIp();
  const limit = await consumeRateLimit(RATE_LIMITS.publicForm, ip);
  if (!limit.allowed) {
    return failure("Trop de demandes. Réessayez plus tard.");
  }

  const parsed = resetRequestSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${appUrl()}/auth/callback?next=/reinitialiser-mot-de-passe`,
    });
    return success({ sent: true });
  } catch {
    return failure("La demande est momentanément indisponible.");
  }
}

const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères")
      .max(128)
      .regex(/[A-Za-z]/, "Le mot de passe doit contenir au moins une lettre")
      .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre"),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirm_password"],
  });

/**
 * Définit le nouveau mot de passe. N'est appelable qu'avec une session de
 * récupération valide (ouverte par `/auth/callback` depuis le lien e-mail).
 */
export async function updatePasswordAction(
  payload: unknown
): Promise<ActionResult<{ updated: boolean }>> {
  const parsed = updatePasswordSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return failure("Ce lien est invalide ou a expiré. Demandez un nouveau lien.");
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      return failure("La mise à jour a échoué. Demandez un nouveau lien.");
    }

    revalidatePath("/", "layout");
    return success({ updated: true });
  } catch {
    return failure("La mise à jour est momentanément indisponible.");
  }
}

// ============================================================
// Rôle pour l'en-tête (sans casser le rendu statique)
// ============================================================

export interface HeaderRole {
  loggedIn: boolean;
  role: "customer" | "admin" | "order_operator" | "stock_manager" | "driver" | null;
}

/**
 * Rôle minimal pour afficher la navigation adaptée dans l'en-tête public.
 *
 * Appelé côté client après hydratation : le HTML serveur reste identique
 * pour tout le monde (aucun écart d'hydratation), puis la navigation
 * s'ajuste. Aucune donnée sensible n'est exposée : seul le rôle transite.
 */
export async function getHeaderRoleAction(): Promise<HeaderRole> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { loggedIn: false, role: null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || !profile.is_active) return { loggedIn: false, role: null };
    return { loggedIn: true, role: profile.role as HeaderRole["role"] };
  } catch {
    return { loggedIn: false, role: null };
  }
}
