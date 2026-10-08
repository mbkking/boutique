-- 031_backfill_customer_profile_link.sql
--
-- Rattache tous les profils clients à une fiche `customers` :
-- - Si une fiche `customers` existe avec le même téléphone mais sans
--   profile_id, on la rattache.
-- - Sinon on crée la fiche depuis `profiles`.
-- Idempotent : ne touche pas aux profils déjà rattachés.
UPDATE public.customers c
SET profile_id = p.id, updated_at = now()
FROM public.profiles p
WHERE c.phone = p.phone
  AND c.profile_id IS NULL
  AND p.role = 'customer';

INSERT INTO public.customers (profile_id, full_name, phone, total_orders, total_spent, created_at, updated_at)
SELECT p.id, p.full_name, p.phone, 0, 0, now(), now()
FROM public.profiles p
WHERE p.role = 'customer'
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.profile_id = p.id
  );
