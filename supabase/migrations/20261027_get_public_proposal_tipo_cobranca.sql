-- Fallback público da proposta (RPC get_public_proposal): passa a devolver o tipo de cobrança e o
-- prazo de cada item e a forma de pagamento, pra página mostrar a MENSALIDADE (recorrente) ou
-- "Nx de R$ Y" (parcelado) em vez de multiplicar o preço pelos ciclos / rotular tudo como total.
-- Só campos que o cliente pode ver: as observações de pagamento (possivelmente internas) ficam de fora.
create or replace function public.get_public_proposal(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_proposal record;
  v_items jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  update public.proposals
  set
    first_viewed_at = coalesce(first_viewed_at, now()),
    last_viewed_at = now(),
    view_count = view_count + 1
  where view_token = p_token
  returning id, titulo, cliente, valor, status, validade, tipo, conteudo_texto, created_at, pagamento
  into v_proposal;

  if v_proposal.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'productName', pi.product_name,
           'quantidade', pi.quantidade,
           'precoUnitario', pi.preco_unitario,
           'billingType', pi.billing_type,
           'contractMonths', pi.contract_months
         ) order by pi.created_at), '[]'::jsonb)
  into v_items
  from public.proposal_items pi
  where pi.proposal_id = v_proposal.id;

  return jsonb_build_object(
    'titulo', v_proposal.titulo,
    'cliente', v_proposal.cliente,
    'valor', v_proposal.valor,
    'status', v_proposal.status,
    'validade', v_proposal.validade,
    'tipo', v_proposal.tipo,
    'conteudoTexto', v_proposal.conteudo_texto,
    'criadaEm', v_proposal.created_at,
    'pagamento', case when v_proposal.pagamento is null then null else jsonb_strip_nulls(jsonb_build_object(
        'formaPagamento', v_proposal.pagamento->'formaPagamento',
        'parcelas', v_proposal.pagamento->'parcelas',
        'parcelasRecorrentes', v_proposal.pagamento->'parcelasRecorrentes',
        'valorEntrada', v_proposal.pagamento->'valorEntrada',
        'valorParcela', v_proposal.pagamento->'valorParcela',
        'metodos', v_proposal.pagamento->'metodos',
        'dataVencimentoEntrada', v_proposal.pagamento->'dataVencimentoEntrada',
        'primeiroVencimentoParcela', v_proposal.pagamento->'primeiroVencimentoParcela',
        'diaDoMes', v_proposal.pagamento->'diaDoMes',
        'diaFixoVencimento', v_proposal.pagamento->'diaFixoVencimento')) end,
    'itens', v_items
  );
end;
$$;
