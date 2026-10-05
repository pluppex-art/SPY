import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Activity, PhoneCall, Mail, MessageSquare, Calendar,
  CheckCircle2, Clock, Search, Filter, Plus, User
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Pagination } from "../../components/ui/Pagination";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { normalizeText } from "../../lib/utils";

const PAGE_SIZE = 50;

export default function Atividades() {
  const { leads } = useData();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");

  // Synthetic activity feed derived from lead notes, followups and meetings
  const activities = useMemo(() => {
    const list: any[] = [];
    (leads as any[]).forEach(lead => {
      if (lead.notes && Array.isArray(lead.notes)) {
        lead.notes.forEach((n: any) => {
          list.push({
            id: n.id || `${lead.id}-${n.date}`,
            leadName: lead.name,
            leadCompany: lead.company,
            type: n.type || "anotacao",
            content: n.text || n.content || "Anotação comercial",
            date: n.date || lead.created_at || new Date().toISOString(),
            user: n.author || lead.seller || "Comercial",
          });
        });
      } else {
        // Generates an initial activity entry per lead
        list.push({
          id: `lead-entry-${lead.id}`,
          leadName: lead.name,
          leadCompany: lead.company,
          type: lead.channel === "WhatsApp" ? "whatsapp" : "lead_criado",
          content: `Lead ingressou no funil via canal ${lead.channel || "Direto"}`,
          date: lead.created_at || new Date().toISOString(),
          user: lead.seller || "Equipe Comercial",
        });
      }
    });

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [leads]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return activities.filter(a => {
      const matchSearch =
        normalizeText(a.leadName).includes(q) ||
        normalizeText(a.leadCompany).includes(q) ||
        normalizeText(a.content).includes(q) ||
        normalizeText(a.user).includes(q);
      const matchType = typeFilter === "Todos" || a.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [activities, search, typeFilter]);

  // Renderizava TODAS as atividades de uma vez (uma por lead, no mínimo) —
  // pagina só a exibição (os dados já estão em memória).
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, typeFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const getIcon = (type: string) => {
    switch (type) {
      case "whatsapp": return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      case "ligacao": return <PhoneCall className="w-4 h-4 text-blue-500" />;
      case "email": return <Mail className="w-4 h-4 text-amber-500" />;
      case "reuniao": return <Calendar className="w-4 h-4 text-purple-500" />;
      default: return <Activity className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <PageContainer
      title="Atividades Comerciais"
      description="Linha do tempo consolidada de contatos, ligações, reuniões e histórico de interações."
      actions={
        <Button onClick={() => toast.info("Para registrar uma nova atividade, abra os detalhes do Lead no Pipeline ou na lista.")} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
          <Plus className="w-3.5 h-3.5" /> Registrar Atividade
        </Button>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: Activity, label: "Total de Interações", val: activities.length, color: "text-blue-500" },
          { icon: MessageSquare, label: "Mensagens WhatsApp", val: activities.filter(a => a.type === "whatsapp").length, color: "text-emerald-500" },
          { icon: Calendar, label: "Reuniões Agendadas", val: activities.filter(a => a.type === "reuniao").length, color: "text-purple-500" },
          { icon: CheckCircle2, label: "Leads Interagidos", val: new Set(activities.map(a => a.leadName)).size, color: "text-amber-500" },
        ].map((k, i) => (
          <Card key={i} className="p-4 bg-[var(--color-surface-elevated)]/40 border border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{k.label}</span>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <p className="text-xl font-black text-[var(--color-text-primary)]">{k.val}</p>
          </Card>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por lead, empresa, conteúdo ou usuário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl pl-10 pr-4 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-blue)]"
          />
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3">
        {pageItems.map(act => (
          <div
            key={act.id}
            className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] flex items-start gap-4 transition-all hover:border-[var(--color-primary-blue)]/40"
          >
            <div className="p-2.5 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] shrink-0">
              {getIcon(act.type)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">{act.leadName}</span>
                  {act.leadCompany && (
                    <span className="text-[10px] text-[var(--color-text-muted)]">({act.leadCompany})</span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">
                  {new Date(act.date).toLocaleDateString("pt-BR")} às {new Date(act.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{act.content}</p>

              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[var(--color-text-muted)]">
                <User className="w-3 h-3" />
                <span>Responsável: <strong className="text-[var(--color-text-primary)]">{act.user}</strong></span>
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-[var(--color-text-muted)]">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="font-bold">Nenhuma atividade registrada.</p>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="atividade" />
    </PageContainer>
  );
}
