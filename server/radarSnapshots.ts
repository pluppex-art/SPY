/**
 * Rotina diária do Radar: grava, para cada empresa, o retrato do dia (negócios esfriando e esquentando) em
 * lead_risk_snapshots — assim o histórico dos gráficos não depende de alguém abrir a tela. Usa a mesma regra
 * da tela (src/lib/radarRetrato.ts). Idempotente: rodar de novo no mesmo dia só atualiza a linha do dia.
 */
import { calcularRetrato } from "../src/lib/radarRetrato.js";

const PAGINA = 1000;
const TETO_LEADS_POR_EMPRESA = 50_000; // trava de segurança: nenhuma empresa estoura o tempo da função

/** Valor do lead (coluna numérica; aceita texto "R$ 1.234,56" por segurança). */
export function valorDoLead(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Linha do banco → o formato que a regra do Radar espera (timeIdle = dias desde a última atualização; nota padrão 50, como na tela). */
export function leadParaRadar(r: any, agora: number) {
  const ref = new Date(r.updated_at || r.created_at || agora).getTime();
  return {
    status: r.status,
    value: r.value,
    deleted_at: r.deleted_at,
    updated_at: r.updated_at,
    created_at: r.created_at,
    temperature: r.temperature,
    scoreIA: r.score_ia ?? 50,
    timeIdle: Math.max(0, Math.floor((agora - ref) / 86400000)),
  };
}

export interface ResumoRetratos {
  empresas: number;
  gravadas: number;
  erros: number;
}

export async function gravarRetratosRadar(db: any, agora: number = Date.now()): Promise<ResumoRetratos> {
  const { data: tenants, error } = await db.from("tenants").select("id");
  if (error) throw new Error(`tenants: ${error.message}`);
  // Mesma convenção de data da tela (dia em UTC), para tela e rotina escreverem a MESMA linha do dia.
  const hoje = new Date(agora).toISOString().slice(0, 10);
  let gravadas = 0;
  let erros = 0;

  for (const t of (tenants || []) as { id: string }[]) {
    try {
      const leads: any[] = [];
      for (let de = 0; de < TETO_LEADS_POR_EMPRESA; de += PAGINA) {
        const { data, error: e } = await db
          .from("leads")
          .select("id, status, value, deleted_at, updated_at, created_at, temperature, score_ia")
          .eq("tenant_id", t.id)
          .is("deleted_at", null)
          .order("id")
          .range(de, de + PAGINA - 1);
        if (e) throw new Error(e.message);
        leads.push(...(data || []));
        if (!data || data.length < PAGINA) break;
      }
      const retrato = calcularRetrato(leads.map((r) => leadParaRadar(r, agora)), valorDoLead, agora);
      const { error: eUp } = await db
        .from("lead_risk_snapshots")
        .upsert({ tenant_id: t.id, snapshot_date: hoje, ...retrato, updated_at: new Date(agora).toISOString() }, { onConflict: "tenant_id,snapshot_date" });
      if (eUp) throw new Error(eUp.message);
      gravadas++;
    } catch (err: any) {
      erros++;
      console.error(`[radar/retrato] empresa ${t.id}:`, err?.message);
    }
  }
  return { empresas: (tenants || []).length, gravadas, erros };
}
