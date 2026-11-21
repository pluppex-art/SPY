/**
 * Achado de UX 2026-09-21: ~77 lugares no app interpolavam `error.message`
 * bruto do Supabase/Postgres direto num toast — o cliente final via jargão de
 * banco de dados ("new row violates row-level security policy", "duplicate
 * key value violates unique constraint...") em vez de uma mensagem que ele
 * entende. Mapeia os erros mais comuns pra português simples; qualquer coisa
 * não reconhecida cai num fallback genérico em vez do texto técnico cru.
 */
export function friendlyError(error: unknown): string {
  const raw = typeof error === "string" ? error : (error as { message?: string } | null | undefined)?.message || "";
  const msg = raw.toLowerCase();

  if (!msg) return "Não foi possível concluir a ação agora. Tente novamente.";

  if (msg.includes("plan_limit_leads")) return "Limite de leads do plano atingido. Peça ao responsável para ampliar o plano.";
  if (msg.includes("plan_limit_users")) return "Limite de usuários do plano atingido. Peça ao responsável para ampliar o plano.";

  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Você não tem permissão para fazer essa ação.";
  }
  if (msg.includes("duplicate key") || msg.includes("already exists") || msg.includes("unique constraint")) {
    return "Já existe um registro com esses dados.";
  }
  if (msg.includes("violates foreign key") || msg.includes("foreign key constraint")) {
    return "Esse registro está vinculado a outro e não pode ser removido/alterado assim.";
  }
  if (msg.includes("violates not-null constraint") || msg.includes("null value in column")) {
    return "Preencha todos os campos obrigatórios.";
  }
  if (msg.includes("value too long") || msg.includes("character varying")) {
    return "Um dos campos ultrapassou o tamanho máximo permitido.";
  }
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout") || msg.includes("err_name_not_resolved")) {
    return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
  }
  if (msg.includes("jwt") || msg.includes("invalid login") || msg.includes("unauthorized") || msg.includes("401")) {
    return "Sua sessão expirou. Atualize a página e faça login novamente.";
  }

  // Nada reconhecido: melhor um fallback genérico do que jargão técnico cru.
  return "Não foi possível concluir a ação agora. Tente novamente ou contate o suporte.";
}
