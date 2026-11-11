import { phoneKey } from "./funnelIds";

// Regra única do sistema: mesmo telefone OU mesmo e-mail (dentro da empresa) = a mesma pessoa. Quem cadastra um lead que já
// existe atualiza o existente em vez de duplicar. (O servidor aplica a mesma regra em formulários, checkout e API.)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const vazio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/** Lead da lista (já filtrada pela empresa ativa) com o mesmo telefone (qualquer escrita: com/sem 55, com/sem 9) ou e-mail. */
export function findDuplicateLead(leads: any[], cand: { phone?: unknown; email?: unknown }): any | null {
  const pk = phoneKey(cand.phone);
  const em = String(cand.email ?? "").trim().toLowerCase();
  const porTel = pk.length >= 8, porEmail = EMAIL.test(em);
  if (!porTel && !porEmail) return null;
  let achadoPorEmail: any = null;
  for (const l of leads) {
    if (!l || l.deleted_at) continue;
    if (porTel && (phoneKey(l.phone) === pk || (l.mobile_wa && phoneKey(l.mobile_wa) === pk))) return l; // telefone vale primeiro
    if (porEmail && !achadoPorEmail && String(l.email ?? "").trim().toLowerCase() === em) achadoPorEmail = l;
  }
  return achadoPorEmail;
}

/** Só preenche o que está VAZIO no lead existente (não apaga nem troca o que o vendedor já tem). */
export function fillEmptyLeadFields(existing: any, cand: any): Record<string, any> {
  const patch: Record<string, any> = {};
  const nomeSemValor = vazio(existing.name) || /^[\d\s()+-]+$/.test(String(existing.name));
  if (nomeSemValor && !vazio(cand.name)) patch.name = cand.name;
  for (const k of ["email", "phone", "company", "cnpj", "title", "lead_interesse_cliente"]) {
    if (vazio(existing[k]) && !vazio(cand[k])) patch[k] = cand[k];
  }
  const cidade = cand.customFields?.cidade;
  if (!vazio(cidade) && vazio(existing.customFields?.cidade) && vazio(existing.city)) patch.customFields = { ...(existing.customFields || {}), cidade };
  return patch;
}
