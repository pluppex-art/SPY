/**
 * O gestor de um ambiente novo (o admin criado junto com o tenant) também entra no RH da empresa dele
 * como colaborador "Administrador" — assim aparece em Equipe & Squads, recebe cargo/permissões e pode ter o
 * Agente Secreto. Idempotente: se esse login já tem colaborador no tenant, não cria outro.
 *
 * Isolamento: o gestor é só admin DA PRÓPRIA empresa (users.is_master = false, sem partner_id). A regra
 * has_tenant_access só libera o próprio tenant, master ou parceiro vinculado — então ele não enxerga os outros
 * clientes do SPY. Esta função não mexe nisso e nunca concede troca de empresa.
 */
type Db = any;

export async function ensureAdminColaborador(
  db: Db,
  a: { tenantId: string; userId: string; nome: string; email: string; phone?: string | null },
): Promise<boolean> {
  const { data: existing } = await db.from("colaboradores").select("id").eq("tenant_id", a.tenantId).eq("user_id", a.userId).maybeSingle();
  if (existing) return true;
  const hoje = new Date();
  const { error } = await db.from("colaboradores").insert({
    tenant_id: a.tenantId,
    user_id: a.userId,
    nome: String(a.nome || "").trim().slice(0, 255) || "Administrador",
    email: String(a.email || "").trim().toLowerCase(),
    phone: String(a.phone || "").trim(),
    cargo: "Administrador",
    cargos: ["Administrador"],
    departamento: "Gestão",
    status: "Ativo",
    data_admissao: hoje.toISOString().slice(0, 10),
    dataAdmissao: hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    desempenho: 100,
  });
  if (error) { console.error("[tenant] colaborador do gestor:", error.message); return false; }
  return true;
}
