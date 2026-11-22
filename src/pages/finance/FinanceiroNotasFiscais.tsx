import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Send, Download, Ban, KeyRound, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { formatBRL } from "../../lib/dinheiro";

const campo = "h-[38px] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const soDigitos = (s: string) => s.replace(/\D/g, "");

type Status = { configurado: boolean; ambiente?: "sandbox" | "producao"; empresa?: { nome?: string; cnpj_formatado?: string } | null; credencial?: { estado?: string }; onboarding?: { estado?: string }; aviso?: string };
type Nota = { origem: string; id: string; numero?: string | number; situacao: string; emitida_em?: string; tomador?: string; descricao?: string; valor?: number };
type Pedido = { id: string; estado: string; motivo?: string; numero?: string | number; nota?: { origem: string; id: string } };

const SITUACAO: Record<string, string> = { emitida: "Emitida", cancelada: "Cancelada", cancelando: "Cancelando…", emitindo: "Emitindo…", conferindo: "Conferindo…", nao_emitida: "Não emitida" };
const ESTADO_PEDIDO: Record<string, string> = { na_fila: "Na fila…", emitindo: "Emitindo…", confirmando: "Confirmando…", autorizada: "Nota autorizada", recusada: "Recusada pelo fisco", incerta: "Resultado incerto: confira no portal" };

async function lerJson(r: Response) { try { return await r.json(); } catch { return {}; } }

export default function FinanceiroNotasFiscais() {
  const { user } = useAuth();
  const admin = !!(user?.isMaster || user?.isTenantAdmin);
  const [status, setStatus] = useState<Status | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [chave, setChave] = useState("");
  const [cnpj, setCnpj] = useState(""); const [senha, setSenha] = useState("");
  const [f, setF] = useState({ documento: "", nome: "", valor: "", descricao: "" });
  const [ocupado, setOcupado] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<{ texto: string; bloqueios?: any[] } | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await apiFetch("/api/nfse/status");
      const s: Status = await lerJson(r);
      setStatus(s);
      if (s.configurado && s.onboarding?.estado === "pronto") {
        const rn = await apiFetch("/api/nfse/notas");
        if (rn.ok) setNotas((await lerJson(rn)).notas ?? []);
      }
    } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [carregar]);

  async function salvarChave() {
    setOcupado(true); setErro(null);
    try {
      const r = await apiFetch("/api/nfse/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: chave.trim() }) });
      const j = await lerJson(r);
      if (!r.ok) { setErro({ texto: j.error || "Não foi possível salvar a chave." }); return; }
      setChave(""); toast.success(`Chave salva (${j.ambiente === "sandbox" ? "ambiente de testes" : "produção"}).`); carregar();
    } finally { setOcupado(false); }
  }

  async function conectarEmpresa() {
    setOcupado(true); setErro(null);
    try {
      const r = await apiFetch("/api/nfse/credencial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cnpj: soDigitos(cnpj), senha }) });
      const j = await lerJson(r);
      setSenha(""); // a senha não fica na tela depois de enviada
      if (!r.ok) { setErro({ texto: j.error || "Não foi possível conectar a empresa." }); return; }
      toast.success("Verificando a empresa no Emissor Nacional…");
      acompanharCredencial(0);
    } finally { setOcupado(false); }
  }
  function acompanharCredencial(n: number) {
    timer.current = setTimeout(async () => {
      const r = await apiFetch("/api/nfse/credencial"); const j = await lerJson(r);
      const passo = j?.tentativa?.proximo_passo;
      if (r.ok && (passo === "aguardar" || passo === "configurando") && n < 40) return acompanharCredencial(n + 1);
      if (passo === "corrigir_senha") setErro({ texto: "O Emissor Nacional recusou a senha. Confira e tente de novo." });
      else if (passo === "redefinir_no_portal" || passo === "suporte") setErro({ texto: "O Emissor Nacional bloqueou o acesso. Redefina a senha no portal ou fale com o suporte da emissaoja." });
      else if (passo === "tentar_mais_tarde") setErro({ texto: "O portal está indisponível agora. Tente mais tarde." });
      carregar();
    }, n === 0 ? 2000 : 5000);
  }

  function acompanharPedido(id: string, n = 0) {
    timer.current = setTimeout(async () => {
      const r = await apiFetch(`/api/nfse/emissoes/${encodeURIComponent(id)}`); const j = await lerJson(r);
      const p: Pedido | undefined = j?.pedido;
      if (p) setPedido(p);
      if (r.ok && p && !["autorizada", "recusada", "incerta"].includes(p.estado) && n < 40) return acompanharPedido(id, n + 1);
      carregar();
    }, 2500);
  }

  async function emitir() {
    setOcupado(true); setErro(null); setPedido(null);
    try {
      const r = await apiFetch("/api/nfse/emitir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documento: soDigitos(f.documento), nome: f.nome, valor: Number(f.valor.replace(",", ".")), descricao: f.descricao }) });
      const j = await lerJson(r);
      if (!r.ok) { setErro({ texto: j.error || "Não foi possível emitir a nota.", bloqueios: j.bloqueios }); return; }
      setPedido(j.pedido); acompanharPedido(j.pedido.id);
    } finally { setOcupado(false); }
  }

  async function abrirArquivo(n: { origem: string; id: string }, formato: "pdf" | "xml") {
    const r = await apiFetch(`/api/nfse/notas/${n.origem}/${encodeURIComponent(n.id)}/${formato}`);
    if (!r.ok) { toast.error((await lerJson(r)).error || "Não foi possível baixar o arquivo."); return; }
    window.open(URL.createObjectURL(await r.blob()), "_blank");
  }

  async function cancelar(n: Nota, motivo: "1" | "2") {
    const ok = await confirmDialog({ title: "Cancelar esta nota fiscal?", message: `Nota ${n.numero ?? ""} de ${formatBRL(Number(n.valor) || 0)} (${motivo === "1" ? "erro na emissão" : "serviço não prestado"}). O cancelamento é um ato fiscal e não pode ser desfeito.`, confirmLabel: "Cancelar nota", variant: "danger" } as any);
    setCancelando(null);
    if (!ok) return;
    const r = await apiFetch(`/api/nfse/notas/${n.origem}/${encodeURIComponent(n.id)}/cancelar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) });
    const j = await lerJson(r);
    if (!r.ok) { toast.error(j.error || "Não foi possível cancelar."); return; }
    toast.success("Cancelamento enviado."); carregar();
  }

  if (carregando && !status) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando…</div>;
  const pronto = status?.configurado && status.onboarding?.estado === "pronto";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)] flex items-center gap-2"><FileText className="w-5 h-5" /> Notas fiscais (NFS-e)</h2>
        <p className="text-sm text-[var(--color-text-muted)]">Emissão de nota fiscal de serviço pelo Emissor Nacional, sem certificado digital.
          {status?.ambiente === "sandbox" && <b className="text-[var(--color-warning)]"> Ambiente de testes: as notas não valem perante o fisco.</b>}</p>
      </div>

      {erro && (
        <Card className="p-4 text-sm text-[var(--color-danger)]">
          {erro.texto}
          {erro.bloqueios?.map((b: any, i: number) => <div key={i} className="mt-1 text-xs">• {b.mensagem}{b.acao ? ` — ${b.acao}` : ""}</div>)}
        </Card>
      )}

      {!status?.configurado && (
        <Card className="p-4">
          <div className="font-bold text-sm flex items-center gap-2 mb-1"><KeyRound className="w-4 h-4" /> 1. Chave da emissaoja</div>
          {admin ? (<>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">Crie a conta em emissaoja.com.br (Conta → API) e cole a chave. Comece pela chave de testes (ej_test_…). Ela fica guardada só no servidor.</p>
            <div className="flex flex-wrap gap-2">
              <input className={`${campo} flex-1 min-w-[260px]`} type="password" autoComplete="off" placeholder="ej_test_…" value={chave} onChange={(e) => setChave(e.target.value)} />
              <Button onClick={salvarChave} disabled={ocupado || !chave.trim()}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Salvar chave</Button>
            </div></>
          ) : <p className="text-xs text-[var(--color-text-muted)]">Peça a um administrador da empresa para configurar a chave da emissaoja.</p>}
        </Card>
      )}

      {status?.configurado && !pronto && (
        <Card className="p-4">
          <div className="font-bold text-sm flex items-center gap-2 mb-1"><Building2 className="w-4 h-4" /> 2. Conectar a empresa ao Emissor Nacional</div>
          {status.aviso && <p className="text-xs text-[var(--color-danger)] mb-2">{status.aviso}</p>}
          {status.empresa ? (
            <p className="text-xs text-[var(--color-text-muted)]">Empresa {status.empresa.nome} ({status.empresa.cnpj_formatado}): {status.onboarding?.estado === "perguntas" ? "faltam dados fiscais (alíquota do Simples). Complete no app da emissaoja." : "configurando… volte em instantes."}</p>
          ) : admin ? (<>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">Informe o CNPJ e a senha do portal do Emissor Nacional. A senha vai direto para a emissaoja: o SPY não a guarda.</p>
            <div className="flex flex-wrap items-end gap-2">
              <input className={`${campo} w-[180px]`} inputMode="numeric" placeholder="CNPJ da empresa" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
              <input className={`${campo} w-[220px]`} type="password" autoComplete="new-password" placeholder="Senha do portal" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <Button onClick={conectarEmpresa} disabled={ocupado || soDigitos(cnpj).length !== 14 || !senha}>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Conectar</Button>
            </div></>
          ) : <p className="text-xs text-[var(--color-text-muted)]">Peça a um administrador para conectar a empresa.</p>}
        </Card>
      )}

      {pronto && (
        <Card className="p-4">
          <div className="font-bold text-sm mb-3">Emitir nota</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)]">CPF ou CNPJ do cliente
              <input className={`${campo} w-[190px]`} inputMode="numeric" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)]">Nome (obrigatório para CPF)
              <input className={`${campo} w-[220px]`} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)]">Valor (R$)
              <input className={`${campo} w-[130px]`} inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></label>
            <label className="flex flex-col gap-1 text-xs font-bold text-[var(--color-text-muted)] flex-1 min-w-[220px]">Descrição do serviço
              <input className={campo} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
            <Button onClick={emitir} disabled={ocupado || (!!pedido && !["autorizada", "recusada", "incerta"].includes(pedido.estado))}>
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Emitir nota</Button>
          </div>
          {pedido && (
            <div className="mt-3 text-sm flex flex-wrap items-center gap-3">
              <b>{ESTADO_PEDIDO[pedido.estado] ?? pedido.estado}</b>{pedido.numero ? <span>nº {pedido.numero}</span> : null}{pedido.motivo ? <span className="text-[var(--color-text-muted)]">{pedido.motivo}</span> : null}
              {pedido.estado === "autorizada" && pedido.nota && <Button size="sm" variant="outline" onClick={() => abrirArquivo(pedido.nota!, "pdf")}><Download className="w-4 h-4" /> PDF</Button>}
            </div>
          )}
        </Card>
      )}

      {pronto && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-bold">Notas emitidas (últimos 12 meses)</div>
          {!notas.length && <p className="text-sm text-[var(--color-text-muted)]">Nenhuma nota ainda.</p>}
          {notas.map((n) => (
            <Card key={`${n.origem}-${n.id}`} className="p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0 flex-1 basis-[240px]">
                <div className="text-sm font-bold truncate">{n.tomador || "Cliente"} · {formatBRL(Number(n.valor) || 0)}</div>
                <div className="text-xs text-[var(--color-text-muted)]">Nota {n.numero ?? "—"} · {SITUACAO[n.situacao] ?? n.situacao}{n.emitida_em ? ` · ${new Date(n.emitida_em).toLocaleDateString("pt-BR")}` : ""}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => abrirArquivo(n, "pdf")}><Download className="w-4 h-4" /> PDF</Button>
                <Button size="sm" variant="outline" onClick={() => abrirArquivo(n, "xml")}>XML</Button>
                {admin && n.situacao === "emitida" && (cancelando === n.id ? (<>
                  <Button size="sm" variant="outline" onClick={() => cancelar(n, "1")}>Erro na emissão</Button>
                  <Button size="sm" variant="outline" onClick={() => cancelar(n, "2")}>Serviço não prestado</Button>
                </>) : <Button size="sm" variant="outline" onClick={() => setCancelando(n.id)}><Ban className="w-4 h-4" /> Cancelar</Button>)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
