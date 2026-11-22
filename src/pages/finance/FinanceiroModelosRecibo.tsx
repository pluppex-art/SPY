import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Plus, Star, Trash2, Save, Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { esquecerListaDeModelos } from "./BotaoFaturaPdf";

type Mostrar = { emitente: boolean; documentoCliente: boolean; detalhes: boolean; formaPagamento: boolean; assinatura: boolean; pix: boolean; pixNoRecibo: boolean; logoEmpresa: boolean };
type Modelo = { id: string; nome: string; cor: string; logo: string; tituloRecibo: string; tituloFatura: string; abertura: string; observacoes: string; mostrar: Mostrar };

const campo = "h-[38px] w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const area = "w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]";
const VARIAVEIS = ["cliente", "cliente_documento", "valor", "valor_extenso", "descricao", "data_pagamento", "vencimento", "forma_pagamento", "emitente", "emitente_documento", "numero", "hoje"];
const EXEMPLO = "Recebi de {{cliente}} a importância de {{valor}} ({{valor_extenso}}), referente a {{descricao}}. Para maior clareza, firmo o presente.";
const OPCOES: [keyof Mostrar, string][] = [["emitente", "Dados da empresa (emitente)"], ["documentoCliente", "CPF/CNPJ do cliente"], ["detalhes", "Tabela de descrição e valor"], ["formaPagamento", "Forma de pagamento"], ["assinatura", "Linha de assinatura"], ["pix", "QR de Pix na fatura em aberto (com o valor)"], ["pixNoRecibo", "QR de Pix da empresa também no recibo (sem valor, para novos pagamentos)"], ["logoEmpresa", "Usar a logo de Dados da Empresa (quando o modelo não tem logo própria)"]];

const novoId = () => `m${Date.now().toString(36)}`;
async function lerJson(r: Response) { try { return await r.json(); } catch { return {}; } }

export default function FinanceiroModelosRecibo() {
  const { user } = useAuth();
  const admin = !!(user?.isMaster || user?.isTenantAdmin);
  const [padrao, setPadrao] = useState<Modelo | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [principalId, setPrincipalId] = useState("padrao");
  const [selId, setSelId] = useState("padrao");
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState<"recibo" | "fatura">("recibo");
  const [previa, setPrevia] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [pix, setPix] = useState({ chave: "", nome: "", cidade: "" });
  const [pixSalvo, setPixSalvo] = useState(false);
  const [mpConectado, setMpConectado] = useState(false);
  const [salvandoPix, setSalvandoPix] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await apiFetch("/api/financeiro/modelos-recibo"); const j = await lerJson(r);
      if (r.ok) { setPadrao(j.padrao); setModelos(j.modelos ?? []); setPrincipalId(j.principalId ?? "padrao"); }
      const rp = await apiFetch("/api/financeiro/pix-recebimento"); const jp = await lerJson(rp);
      if (rp.ok) setMpConectado(!!jp.mercadoPago);
      if (rp.ok && jp.pix) { setPix({ chave: jp.pix.chave ?? "", nome: jp.pix.nome ?? "", cidade: jp.pix.cidade ?? "" }); setPixSalvo(true); }
    })();
  }, []);

  const atual: Modelo | null = selId === "padrao" ? padrao : modelos.find((m) => m.id === selId) ?? null;
  const editavel = admin && selId !== "padrao";

  // Pré-visualização: o servidor gera o PDF do modelo na tela (com dados de exemplo), com um pequeno atraso ao digitar.
  const atualizarPrevia = useCallback((m: Modelo | null, t: string) => {
    if (!m) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await apiFetch("/api/financeiro/modelos-recibo/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelo: m, tipo: t }) });
      if (!r.ok) return;
      const url = URL.createObjectURL(await r.blob());
      setPrevia((antiga) => { if (antiga) URL.revokeObjectURL(antiga); return url; });
    }, 500);
  }, []);
  useEffect(() => { atualizarPrevia(atual, tipo); }, [atual, tipo, atualizarPrevia]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const mudar = (parte: Partial<Modelo>) => { setModelos((l) => l.map((m) => (m.id === selId ? { ...m, ...parte } : m))); setSujo(true); };

  function novo(base?: Modelo | null) {
    const b = base ?? padrao!;
    const m: Modelo = { ...b, id: novoId(), nome: base ? `${base.nome} (cópia)` : "Novo modelo", mostrar: { ...b.mostrar } };
    setModelos((l) => [...l, m]); setSelId(m.id); setSujo(true);
  }
  function excluir() {
    if (!editavel) return;
    setModelos((l) => l.filter((m) => m.id !== selId));
    if (principalId === selId) setPrincipalId("padrao");
    setSelId("padrao"); setSujo(true);
  }
  function escolherLogo(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { toast.error("Use uma imagem PNG ou JPEG."); return; }
    if (file.size > 180_000) { toast.error("A imagem é grande demais (máximo 180 KB)."); return; }
    const leitor = new FileReader();
    leitor.onload = () => mudar({ logo: String(leitor.result) });
    leitor.readAsDataURL(file);
  }
  function inserirVariavel(v: string) {
    const el = areaRef.current; if (!el || !atual) return;
    const ini = el.selectionStart ?? atual.abertura.length, fim = el.selectionEnd ?? ini;
    mudar({ abertura: `${atual.abertura.slice(0, ini)}{{${v}}}${atual.abertura.slice(fim)}` });
  }

  async function salvar(novoPrincipal = principalId) {
    setSalvando(true);
    try {
      const r = await apiFetch("/api/financeiro/modelos-recibo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelos, principalId: novoPrincipal }) });
      const j = await lerJson(r);
      if (!r.ok) { toast.error(j.error || "Não foi possível salvar."); return; }
      setModelos(j.modelos); setPrincipalId(j.principalId); setSujo(false); esquecerListaDeModelos(); toast.success("Modelos salvos.");
    } finally { setSalvando(false); }
  }
  async function salvarPix() {
    setSalvandoPix(true);
    try {
      const r = await apiFetch("/api/financeiro/pix-recebimento", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pix) });
      const j = await lerJson(r);
      if (!r.ok) { toast.error(j.error || "Não foi possível salvar a chave Pix."); return; }
      setPixSalvo(!!j.pix); if (j.pix) setPix({ chave: j.pix.chave, nome: j.pix.nome, cidade: j.pix.cidade });
      toast.success(j.pix ? "Chave Pix salva." : "Chave Pix removida."); atualizarPrevia(atual, tipo);
    } finally { setSalvandoPix(false); }
  }
  async function tornarPrincipal() { setPrincipalId(selId); await salvar(selId); }

  if (!padrao) return <div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando…</div>;
  const todos = [padrao, ...modelos];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Modelos de recibo e fatura</h2>
        <p className="text-sm text-[var(--color-text-muted)]">Crie o seu modelo (cor, logo, texto do recibo, observações) e marque um como <b>principal</b>: é ele que sai ao gerar o PDF de uma receita. O modelo do SPY continua disponível.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {todos.map((m) => (
          <button key={m.id} onClick={() => setSelId(m.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${selId === m.id ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
            {principalId === m.id && <Star className="w-3 h-3 fill-current" />}{m.nome}
          </button>
        ))}
        {admin && <Button size="sm" variant="outline" onClick={() => novo()}><Plus className="w-4 h-4" /> Novo modelo</Button>}
      </div>

      <Card className="p-4 flex flex-col gap-3">
        <div className="text-sm font-bold">Recebimento por Pix</div>
        <p className="text-xs text-[var(--color-text-muted)]">Cadastre a chave Pix da empresa: as faturas em aberto passam a sair com o QR e o Pix copia e cola, já com o valor. Deixe a chave em branco e salve para remover.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs font-bold text-[var(--color-text-muted)] flex-1 min-w-[220px]">Chave Pix (CPF, CNPJ, e-mail, +55… ou aleatória)
            <input className={campo} disabled={!admin} value={pix.chave} onChange={(e) => setPix({ ...pix, chave: e.target.value })} /></label>
          <label className="text-xs font-bold text-[var(--color-text-muted)] w-[220px]">Nome do recebedor (opcional)
            <input className={campo} disabled={!admin} maxLength={25} placeholder="Nome da empresa" value={pix.nome} onChange={(e) => setPix({ ...pix, nome: e.target.value })} /></label>
          <label className="text-xs font-bold text-[var(--color-text-muted)] w-[180px]">Cidade
            <input className={campo} disabled={!admin} maxLength={15} value={pix.cidade} onChange={(e) => setPix({ ...pix, cidade: e.target.value })} /></label>
          {admin && <Button size="sm" onClick={salvarPix} disabled={salvandoPix}>{salvandoPix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar chave Pix</Button>}
        </div>
        {mpConectado ? (
          <p className="text-[11px] text-[var(--color-success,#16a34a)]"><b>Baixa automática ligada:</b> o Mercado Pago está conectado. Nas faturas em aberto que tenham e-mail do cliente (ou da empresa), o QR é gerado pelo Mercado Pago e, quando o cliente paga, o lançamento vira <b>Pago</b> sozinho.</p>
        ) : (
          <p className="text-[11px] text-[var(--color-text-muted)]">Para a <b>baixa automática</b> ao pagar, conecte o Mercado Pago em Configurações → Integrações. Sem ele, o QR usa a chave acima e a baixa continua manual.</p>
        )}
        {!pixSalvo && !mpConectado && <p className="text-[11px] text-[var(--color-text-muted)]">Sem chave cadastrada e sem Mercado Pago, as faturas saem sem QR.</p>}
      </Card>

      {atual && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 flex flex-col gap-3">
            {!editavel && <p className="text-xs text-[var(--color-text-muted)]">{selId === "padrao" ? "Este é o modelo do SPY e não pode ser editado. Duplique para criar o seu." : "Só administradores editam os modelos."}</p>}
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Nome do modelo
              <input className={campo} disabled={!editavel} value={atual.nome} onChange={(e) => mudar({ nome: e.target.value })} /></label>
            <div className="flex flex-wrap gap-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">Cor
                <input type="color" disabled={!editavel} className="block h-[38px] w-[70px] rounded cursor-pointer" value={atual.cor} onChange={(e) => mudar({ cor: e.target.value })} /></label>
              <div className="text-xs font-bold text-[var(--color-text-muted)]">Logo (PNG ou JPEG)
                <div className="flex items-center gap-2 mt-1">
                  {atual.logo && <img src={atual.logo} alt="Logo" className="h-9 max-w-[90px] object-contain border border-[var(--color-border-default)] rounded" />}
                  {editavel && <label className="cursor-pointer inline-flex items-center gap-1 px-3 h-[38px] rounded-lg border border-[var(--color-border-default)] text-xs"><ImagePlus className="w-4 h-4" /> Escolher<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => escolherLogo(e.target.files?.[0])} /></label>}
                  {editavel && atual.logo && <button className="text-xs underline cursor-pointer" onClick={() => mudar({ logo: "" })}>Remover</button>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">Título do recibo (pago)
                <input className={campo} disabled={!editavel} value={atual.tituloRecibo} onChange={(e) => mudar({ tituloRecibo: e.target.value })} /></label>
              <label className="text-xs font-bold text-[var(--color-text-muted)]">Título da fatura (em aberto)
                <input className={campo} disabled={!editavel} value={atual.tituloFatura} onChange={(e) => mudar({ tituloFatura: e.target.value })} /></label>
            </div>
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Texto do documento (opcional)
              <textarea ref={areaRef} rows={4} className={area} disabled={!editavel} value={atual.abertura} onChange={(e) => mudar({ abertura: e.target.value })} placeholder={EXEMPLO} /></label>
            {editavel && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-[var(--color-text-muted)]">Inserir:</span>
                {VARIAVEIS.map((v) => <button key={v} onClick={() => inserirVariavel(v)} className="px-2 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[11px] cursor-pointer">{`{{${v}}}`}</button>)}
                <button onClick={() => mudar({ abertura: EXEMPLO })} className="px-2 py-0.5 rounded text-[11px] underline cursor-pointer">Usar texto de exemplo</button>
              </div>
            )}
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Observações (rodapé)
              <textarea rows={2} className={area} disabled={!editavel} value={atual.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} /></label>
            <div className="flex flex-col gap-1.5">
              {OPCOES.map(([k, rot]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editavel} checked={atual.mostrar[k]} onChange={(e) => mudar({ mostrar: { ...atual.mostrar, [k]: e.target.checked } })} /> {rot}</label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {admin && <Button size="sm" variant="outline" onClick={() => novo(atual)}><Copy className="w-4 h-4" /> Duplicar</Button>}
              {admin && principalId !== selId && !sujo && <Button size="sm" variant="outline" onClick={tornarPrincipal} disabled={salvando}><Star className="w-4 h-4" /> Tornar principal</Button>}
              {editavel && <Button size="sm" variant="outline" onClick={excluir}><Trash2 className="w-4 h-4" /> Excluir</Button>}
              {admin && sujo && <Button size="sm" onClick={() => salvar()} disabled={salvando}>{salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar alterações</Button>}
            </div>
            {sujo && principalId !== selId && <p className="text-[11px] text-[var(--color-text-muted)]">Salve as alterações para poder marcar este modelo como principal.</p>}
          </Card>

          <Card className="p-3 flex flex-col gap-2">
            <div className="flex gap-2">
              {(["recibo", "fatura"] as const).map((t) => (
                <button key={t} onClick={() => setTipo(t)} className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${tipo === t ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "text-[var(--color-text-muted)]"}`}>{t === "recibo" ? "Recibo (pago)" : "Fatura (em aberto)"}</button>
              ))}
            </div>
            {previa ? <iframe title="Pré-visualização" src={previa} className="w-full h-[640px] rounded border border-[var(--color-border-default)] bg-white" /> : <div className="text-sm text-[var(--color-text-muted)] p-6">Gerando pré-visualização…</div>}
            <p className="text-[11px] text-[var(--color-text-muted)]">A pré-visualização usa dados de exemplo.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
