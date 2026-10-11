-- ============================================================================
-- 030_push_subscriptions.sql
--
-- Abonnements Web Push.
--
-- Chaque navigateur qui accepte les notifications crée un abonnement auprès de
-- son service de push (Firefox/Chrome/Safari) : un couple `endpoint` + clés de
-- chiffrement (`p256dh`, `auth`), plus l'origine de l'application où l'abonnement
-- a été pris (client, admin ou livreur) qui sert à construire le lien de la
-- notification.
--
-- Portée : un abonnement appartient à un profil (`profiles.id`). La
-- suppression du profil supprime ses abonnements.
--
-- Accès :
--   - l'application lit/écrit via la clé service role (server actions
--     lib/actions/push.ts et service de notifications) qui contourne RLS ;
--   - les policies ci-dessous n'autorisent qu'un profil à voir et gérer ses
--     propres abonnements — défense en profondeur, jamais utilisées par le
--     serveur.
--
-- Idempotent : `CREATE ... IF NOT EXISTS`, DROP des policies avant recréation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  origin text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un `endpoint` identifie une installation de navigateur : le réutiliser pour
-- un autre profil (reconnexion sur un poste partagé) doit mettre à jour la
-- ligne plutôt que la dupliquer.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
