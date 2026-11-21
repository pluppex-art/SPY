-- Catálogo do fornecedor: itens que ele vende (subidos por planilha). NÃO são produtos da empresa;
-- viram produto só quando a compra dá entrada no estoque (product_id é preenchido nesse momento).
CREATE TABLE IF NOT EXISTS fornecedor_catalogo_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  fornecedor_id uuid not null references varejo_fornecedores(id) on delete cascade,
  nome text not null,
  codigo text,
  ean text,
  unidade text,
  categoria text,
  custo numeric,
  custo_anterior numeric,
  custo_atualizado_em timestamptz,
  product_id uuid references products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS fornecedor_catalogo_itens_forn_idx ON fornecedor_catalogo_itens (tenant_id, fornecedor_id);
ALTER TABLE fornecedor_catalogo_itens ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fornecedor_catalogo_itens' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON fornecedor_catalogo_itens FOR ALL
      USING (has_tenant_access(tenant_id)) WITH CHECK (has_tenant_access(tenant_id));
  END IF;
END $$;
REVOKE ALL ON fornecedor_catalogo_itens FROM anon;
REVOKE TRUNCATE ON fornecedor_catalogo_itens FROM authenticated;

-- A ordem de compra lembra de qual item do catálogo veio (para cadastrar o produto na entrada).
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS catalogo_item_id uuid REFERENCES fornecedor_catalogo_itens(id) ON DELETE SET NULL;
