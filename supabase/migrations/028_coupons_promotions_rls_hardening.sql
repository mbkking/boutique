-- ============================================================================
-- 028_coupons_promotions_rls_hardening.sql
--
-- Contexte (audit QA B3) :
--   La table `coupons` (et `promotions`) étaient lisibles intégralement avec la
--   seule clé anon/publique : codes, réductions, usages, portées étaient
--   exposés à n'importe quel visiteur non authentifié.
--
-- Correctif :
--   - RLS explicitement activée sur les deux tables ;
--   - suppression de toutes les policies existantes (SELECT publique incluse) ;
--   - aucune nouvelle policy SELECT publique n'est recréée.
--
-- Pourquoi c'est sûr pour l'application :
--   - l'admin écrit/lit via la clé service role (lib/actions/admin/coupons.ts et
--     promotions.ts) qui contourne RLS ;
--   - la validation client d'un code passe par la server action
--     (lib/services/coupons.ts → safeQuery → client service role → RPC
--     `coupon_is_valid`) — elle ne lit jamais `coupons` directement ;
--   - les promotions actives lues au checkout passent par
--     lib/data/promotions.ts → safeQuery → client service role.
--
-- Idempotent : les DROP sont `IF EXISTS`, RLS est réactivée à chaque exécution.
-- ============================================================================

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- Supprime toutes les policies actuelles sur coupons/promotions.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('coupons', 'promotions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Aucune policy SELECT/INSERT/UPDATE/DELETE publique : seul le service role
-- (administration et server actions serveur) accède à ces tables.
-- Les anciennes policies comme `coupons_admin_write`, `coupons_public_read`,
-- `promotions_read`, etc., si présentes, sont supprimées par le bloc ci-dessus.
