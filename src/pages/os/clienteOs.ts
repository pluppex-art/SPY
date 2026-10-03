// Dados do cliente (Base de Clientes) no formato das colunas de public.ordens_servico.

export function enderecoDoCliente(c: any): string {
  return [c?.logradouro, c?.numero, c?.bairro, c?.city, c?.state].filter(Boolean).join(", ");
}

export interface ClienteOsDados {
  cliente_nome: string | null;
  cliente_documento: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  cliente_endereco: string | null;
  local_execucao: string | null;
}

/** Tudo que a OS guarda do cliente, já pronto para gravar. Sem cliente, tudo nulo. */
export function dadosDoCliente(c: any): ClienteOsDados {
  const endereco = enderecoDoCliente(c) || null;
  return {
    cliente_nome: c?.name || null,
    cliente_documento: c?.documento || null,
    cliente_telefone: c?.phone || null,
    cliente_email: c?.email || null,
    cliente_endereco: endereco,
    local_execucao: endereco,
  };
}
