-- Ordem de compra com o item em campos próprios (antes só havia o texto livre "20x Nome").
-- Permite dar entrada no estoque pelo ID do produto. Todas as colunas são opcionais.
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_nome text,
  ADD COLUMN IF NOT EXISTS quantidade integer,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric;

-- Preenche as ordens existentes de item único ("20x Nome") e liga ao produto de mesmo nome, quando houver.
UPDATE compras c SET
  quantidade = (regexp_match(c.itens, '^(\d+)x (.+)$'))[1]::integer,
  item_nome  = (regexp_match(c.itens, '^(\d+)x (.+)$'))[2]
WHERE c.itens ~ '^\d+x .+$' AND c.itens NOT LIKE '%x %, %' AND c.item_nome IS NULL;

UPDATE compras c SET product_id = p.id
FROM products p
WHERE c.product_id IS NULL AND c.item_nome IS NOT NULL
  AND p.tenant_id = c.tenant_id AND lower(trim(p.name)) = lower(trim(c.item_nome));
