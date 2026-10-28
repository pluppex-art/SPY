-- Organiza os produtos de planos e pacotes de IA criados em lote: SKU, fornecedor e tags (antes em branco),
-- e liga a Implementação como complemento dos planos, igual ao plano START já faz.
-- Só preenche o que está vazio; custo e comissão ficam para o time definir (margem é calculada a partir do custo).
update public.products p
   set sku      = coalesce(nullif(p.sku, ''), 'SPY-' || upper(s.code)),
       provider = coalesce(nullif(p.provider, ''), 'Interno'),
       tags     = case when coalesce(array_length(p.tags, 1), 0) = 0 then array['spy', 'plano', 'assinatura', s.code] else p.tags end,
       linked_product_ids = case
         when coalesce(array_length(p.linked_product_ids, 1), 0) = 0
              and exists (select 1 from public.products i where i.id = '35bdcf7a-5ca7-42da-940a-19d604e6b9cb' and i.deleted_at is null)
         then array['35bdcf7a-5ca7-42da-940a-19d604e6b9cb'::uuid]
         else p.linked_product_ids end
  from public.subscription_plans s
 where s.product_id = p.id;

update public.products p
   set sku      = coalesce(nullif(p.sku, ''), 'IA-' || t.credits),
       provider = coalesce(nullif(p.provider, ''), 'Interno'),
       tags     = case when coalesce(array_length(p.tags, 1), 0) = 0 then array['spy', 'creditos', 'ia'] else p.tags end
  from public.credit_tiers t
 where t.product_id = p.id;
