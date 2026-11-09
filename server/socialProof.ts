// Prova social do checkout/site: SÓ vendas reais, sem nenhum dado pessoal (nem nome, nem empresa, nem e-mail).
// Cada item é só o nome do plano (já público em /api/checkout/plans) e o horário arredondado a 10 minutos.
const TEN_MIN = 10 * 60_000;

export interface SocialProofItem { plan: string; paidAt: string }

export function socialProofItems(rows: any[], now = Date.now()): SocialProofItem[] {
  return (rows || [])
    .filter((r) => typeof r?.plan_name === "string" && r.plan_name.trim() && r.paid_at && Number.isFinite(Date.parse(r.paid_at)) && Date.parse(r.paid_at) <= now + 60_000)
    .slice(0, 8)
    .map((r) => ({
      plan: r.plan_name.trim().slice(0, 60),
      paidAt: new Date(Math.round(Date.parse(r.paid_at) / TEN_MIN) * TEN_MIN).toISOString(),
    }));
}
