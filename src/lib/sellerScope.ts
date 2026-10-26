/**
 * Escopo de vendedor: quem tem um cargo marcado com "Restringir aos próprios
 * dados" (cargos.restringir_aos_proprios_dados) enxerga só o que é dele —
 * leads, propostas, tarefas, atividades, reuniões e contratos ligados a esses
 * leads. Master e admin do tenant nunca são restringidos. O mesmo critério é
 * aplicado no banco por RLS (função public.vendedor_confere_nome); este arquivo
 * é a metade da tela.
 */

/** Minúsculo, sem acento, só letras/números separados por espaço único. */
export function normNome(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O campo `leads.seller` é texto livre ("GUSTAVO OLIVEIRA DA SILVA" num lead,
 * "Gustavo Oliveira" no cadastro do usuário). Dois nomes conferem quando todas
 * as palavras do mais curto aparecem no mais longo.
 */
export function nomeConfere(a: unknown, b: unknown): boolean {
  const ta = normNome(a).split(" ").filter(Boolean);
  const tb = normNome(b).split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return false;
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const set = new Set(longo);
  return curto.every((t) => set.has(t));
}

export interface SellerScopeUser {
  id?: string;
  name?: string;
  role?: string;
  isMaster?: boolean;
  isTenantAdmin?: boolean;
}

/** O usuário está restrito aos próprios dados? (cargo com a opção ligada) */
export function isSellerRestricted(user: SellerScopeUser | null | undefined, cargos: any[]): boolean {
  if (!user || user.isMaster || user.isTenantAdmin) return false;
  const cargo = (cargos || []).find((c) => c.nome === user.role);
  return !!cargo?.restringir_aos_proprios_dados;
}

export interface SellerScopeInput {
  user: SellerScopeUser;
  /** `colaboradores` do tenant — pra casar tarefas pelo colaborador responsável. */
  colaboradores?: any[];
  leads: any[];
  proposals: any[];
  proposalItems: any[];
  tasks: any[];
  leadActivities: any[];
  reunioes: any[];
  contracts: any[];
}

export function leadIsMine(lead: any, user: SellerScopeUser): boolean {
  if (lead?.seller_id && user.id && lead.seller_id === user.id) return true;
  return nomeConfere(lead?.seller, user.name);
}

/** Aplica o escopo a todas as listas que o resto do sistema consome. */
export function scopeToSeller(input: SellerScopeInput) {
  const { user } = input;
  const myColabIds = new Set(
    (input.colaboradores || []).filter((c) => c.user_id && c.user_id === user.id).map((c) => c.id),
  );

  const leads = input.leads.filter((l) => leadIsMine(l, user));
  const leadIds = new Set(leads.map((l) => l.id));

  const proposals = input.proposals.filter(
    (p) => (p.lead_id && leadIds.has(p.lead_id)) || nomeConfere(p.vendedor, user.name),
  );
  const proposalIds = new Set(proposals.map((p) => p.id));

  const tasks = input.tasks.filter(
    (t) =>
      (t.lead_id && leadIds.has(t.lead_id)) ||
      (t.assigned_to && myColabIds.has(t.assigned_to)) ||
      (t.creator_id && t.creator_id === user.id),
  );

  return {
    leads,
    proposals,
    proposalItems: input.proposalItems.filter((i) => proposalIds.has(i.proposal_id)),
    tasks,
    leadActivities: input.leadActivities.filter((a: any) => leadIds.has(a.lead_id ?? a.leadId)),
    reunioes: input.reunioes.filter((r: any) => leadIds.has(r.leadId ?? r.lead_id)),
    contracts: input.contracts.filter((c) => c.proposalId && proposalIds.has(c.proposalId)),
  };
}
