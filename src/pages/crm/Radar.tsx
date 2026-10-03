import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radar as RadarIcon, Flame, Clock } from "lucide-react";
import { Card } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { PageContainer } from "../../components/PageContainer";
import { useData } from "../../contexts/DataContext";

// Status que significam "negócio encerrado" — não entram no radar. Cobre os rótulos usados nos pipelines.
const CLOSED = /(ganh|perd|fechad|won|lost|cancel|descart|arquiv)/i;
const DAY = 86400_000;

type Risk = "critico" | "alto" | "atencao";
const RISK_META: Record<Risk, { label: string; variant: "destructive" | "warning" | "info" }> = {
  critico: { label: "Crítico", variant: "destructive" }, alto: { label: "Alto", variant: "warning" }, atencao: { label: "Atenção", variant: "info" },
};

export default function Radar() {
  const { leads } = useData();
  const navigate = useNavigate();
  const [days, setDays] = useState(3);

  const rows = useMemo(() => {
    const now = Date.now();
    return (leads as any[])
      .filter((l) => !l.deleted_at && !CLOSED.test(String(l.status || "")))
      .map((l) => {
        const ref = l.last_contact_at || l.updated_at || l.created_at;
        const idle = ref ? Math.floor((now - new Date(ref).getTime()) / DAY) : 999;
        const risk: Risk = idle >= days * 4 ? "critico" : idle >= days * 2 ? "alto" : "atencao";
        return { l, idle, risk, never: !l.last_contact_at };
      })
      .filter((r) => r.idle >= days)
      .sort((a, b) => b.idle - a.idle);
  }, [leads, days]);

  const counts = useMemo(() => ({ critico: rows.filter((r) => r.risk === "critico").length, alto: rows.filter((r) => r.risk === "alto").length, atencao: rows.filter((r) => r.risk === "atencao").length }), [rows]);
  const visible = rows.slice(0, 200);

  return (
    <PageContainer title="Radar" subtitle="Negócios em aberto que esfriaram — retome antes de perder.">
      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        {(["critico", "alto", "atencao"] as Risk[]).map((k) => (
          <Card key={k} className="p-4 flex items-center justify-between">
            <div><div className="text-xs text-[var(--color-text-muted)]">{RISK_META[k].label}</div><div className="text-2xl font-black">{counts[k]}</div></div>
            {k === "critico" ? <Flame className="w-6 h-6 text-danger" /> : k === "alto" ? <Clock className="w-6 h-6 text-warning" /> : <RadarIcon className="w-6 h-6 text-info" />}
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <label className="text-sm flex items-center gap-2">Sem contato há pelo menos
          <select className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[1, 2, 3, 5, 7, 14, 30].map((d) => <option key={d} value={d}>{d} dia{d > 1 ? "s" : ""}</option>)}
          </select>
          <span className="text-xs text-[var(--color-text-muted)]">· {rows.length} lead(s){rows.length > visible.length ? ` (mostrando ${visible.length})` : ""}</span>
        </label>
        {visible.length === 0 ? <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Nenhum negócio esfriando. 🎯</p> : (
          <ul className="divide-y divide-[var(--color-border-default)]">
            {visible.map(({ l, idle, risk, never }) => (
              <li key={l.id} className="py-2 flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--color-surface-sunken)] px-2 rounded-lg" onClick={() => navigate(`/app/crm/pipeline?lead=${l.id}`)}>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{l.name || l.company || "Sem nome"}</div>
                  <div className="text-xs text-[var(--color-text-muted)] truncate">{[l.company, l.status, l.seller].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-[var(--color-text-muted)]">{never ? "nunca contatado · " : ""}{idle >= 999 ? "—" : `${idle}d`}</span>
                  <Badge variant={RISK_META[risk].variant}>{RISK_META[risk].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageContainer>
  );
}
