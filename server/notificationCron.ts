import { emailNotifyTenant } from "./emailNotify.js";

const MIN = 60_000;
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtMoney = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface ReminderSummary {
  tarefasProximas: number;
  tarefasVencidas: number;
  reunioesProximas: number;
  reunioesNovas: number;
  pagamentos: number;
}

/**
 * Lembretes por horário. Roda de tempos em tempos (a cada ~5 min) e manda os e-mails de:
 *  - tarefa chegando ao prazo (próximos 30 min) e tarefa vencida (últimas 48 h);
 *  - reunião/ligação começando (próximos 30 min) e reunião nova na agenda (criada na última hora);
 *  - pagamento de proposta confirmado (última hora, só administradores).
 * A janela é larga de propósito e a notification_email_log impede repetir: se uma rodada falhar,
 * a seguinte recupera. Cada tipo respeita a preferência "E-mail" de cada usuário.
 */
export async function runNotificationReminders(db: any, baseUrl: string): Promise<ReminderSummary> {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const out: ReminderSummary = { tarefasProximas: 0, tarefasVencidas: 0, reunioesProximas: 0, reunioesNovas: 0, pagamentos: 0 };

  const leadInfo = async (ids: (string | null)[]) => {
    const list = [...new Set(ids.filter(Boolean) as string[])];
    if (!list.length) return new Map<string, any>();
    const { data } = await db.from("leads").select("id, name, company, phone").in("id", list);
    return new Map<string, any>((data || []).map((l: any) => [l.id, l]));
  };

  // ── Tarefas ──
  const taskCols = "id, tenant_id, lead_id, assigned_to, title, due_date";
  const [{ data: soon }, { data: late }] = await Promise.all([
    db.from("tasks").select(taskCols).is("deleted_at", null).is("completed_at", null).neq("status", "Done")
      .not("assigned_to", "is", null).gte("due_date", iso(now)).lte("due_date", iso(now + 30 * MIN)).limit(200),
    db.from("tasks").select(taskCols).is("deleted_at", null).is("completed_at", null).neq("status", "Done")
      .not("assigned_to", "is", null).lt("due_date", iso(now - 10 * MIN)).gte("due_date", iso(now - 48 * 60 * MIN)).limit(200),
  ]);
  const leads = await leadInfo([...(soon || []), ...(late || [])].map((t: any) => t.lead_id));

  const taskNotice = async (t: any, kind: "proxima" | "vencida") => {
    const lead = t.lead_id ? leads.get(t.lead_id) : null;
    const key = kind === "proxima" ? "tarefa_proxima" : "tarefa_vencida";
    const r = await emailNotifyTenant(db, t.tenant_id, baseUrl, {
      triggerId: key,
      title: kind === "proxima" ? "Tarefa vence em breve" : "Tarefa vencida",
      description: t.title,
      kind: kind === "proxima" ? "warning" : "error",
      linkPath: "/app/tarefas",
      userIds: [t.assigned_to],
      details: [
        { label: "Tarefa", value: t.title },
        { label: "Prazo", value: fmtWhen(t.due_date) },
        ...(lead?.name ? [{ label: "Lead", value: lead.company ? `${lead.name} · ${lead.company}` : lead.name }] : []),
      ],
      phone: lead?.phone,
      dedupeKey: `${key}:${t.id}`,
    });
    return r.sent;
  };
  for (const t of soon || []) out.tarefasProximas += await taskNotice(t, "proxima");
  for (const t of late || []) out.tarefasVencidas += await taskNotice(t, "vencida");

  // ── Reuniões / ligações agendadas ──
  const meetCols = 'id, tenant_id, "leadName", "companyName", "closerEmail", "scheduledAt", "meetLink", status, "createdAt"';
  const [{ data: nextMeetings }, { data: newMeetings }] = await Promise.all([
    db.from("reunioes").select(meetCols).not("closerEmail", "is", null).not("status", "ilike", "%cancel%")
      .gte("scheduledAt", iso(now)).lte("scheduledAt", iso(now + 30 * MIN)).limit(200),
    db.from("reunioes").select(meetCols).not("closerEmail", "is", null).not("status", "ilike", "%cancel%")
      .gte("createdAt", iso(now - 60 * MIN)).gt("scheduledAt", iso(now + 30 * MIN)).limit(200),
  ]);
  const meetingNotice = async (m: any, copyKey: "reuniao_proxima" | "reuniao_confirmada") => {
    const who = [m.leadName, m.companyName].filter(Boolean).join(" · ") || "Compromisso";
    const r = await emailNotifyTenant(db, m.tenant_id, baseUrl, {
      triggerId: copyKey === "reuniao_proxima" ? "tarefa_proxima" : "reuniao_confirmada",
      copyKey,
      title: copyKey === "reuniao_proxima" ? "Reunião começando" : "Reunião agendada",
      description: `${who} — ${fmtWhen(m.scheduledAt)}`,
      kind: "info",
      linkPath: "/app/agenda",
      emails: [m.closerEmail],
      details: [{ label: "Compromisso", value: who }, { label: "Quando", value: fmtWhen(m.scheduledAt) }],
      externalButton: m.meetLink ? { label: "Entrar na reunião", url: m.meetLink } : undefined,
      dedupeKey: `${copyKey}:${m.id}`,
    });
    return r.sent;
  };
  for (const m of nextMeetings || []) out.reunioesProximas += await meetingNotice(m, "reuniao_proxima");
  for (const m of newMeetings || []) out.reunioesNovas += await meetingNotice(m, "reuniao_confirmada");

  // ── Pagamento de proposta confirmado (financeiro: só administradores) ──
  const { data: paid } = await db.from("finance_entries")
    .select("id, tenant_id, description, value, counterparty")
    .eq("status", "Pago").not("proposal_id", "is", null).gte("updated_at", iso(now - 60 * MIN)).limit(100);
  for (const p of paid || []) {
    const r = await emailNotifyTenant(db, p.tenant_id, baseUrl, {
      triggerId: "pagamento_recebido",
      title: "Pagamento recebido",
      description: `${p.description || "Pagamento"} — ${fmtMoney(p.value)}`,
      kind: "success",
      linkPath: "/app/financeiro",
      adminsOnly: true,
      details: [
        { label: "Descrição", value: p.description || "Pagamento" },
        { label: "Valor", value: fmtMoney(p.value) },
        ...(p.counterparty ? [{ label: "Cliente", value: p.counterparty }] : []),
      ],
      dedupeKey: `pagamento_recebido:${p.id}`,
    });
    out.pagamentos += r.sent;
  }

  return out;
}
