import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Plus, Star, Trash2, Save, Loader2, ImagePlus, Palette, Type, ListChecks, QrCode, Eye, Undo2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui/card";
import { PageContainer } from "../../components/PageContainer";
import { Field, FormSection, inputCls, textareaCls } from "./components/ModalKit";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { Button } from "../../components/ui/button";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/apiClient";
import { esquecerListaDeModelos } from "./BotaoFaturaPdf";

type Mostrar = { emitente: boolean; documentoCliente: boolean; detalhes: boolean; formaPagamento: boolean; assinatura: boolean; pix: boolean; pixNoRecibo: boolean; logoEmpresa: boolean };
type Modelo = { id: string; nome: string; cor: string; logo: string; tituloRecibo: string; tituloFatura: string; abertura: string; observacoes: string; mostrar: Mostrar };

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

  const carregar = useCallback(async () => {
    const r = await apiFetch("/api/financeiro/modelos-recibo"); const j = await lerJson(r);
    if (r.ok) { setPadrao(j.padrao); setModelos(j.modelos ?? []); setPrincipalId(j.principalId ?? "padrao"); setSujo(false); }
    const rp = await apiFetch("/api/financeiro/pix-recebimento"); const jp = await lerJson(rp);
    if (rp.ok) setMpConectado(!!jp.mercadoPago);
    if (rp.ok && jp.pix) { setPix({ chave: jp.pix.chave ?? "", nome: jp.pix.nome ?? "", cidade: jp.pix.cidade ?? "" }); setPixSalvo(true); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const [aba, setAba] = useState<"modelo" | "pix">("modelo");
  const descartar = async () => {
    if (!(await confirmDialog({ title: "Descartar alterações", description: "As alterações não salvas dos modelos serão perdidas. Quer continuar?" }))) return;
    await carregar();
    setSelId("padrao");
  };

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

  if (!padrao) return <PageContainer title="Modelos de Recibo" description="Carregando os modelos…" breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Modelos de Recibo" }]}><div className="p-6 text-sm text-[var(--color-text-muted)]">Carregando…</div></PageContainer>;
  const todos = [padrao, ...modelos];
  const ehPadrao = selId === "padrao";

  return (
    <PageContainer
      title="Modelos de Recibo"
      description="Crie o seu modelo de recibo e de fatura (cor, logo, texto e observações) e marque um como principal: é ele que sai ao gerar o PDF de uma receita. O modelo do SPY continua disponível."
      breadcrumb={[{ label: "Financeiro", path: "/app/financeiro/dashboard" }, { label: "Modelos de Recibo" }]}
      actions={admin ? <Button onClick={() => novo()} className="h-9 px-4 text-xs font-medium gap-1.5"><Plus className="w-3.5 h-3.5" /> Novo modelo</Button> : undefined}
    >
      <div className="flex flex-col gap-4 max-w-[1500px] mx-auto pb-24">
        {/* Modelos */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {todos.map((m) => {
            const sel = selId === m.id;
            return (
              <button key={m.id} type="button" onClick={() => { setSelId(m.id); setAba("modelo"); }}
                className={`text-left rounded-[var(--radius-panel)] border p-3.5 transition-all cursor-pointer bg-[var(--color-surface-elevated)] ${sel ? "border-[var(--color-primary-blue)] ring-2 ring-[var(--color-primary-blue)]/20" : "border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40"}`}>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center overflow-hidden border border-[var(--color-border-subtle)]" style={{ backgroundColor: m.cor }}>
                    {m.logo ? <img src={m.logo} alt="" className="max-h-8 max-w-8 object-contain" /> : <Palette className="w-4 h-4 text-white/90" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[var(--color-text-primary)] truncate">{m.nome}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {principalId === m.id && <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-primary-blue)]/12 text-[var(--color-primary-blue)]"><Star className="w-2.5 h-2.5 fill-current" /> Principal</span>}
                      {m.id === "padrao" && <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"><Lock className="w-2.5 h-2.5" /> Modelo do SPY</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Abas: modelo / Pix */}
        <div className="flex gap-1 border-b border-[var(--color-border-subtle)]">
          {([["modelo", "Modelo e pré-visualização", Eye], ["pix", "Recebimento por Pix", QrCode]] as const).map(([id, rot, Ic]) => (
            <button key={id} type="button" onClick={() => setAba(id)} className={`px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 border-b-2 -mb-px cursor-pointer bg-transparent ${aba === id ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}><Ic className="w-3.5 h-3.5" /> {rot}</button>
          ))}
        </div>

        {aba === "pix" && (
          <Card className="p-5 flex flex-col gap-4 max-w-3xl">
            <div>
              <h3 className="text-sm font-black text-[var(--color-text-primary)]">Recebimento por Pix</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Cadastre a chave Pix da empresa: as faturas em aberto passam a sair com o QR e o Pix copia e cola, já com o valor. Deixe a chave em branco e salve para remover.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Chave Pix" hint="CPF, CNPJ, e-mail, +55… ou aleatória" className="sm:col-span-3"><input className={inputCls()} disabled={!admin} value={pix.chave} onChange={(e) => setPix({ ...pix, chave: e.target.value })} /></Field>
              <Field label="Nome do recebedor" hint="Opcional, até 25 letras" className="sm:col-span-2"><input className={inputCls()} disabled={!admin} maxLength={25} placeholder="Nome da empresa" value={pix.nome} onChange={(e) => setPix({ ...pix, nome: e.target.value })} /></Field>
              <Field label="Cidade" hint="Até 15 letras"><input className={inputCls()} disabled={!admin} maxLength={15} value={pix.cidade} onChange={(e) => setPix({ ...pix, cidade: e.target.value })} /></Field>
            </div>
            {admin && <div><Button onClick={salvarPix} disabled={salvandoPix} className="h-9 px-4 text-xs font-medium gap-1.5">{salvandoPix ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar chave Pix</Button></div>}
            {mpConectado ? (
              <p className="text-xs rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)] p-3"><b>Baixa automática ligada:</b> o Mercado Pago está conectado. Nas faturas em aberto que tenham e-mail do cliente (ou da empresa), o QR é gerado pelo Mercado Pago e a baixa acontece sozinha quando o cliente paga.</p>
            ) : (
              <p className="text-xs rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] p-3">Para a <b>baixa automática</b> ao pagar, conecte o Mercado Pago em Configurações → Integrações. Sem ele, o QR usa a chave acima e a baixa continua manual.</p>
            )}
            {!pixSalvo && !mpConectado && <p className="text-xs text-[var(--color-warning)]">Sem chave cadastrada e sem Mercado Pago, as faturas saem sem QR.</p>}
          </Card>
        )}

        {aba === "modelo" && atual && (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <div className="flex flex-col gap-4">
              {!editavel && (
                <p className="text-xs rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] p-3 inline-flex items-center gap-2"><Lock className="w-3.5 h-3.5 shrink-0" />{ehPadrao ? "Este é o modelo do SPY e não pode ser editado. Duplique para criar o seu." : "Só administradores editam os modelos."}</p>
              )}

              <FormSection icon={Palette} title="Identidade">
                <Field label="Nome do modelo"><input className={inputCls()} disabled={!editavel} value={atual.nome} onChange={(e) => mudar({ nome: e.target.value })} /></Field>
                <div className="flex flex-wrap gap-4 items-end">
                  <Field label="Cor"><input type="color" disabled={!editavel} className="block h-9 w-[70px] rounded-lg cursor-pointer" value={atual.cor} onChange={(e) => mudar({ cor: e.target.value })} /></Field>
                  <Field label="Logo" hint="PNG ou JPEG, até 180 KB">
                    <div className="flex items-center gap-2">
                      {atual.logo && <img src={atual.logo} alt="Logo" className="h-9 max-w-[90px] object-contain border border-[var(--color-border-default)] rounded-lg bg-white p-0.5" />}
                      {editavel && <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[var(--color-border-default)] text-xs font-semibold hover:bg-[var(--color-surface-sunken)]"><ImagePlus className="w-4 h-4" /> Escolher<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { escolherLogo(e.target.files?.[0]); e.target.value = ""; }} /></label>}
                      {editavel && atual.logo && <button type="button" className="text-xs underline cursor-pointer text-[var(--color-text-muted)]" onClick={() => mudar({ logo: "" })}>Remover</button>}
                    </div>
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={Type} title="Textos do documento">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Título do recibo" hint="Quando está pago"><input className={inputCls()} disabled={!editavel} value={atual.tituloRecibo} onChange={(e) => mudar({ tituloRecibo: e.target.value })} /></Field>
                  <Field label="Título da fatura" hint="Quando está em aberto"><input className={inputCls()} disabled={!editavel} value={atual.tituloFatura} onChange={(e) => mudar({ tituloFatura: e.target.value })} /></Field>
                </div>
                <Field label="Texto do documento" hint="Opcional. Use as variáveis abaixo para preencher dados do lançamento.">
                  <textarea ref={areaRef} rows={4} className={textareaCls} disabled={!editavel} value={atual.abertura} onChange={(e) => mudar({ abertura: e.target.value })} placeholder={EXEMPLO} />
                </Field>
                {editavel && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-[var(--color-text-muted)]">Inserir:</span>
                    {VARIAVEIS.map((v) => <button key={v} type="button" onClick={() => inserirVariavel(v)} className="px-2 py-0.5 rounded-md bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)]/10 text-[11px] cursor-pointer font-mono">{`{{${v}}}`}</button>)}
                    <button type="button" onClick={() => mudar({ abertura: EXEMPLO })} className="px-2 py-0.5 rounded text-[11px] underline cursor-pointer">Usar texto de exemplo</button>
                  </div>
                )}
                <Field label="Observações (rodapé)"><textarea rows={2} className={textareaCls} disabled={!editavel} value={atual.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} /></Field>
              </FormSection>

              <FormSection icon={ListChecks} title="O que aparece no documento">
                <div className="grid gap-2 sm:grid-cols-2">
                  {OPCOES.map(([k, rot]) => (
                    <label key={k} className="flex items-center gap-2 text-xs rounded-lg border border-[var(--color-border-subtle)] px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-sunken)]/60">
                      <input type="checkbox" disabled={!editavel} checked={atual.mostrar[k]} onChange={(e) => mudar({ mostrar: { ...atual.mostrar, [k]: e.target.checked } })} />
                      <span className="text-[var(--color-text-primary)]">{rot}</span>
                    </label>
                  ))}
                </div>
              </FormSection>

              {admin && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => novo(atual)} className="h-9 px-3 text-xs font-medium gap-1.5"><Copy className="w-3.5 h-3.5" /> Duplicar</Button>
                  {principalId !== selId && !sujo && <Button variant="outline" onClick={tornarPrincipal} disabled={salvando} className="h-9 px-3 text-xs font-medium gap-1.5"><Star className="w-3.5 h-3.5" /> Tornar principal</Button>}
                  {editavel && <Button variant="outline" onClick={excluir} className="h-9 px-3 text-xs font-medium gap-1.5 text-[var(--color-danger)]"><Trash2 className="w-3.5 h-3.5" /> Excluir</Button>}
                </div>
              )}
              {sujo && principalId !== selId && <p className="text-[11px] text-[var(--color-text-muted)]">Salve as alterações para poder marcar este modelo como principal.</p>}
            </div>

            <Card className="p-3 flex flex-col gap-2 lg:sticky lg:top-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Pré-visualização</span>
                <div className="flex p-0.5 rounded-lg bg-[var(--color-surface-sunken)]">
                  {(["recibo", "fatura"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTipo(t)} className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer capitalize ${tipo === t ? "bg-[var(--color-primary-blue)] text-white" : "text-[var(--color-text-muted)]"}`}>{t}</button>
                  ))}
                </div>
              </div>
              {previa ? <iframe title="Pré-visualização" src={previa} className="w-full h-[70dvh] min-h-[480px] rounded-lg border border-[var(--color-border-default)] bg-white" /> : <div className="text-sm text-[var(--color-text-muted)] p-10 text-center">Gerando a pré-visualização…</div>}
              <p className="text-[11px] text-[var(--color-text-muted)]">A pré-visualização usa dados de exemplo e atualiza enquanto você edita.</p>
            </Card>
          </div>
        )}
      </div>

      {/* Barra de alterações não salvas */}
      {admin && sujo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-lg pl-4 pr-2 py-2 max-w-[92vw]">
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Alterações não salvas</span>
          <Button variant="outline" onClick={descartar} disabled={salvando} className="h-8 px-3 text-xs font-medium gap-1.5"><Undo2 className="w-3.5 h-3.5" /> Descartar</Button>
          <Button onClick={() => salvar()} disabled={salvando} className="h-8 px-4 text-xs font-bold gap-1.5">{salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Salvar alterações</Button>
        </div>
      )}
    </PageContainer>
  );
}
