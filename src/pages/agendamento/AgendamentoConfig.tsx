import { createContext, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { HelpTip } from "../../components/ui/help-tip";
import { EmptyState } from "../../components/ui/empty-state";
import { Spinner } from "../../components/ui/spinner";
import { useAuth } from "../../contexts/AuthContext";
import { chamar, definirTenantAtivo, DIAS_SEMANA, dataBR, type ConfigLinha } from "../../lib/agendamento/cliente";
import { campo, rotulo } from "./components/Estilos";

const PERMISSOES: { id: keyof ConfigLinha["permissoes_equipe"]; titulo: string; ajuda: string }[] = [
  { id: "criar", titulo: "Criar reservas", ajuda: "Atendentes podem lançar novas reservas na agenda." },
  { id: "editar", titulo: "Editar e marcar presença", ajuda: "Mudar pessoas, observações, escolher pistas e marcar chegada/falta." },
  { id: "receber", titulo: "Receber pagamentos", ajuda: "Registrar o pagamento no balcão (dinheiro, Pix, cartão, comanda)." },
  { id: "cancelar", titulo: "Cancelar reservas", ajuda: "Cancelar exige motivo e fica registrado no histórico." },
  { id: "sem_contato", titulo: "Reservar sem telefone/e-mail", ajuda: "Por padrão toda reserva precisa de um contato do cliente." },
];

const ABAS = [{ id: "geral", nome: "Página e eventos" }, { id: "precos", nome: "Preços e horários" }, { id: "pagamento", nome: "Pagamento e mesas" }, { id: "equipe", nome: "Equipe" }] as const;
type AbaId = (typeof ABAS)[number]["id"];
const AbaCtx = createContext<AbaId>("geral");
const Secao = ({ aba, titulo, ajuda, children }: { aba: AbaId; titulo: string; ajuda?: string; children: React.ReactNode }) => useContext(AbaCtx) !== aba ? null : (
  <Card className="p-5 space-y-4"><div className="flex items-center gap-1.5"><h3 className="text-sm font-black text-[var(--color-text-primary)]">{titulo}</h3>{ajuda && <HelpTip label={titulo}>{ajuda}</HelpTip>}</div>{children}</Card>
);
const Campo = ({ t, children, className }: { t: string; children: React.ReactNode; className?: string }) => (<div className={`space-y-1.5 ${className ?? ""}`}><label className={rotulo}>{t}</label>{children}</div>);

/** Configuração do Agendamento: o que é reservado, preços, horários, pagamento online, mesas e permissões da equipe. */
export default function AgendamentoConfig() {
  const { activeTenantId } = useAuth();
  definirTenantAtivo(activeTenantId);
  const [c, setC] = useState<ConfigLinha | null>(null);
  const [orig, setOrig] = useState("");
  const [admin, setAdmin] = useState(true);
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<AbaId>("geral");
  const [novoTipo, setNovoTipo] = useState(""); const [novaData, setNovaData] = useState("");

  const carregar = async () => {
    try { const j = await chamar<{ config: ConfigLinha; admin: boolean; linkPublico: string | null }>("GET", "/api/agendamento/config"); setC(j.config); setOrig(JSON.stringify(j.config)); setAdmin(j.admin); setLink(j.linkPublico); }
    catch (e: any) { setErro(e?.message || "Falha ao carregar"); }
  };
  useEffect(() => { carregar(); }, [activeTenantId]);

  if (erro) return <PageContainer title="Configurações do Agendamento"><EmptyState title="Não foi possível abrir" description={erro} /></PageContainer>;
  if (!c) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!admin) return <PageContainer title="Configurações do Agendamento"><EmptyState title="Só para administradores" description="Peça ao administrador da empresa para ajustar estas configurações." /></PageContainer>;

  const set = <K extends keyof ConfigLinha>(k: K, v: ConfigLinha[K]) => setC((x) => (x ? { ...x, [k]: v } : x));
  const sujo = JSON.stringify(c) !== orig;
  const num = (v: string, min = 0) => (v === "" ? min : Math.max(min, Number(v.replace(",", ".")) || 0));

  const salvar = async () => {
    setSalvando(true);
    try {
      const j = await chamar<{ config: ConfigLinha }>("PUT", "/api/agendamento/config", {
        ativo: c.ativo, slug: c.slug ?? undefined, nomeEstabelecimento: c.nome_estabelecimento ?? "", endereco: c.endereco ?? "", telefone: c.telefone ?? "", whatsapp: c.whatsapp ?? "", logoUrl: c.logo_url ?? "",
        recursoSingular: c.recurso_singular, recursoPlural: c.recurso_plural, qtdRecursos: c.qtd_recursos, pessoasPorRecurso: c.pessoas_por_recurso, precoDiaUtil: c.preco_dia_util, precoFimSemana: c.preco_fim_semana,
        diasFimSemana: c.dias_fim_semana, horarios: c.horarios, datasBloqueadas: c.datas_bloqueadas, tiposEvento: c.tipos_evento, expiracaoPendenteMin: c.expiracao_pendente_min, pagamentoOnline: c.pagamento_online,
        mesasAtivo: c.mesas_ativo, mesasMaxPorDia: c.mesas_max_por_dia, cadeirasMax: c.cadeiras_max, permissoesEquipe: c.permissoes_equipe,
      });
      setC(j.config); setOrig(JSON.stringify(j.config)); toast.success("Configurações salvas.");
      carregar();
    } catch (e: any) { toast.error(e?.message || "Não foi possível salvar."); }
    setSalvando(false);
  };

  return (
    <PageContainer title="Configurações do Agendamento" subtitle="Defina o que os clientes podem reservar, quanto custa, quando abre e como o pagamento funciona."
      breadcrumb={[{ label: "Agendamento", path: "/app/agendamento" }, { label: "Configurações" }]}
      actions={<div className="flex gap-2"><Link to="/app/agendamento"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1.5" />Voltar à agenda</Button></Link><Button size="sm" disabled={!sujo || salvando} onClick={salvar}>{salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar alterações</Button></div>}>
      <AbaCtx.Provider value={aba}>
      <div className="flex gap-1 mb-4 overflow-x-auto border-b border-[var(--color-border-default)]">
        {ABAS.map((x) => <button key={x.id} onClick={() => setAba(x.id)} className={`px-4 h-10 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${aba === x.id ? "border-[var(--color-primary)] text-[var(--color-primary)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>{x.nome}</button>)}
      </div>
      <div className="space-y-4 max-w-4xl pb-20">
        <Secao aba="geral" titulo="Página pública" ajuda="É o endereço que você divulga para o cliente reservar sozinho, só com nome e WhatsApp. Se desligar, a página sai do ar mas a agenda interna continua funcionando.">
          <label className="flex items-center justify-between text-sm font-semibold">Aceitar reservas pela página pública<Switch checked={c.ativo} onCheckedChange={(v) => set("ativo", v)} /></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo t="Nome do estabelecimento"><Input value={c.nome_estabelecimento ?? ""} onChange={(e) => set("nome_estabelecimento", e.target.value)} maxLength={120} /></Campo>
            <Campo t="Endereço da página (letras, números e hífen)"><Input value={c.slug ?? ""} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} maxLength={61} /></Campo>
            <Campo t="Endereço do local"><Input value={c.endereco ?? ""} onChange={(e) => set("endereco", e.target.value)} maxLength={240} /></Campo>
            <Campo t="WhatsApp do local"><Input value={c.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} maxLength={40} /></Campo>
            <Campo t="Telefone"><Input value={c.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} maxLength={40} /></Campo>
            <Campo t="Logo (endereço https)"><Input value={c.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} maxLength={500} /></Campo>
          </div>
          {link && <div className="flex items-center gap-2 text-sm"><code className="px-2 py-1 rounded bg-[var(--color-surface-hover)] break-all">{link}</code><Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."))}><Copy className="w-4 h-4" /></Button></div>}
          {sujo && c.slug !== JSON.parse(orig).slug && <p className="text-xs text-amber-600">Ao mudar o endereço, o link antigo deixa de funcionar.</p>}
        </Secao>

        <Secao aba="precos" titulo="O que é reservado e preços" ajuda="Pense em “Pista” como a unidade que o cliente reserva (pista, quadra, sala, mesa…). Os nomes aparecem para o cliente. O preço é por unidade, por hora.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Campo t="Nome (singular)"><Input value={c.recurso_singular} onChange={(e) => set("recurso_singular", e.target.value)} maxLength={30} /></Campo>
            <Campo t="Nome (plural)"><Input value={c.recurso_plural} onChange={(e) => set("recurso_plural", e.target.value)} maxLength={30} /></Campo>
            <Campo t="Quantidade disponível"><input type="number" min={1} max={200} value={c.qtd_recursos} onChange={(e) => set("qtd_recursos", num(e.target.value, 1))} className={campo} /></Campo>
            <Campo t="Pessoas por unidade"><input type="number" min={1} max={200} value={c.pessoas_por_recurso} onChange={(e) => set("pessoas_por_recurso", num(e.target.value, 1))} className={campo} /></Campo>
            <Campo t="Preço dia útil (R$/h)"><input inputMode="decimal" value={c.preco_dia_util} onChange={(e) => set("preco_dia_util", num(e.target.value))} className={campo} /></Campo>
            <Campo t="Preço fim de semana (R$/h)"><input inputMode="decimal" value={c.preco_fim_semana} onChange={(e) => set("preco_fim_semana", num(e.target.value))} className={campo} /></Campo>
          </div>
          <div><p className={rotulo + " mb-1.5"}>Dias com preço de fim de semana</p><div className="flex flex-wrap gap-1.5">
            {DIAS_SEMANA.map((d, i) => { const on = c.dias_fim_semana.includes(i); return <button key={d} type="button" onClick={() => set("dias_fim_semana", on ? c.dias_fim_semana.filter((x) => x !== i) : [...c.dias_fim_semana, i].sort())} className={`px-3 h-8 rounded-lg text-xs font-bold border ${on ? "bg-[var(--color-primary)] text-white border-transparent" : "border-[var(--color-border-default)]"}`}>{d.slice(0, 3)}</button>; })}
          </div></div>
        </Secao>

        <Secao aba="precos" titulo="Horário de funcionamento" ajuda="Use horas cheias. Fechar às 00 é meia-noite; se o fechamento for menor que a abertura (ex.: abre 18, fecha 2), vale até de madrugada.">
          <div className="space-y-2">
            {c.horarios.map((h, i) => (
              <div key={i} className="flex items-center gap-3 flex-wrap">
                <span className="w-20 text-sm font-semibold">{DIAS_SEMANA[i]}</span>
                <Switch checked={h.aberto} onCheckedChange={(v) => set("horarios", c.horarios.map((x, j) => (j === i ? { ...x, aberto: v } : x)))} />
                {h.aberto ? <>
                  <input type="number" min={0} max={23} value={h.inicio} onChange={(e) => set("horarios", c.horarios.map((x, j) => (j === i ? { ...x, inicio: Math.min(23, num(e.target.value)) } : x)))} className={campo + " !w-20"} aria-label={`Abre ${DIAS_SEMANA[i]}`} />
                  <span className="text-xs text-[var(--color-text-muted)]">às</span>
                  <input type="number" min={0} max={23} value={h.fim} onChange={(e) => set("horarios", c.horarios.map((x, j) => (j === i ? { ...x, fim: Math.min(23, num(e.target.value)) } : x)))} className={campo + " !w-20"} aria-label={`Fecha ${DIAS_SEMANA[i]}`} />
                  <span className="text-xs text-[var(--color-text-muted)]">horas</span></> : <span className="text-xs text-[var(--color-text-muted)]">Fechado</span>}
              </div>
            ))}
          </div>
          <div><p className={rotulo + " mb-1.5"}>Datas fechadas (feriados, eventos privados)</p>
            <div className="flex flex-wrap gap-1.5 mb-2">{c.datas_bloqueadas.map((d) => <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--color-surface-hover)] text-xs font-semibold">{dataBR(d)}<button onClick={() => set("datas_bloqueadas", c.datas_bloqueadas.filter((x) => x !== d))} aria-label="Remover"><X className="w-3 h-3" /></button></span>)}{c.datas_bloqueadas.length === 0 && <span className="text-xs text-[var(--color-text-muted)]">Nenhuma</span>}</div>
            <div className="flex gap-2"><input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className={campo + " !w-44"} /><Button variant="outline" size="sm" disabled={!novaData} onClick={() => { set("datas_bloqueadas", Array.from(new Set([...c.datas_bloqueadas, novaData])).sort()); setNovaData(""); }}><Plus className="w-4 h-4 mr-1" />Fechar data</Button></div>
          </div>
        </Secao>

        <Secao aba="geral" titulo="Tipos de evento" ajuda="Opções que aparecem para o cliente ao reservar (ex.: Aniversário, Confraternização).">
          <div className="flex flex-wrap gap-1.5">{c.tipos_evento.map((t) => <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-surface-hover)] text-xs font-semibold">{t}{c.tipos_evento.length > 1 && <button onClick={() => set("tipos_evento", c.tipos_evento.filter((x) => x !== t))} aria-label={`Remover ${t}`}><X className="w-3 h-3" /></button>}</span>)}</div>
          <div className="flex gap-2"><Input value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)} placeholder="Novo tipo" maxLength={40} className="max-w-xs" /><Button variant="outline" size="sm" disabled={!novoTipo.trim() || c.tipos_evento.length >= 20} onClick={() => { set("tipos_evento", Array.from(new Set([...c.tipos_evento, novoTipo.trim()]))); setNovoTipo(""); }}><Plus className="w-4 h-4 mr-1" />Adicionar</Button></div>
        </Secao>

        <Secao aba="pagamento" titulo="Pagamento" ajuda="Com o pagamento online ligado, o cliente paga pelo Mercado Pago ao reservar e a reserva é confirmada sozinha. Se ele não pagar no prazo, a vaga é liberada. Se pagar atrasado e a vaga já foi ocupada, o valor é devolvido automaticamente. Precisa do Mercado Pago conectado em Configurações → Integrações.">
          <label className="flex items-center justify-between text-sm font-semibold">Cobrar online pelo Mercado Pago<Switch checked={c.pagamento_online} onCheckedChange={(v) => set("pagamento_online", v)} /></label>
          <Campo t="Prazo para pagar (minutos)" className="max-w-xs"><input type="number" min={5} max={240} value={c.expiracao_pendente_min} onChange={(e) => set("expiracao_pendente_min", num(e.target.value, 5))} className={campo} /></Campo>
        </Secao>

        <Secao aba="pagamento" titulo="Mesas do restaurante" ajuda="Permite que o cliente peça também uma mesa junto com a reserva, respeitando o limite por dia.">
          <label className="flex items-center justify-between text-sm font-semibold">Oferecer reserva de mesa<Switch checked={c.mesas_ativo} onCheckedChange={(v) => set("mesas_ativo", v)} /></label>
          {c.mesas_ativo && <div className="grid grid-cols-2 gap-3 max-w-md"><Campo t="Mesas por dia"><input type="number" min={0} value={c.mesas_max_por_dia} onChange={(e) => set("mesas_max_por_dia", num(e.target.value))} className={campo} /></Campo><Campo t="Lugares por mesa (máx.)"><input type="number" min={1} max={36} value={c.cadeiras_max} onChange={(e) => set("cadeiras_max", Math.min(36, num(e.target.value, 1)))} className={campo} /></Campo></div>}
        </Secao>

        <Secao aba="equipe" titulo="O que a equipe pode fazer" ajuda="Vale para quem não é administrador. Administradores podem tudo, inclusive cortesia e alterar valores.">
          <div className="space-y-3">{PERMISSOES.map((p) => <label key={p.id} className="flex items-center justify-between gap-4 text-sm"><span><b>{p.titulo}</b><span className="block text-xs text-[var(--color-text-muted)]">{p.ajuda}</span></span><Switch checked={c.permissoes_equipe[p.id]} onCheckedChange={(v) => set("permissoes_equipe", { ...c.permissoes_equipe, [p.id]: v })} /></label>)}</div>
        </Secao>
      </div>
      </AbaCtx.Provider>
      {sujo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface)] shadow-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Você tem alterações não salvas</span>
          <Button variant="ghost" size="sm" onClick={() => setC(JSON.parse(orig))}>Descartar</Button>
          <Button size="sm" disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button>
        </div>
      )}
    </PageContainer>
  );
}
