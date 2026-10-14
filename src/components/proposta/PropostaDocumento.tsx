import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Calendar, CreditCard, ShieldCheck, CheckCircle2, Mail, MapPin, Phone, Pencil } from "lucide-react";
import { Card } from "../ui/card";
import { cn } from "../../lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * PropostaDocumento — o documento que o CLIENTE vê em /proposta/:token.
 *
 * É a única fonte de markup desse documento: a página pública o renderiza
 * somente-leitura e o editor de contrato o renderiza com `editable`, onde cada
 * valor vira um controle "inline" (sem moldura de formulário) com a mesma
 * tipografia do texto final. Assim o que se edita é exatamente o que o cliente
 * recebe.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PropostaDocumentoItem {
  productName: string;
  quantidade: number;
  precoUnitario: number;
  /** 'recurring' | 'one_time' | null. Recorrente NÃO multiplica quantidade×preço
   * (a quantidade guarda ciclos×unidades pro MRR) — exibe 1x por ciclo. O
   * endpoint público ainda não envia esse campo; quando ausente, vale o
   * comportamento antigo (quantidade × preço). */
  billingType?: string | null;
}

export interface PropostaDocumentoData {
  titulo: string;
  cliente: string | null;
  valor: number | null;
  status: string | null;
  validade: string | null;
  conteudoTexto: string | null;
  criadaEm: string;
  vendedor?: string | null;
  decisorNome?: string | null;
  decisorCargo?: string | null;
  itens: PropostaDocumentoItem[];
}

export interface PropostaDocumentoEmpresa {
  cnpj?: string;
  endereco?: string;
  emailContato?: string;
  telefoneContato?: string;
}

export interface PropostaDocumentoEditable {
  onTitulo: (v: string) => void;
  onCliente: (v: string) => void;
  onDecisorNome: (v: string) => void;
  onDecisorCargo: (v: string) => void;
  /** yyyy-mm-dd */
  onValidade: (v: string) => void;
  onValor: (v: number) => void;
  onStatus: (v: string) => void;
  onVendedor: (v: string) => void;
  onConteudo: (v: string) => void;
  /** ref do textarea das cláusulas (inserção de cláusula no cursor) */
  clausulasRef?: Ref<HTMLTextAreaElement>;
  statusOptions?: string[];
}

interface PropostaDocumentoProps {
  proposta: PropostaDocumentoData;
  brandColor: string;
  tenantName: string;
  empresaDados?: PropostaDocumentoEmpresa | null;
  isAccepted?: boolean;
  isVencida?: boolean;
  /** Referência exibida sob a data de emissão (ex.: PROP-1a2b3c4d). */
  refId?: string;
  editable?: PropostaDocumentoEditable;
  /** Área à direita do bloco "Aceite digital". */
  acceptSlot?: ReactNode;
}

export function formatMoney(v: number | null | undefined) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    // 'yyyy-mm-dd' puro é lido como UTC por `new Date()` e aparece um dia antes
    // no Brasil; interpretamos como data local.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return v;
  }
}

/** "1.997,50" | "1997,5" | "1997.5" | "1.997" -> number */
export function parseMoneyInput(raw: string): number {
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    const i = s.lastIndexOf(",");
    s = s.slice(0, i).replace(/[.,]/g, "") + "." + s.slice(i + 1).replace(/[.,]/g, "");
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    // ponto único com 1-2 casas = decimal ("1997.5")
  } else {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

const numberBR = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── Controles inline ──────────────────────────────────────────────────────── */

// Realce de editabilidade: só aparece no hover/foco (tinta 4% + anel na cor da marca).
const inlineCue =
  "rounded-[4px] transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06] focus-within:bg-black/[0.04] dark:focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-[color:var(--pd-brand)]";

function PencilCue() {
  return (
    <Pencil
      aria-hidden
      className="pointer-events-none absolute -top-1.5 -right-2 w-2.5 h-2.5 opacity-0 group-hover/inline:opacity-60 group-focus-within/inline:opacity-0 transition-opacity text-[var(--color-text-muted)] print:hidden"
    />
  );
}

/** Texto editável em linha; largura/altura acompanham o conteúdo (espelho invisível). */
function InlineText({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <span className={cn("group/inline relative inline-grid max-w-full align-baseline", inlineCue, className)}>
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words min-w-[2ch]"
      >
        {(value || placeholder || " ") + "​"}
      </span>
      <textarea
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        spellCheck={false}
        onChange={(e) => onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (!multiline && e.key === "Enter") e.preventDefault();
        }}
        className="pd-inline col-start-1 row-start-1 w-0 min-w-full resize-none overflow-hidden bg-transparent border-0 p-0 m-0 outline-none focus:ring-0 text-inherit font-[inherit] leading-[inherit] tracking-[inherit] placeholder:text-[var(--color-text-faint)] placeholder:font-normal placeholder:normal-case"
        style={{ textTransform: "inherit", textAlign: "inherit" }}
      />
      <PencilCue />
    </span>
  );
}

function InlineMoney({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null); // não-nulo = digitando
  const shown = draft ?? formatMoney(value);
  return (
    <span className={cn("group/inline relative inline-grid max-w-full align-baseline", inlineCue, className)}>
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre min-w-[3ch]">
        {shown + "​"}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        aria-label={ariaLabel}
        onFocus={(e) => {
          setDraft(value ? numberBR(value) : "");
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, "");
          setDraft(raw);
          onChange(parseMoneyInput(raw));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="pd-inline col-start-1 row-start-1 w-0 min-w-full bg-transparent border-0 p-0 m-0 outline-none focus:ring-0 text-inherit font-[inherit] leading-[inherit] tracking-[inherit]"
        style={{ textAlign: "inherit" }}
      />
      <PencilCue />
    </span>
  );
}

function InlineDate({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className={cn("group/inline relative inline-block align-baseline cursor-pointer", inlineCue, className)}>
      <span>{formatDate(value)}</span>
      <input
        ref={ref}
        type="date"
        value={(value || "").slice(0, 10)}
        aria-label={ariaLabel}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={() => {
          try {
            ref.current?.showPicker?.();
          } catch {
            /* navegadores sem showPicker: o clique nativo basta */
          }
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <PencilCue />
    </span>
  );
}

function InlineSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const opts = options.includes(value) ? options : [value, ...options];
  return (
    <span className={cn("group/inline relative inline-grid align-baseline cursor-pointer", inlineCue, className)}>
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre">
        {value + "​"}
      </span>
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="pd-inline col-start-1 row-start-1 w-0 min-w-full appearance-none bg-transparent border-0 p-0 m-0 outline-none focus:ring-0 text-inherit font-[inherit] uppercase leading-[inherit] tracking-[inherit] cursor-pointer"
      >
        {opts.map((o) => (
          <option key={o} value={o} className="normal-case font-normal text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)]">
            {o}
          </option>
        ))}
      </select>
      <PencilCue />
    </span>
  );
}

/** Textarea de cláusulas: visual idêntico ao bloco do cliente, cresce com o texto. */
function ClausulasEditor({
  value,
  onChange,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof textareaRef === "function") textareaRef(el);
        else if (textareaRef) (textareaRef as { current: HTMLTextAreaElement | null }).current = el;
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Insira as cláusulas, termos, condições e diretrizes desta proposta..."
      aria-label="Cláusulas e termos contratuais"
      spellCheck={false}
      className="pd-clausulas block w-full resize-none overflow-hidden p-6 sm:p-8 rounded-2xl border text-xs leading-relaxed whitespace-pre-wrap text-justify shadow-xs border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] outline-none transition-shadow hover:border-[var(--color-text-faint)] focus:ring-2 focus:ring-[color:var(--pd-brand)] focus:border-transparent placeholder:text-[var(--color-text-faint)]"
    />
  );
}

/* ── Documento ─────────────────────────────────────────────────────────────── */

export function PropostaDocumento({
  proposta,
  brandColor,
  tenantName,
  empresaDados,
  isAccepted = false,
  isVencida = false,
  refId,
  editable,
  acceptSlot,
}: PropostaDocumentoProps) {
  const ed = editable;
  const itens = proposta.itens || [];
  const statusLabel = isAccepted ? "Aceita & Formalizada" : proposta.status || "Enviada";
  const brandVar = { ["--pd-brand" as string]: brandColor } as React.CSSProperties;
  const showDecisor = !!ed || !!proposta.decisorNome || !!proposta.decisorCargo;

  return (
    <>
      {/* CARTÃO PRINCIPAL DA PROPOSTA COM IDENTIDADE DO TENANT */}
      <Card
        style={brandVar}
        className="p-6 sm:p-12 rounded-3xl shadow-xl relative overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]"
      >
        {/* Faixa superior de destaque com a cor da marca do Tenant */}
        <div className="absolute top-0 left-0 right-0 h-2" style={{ backgroundColor: brandColor }} />

        {/* CABEÇALHO DO DOCUMENTO */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-[var(--color-border-default)]">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold border"
                style={{
                  backgroundColor: `${brandColor}15`,
                  color: brandColor,
                  borderColor: `${brandColor}30`,
                }}
              >
                Proposta Oficial • {tenantName}
              </span>
              {isVencida && !isAccepted && (
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/30 font-bold">
                  Vencida
                </span>
              )}
              {isAccepted && (
                <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Aprovada
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {ed ? (
                <InlineText
                  value={proposta.titulo}
                  onChange={ed.onTitulo}
                  placeholder="Título da proposta"
                  ariaLabel="Título da proposta"
                  multiline={false}
                />
              ) : (
                proposta.titulo
              )}
            </h1>

            {(ed || proposta.cliente) && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Apresentada exclusivamente para:{" "}
                <strong className="text-[var(--color-text-primary)]">
                  {ed ? (
                    <InlineText
                      value={proposta.cliente || ""}
                      onChange={ed.onCliente}
                      placeholder="Nome do cliente"
                      ariaLabel="Cliente"
                    />
                  ) : (
                    proposta.cliente
                  )}
                </strong>
              </p>
            )}

            {showDecisor && (
              <p className="text-xs text-[var(--color-text-muted)]">
                A/C{" "}
                {ed ? (
                  <>
                    <strong className="text-[var(--color-text-primary)]">
                      <InlineText
                        value={proposta.decisorNome || ""}
                        onChange={ed.onDecisorNome}
                        placeholder="Nome do decisor"
                        ariaLabel="Nome do decisor"
                      />
                    </strong>
                    {", "}
                    <InlineText
                      value={proposta.decisorCargo || ""}
                      onChange={ed.onDecisorCargo}
                      placeholder="Cargo"
                      ariaLabel="Cargo do decisor"
                    />
                  </>
                ) : (
                  <>
                    <strong className="text-[var(--color-text-primary)]">{proposta.decisorNome}</strong>
                    {proposta.decisorNome && proposta.decisorCargo ? ", " : ""}
                    {proposta.decisorCargo}
                  </>
                )}
              </p>
            )}
          </div>

          <div className="text-left sm:text-right space-y-1 text-xs text-[var(--color-text-muted)]">
            <p>
              Emissão:{" "}
              <span className="font-semibold text-[var(--color-text-primary)]">{formatDate(proposta.criadaEm)}</span>
            </p>
            <p className="flex items-center sm:justify-end gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              Válida até:{" "}
              <span className="font-semibold text-[var(--color-text-primary)]">
                {ed ? (
                  <InlineDate value={proposta.validade || ""} onChange={ed.onValidade} ariaLabel="Válida até" />
                ) : (
                  formatDate(proposta.validade)
                )}
              </span>
            </p>
            {refId && (
              <p className="font-mono text-[10px] text-[var(--color-text-faint)]">Ref. {refId}</p>
            )}
          </div>
        </div>

        {/* CARDS COM MÉTRICAS DE INVESTIMENTO */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-8">
          <div className="p-5 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
            <span className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--color-text-muted)]">
              Investimento Total
            </span>
            <p className="text-2xl font-mono font-black" style={{ color: brandColor }}>
              {ed ? (
                <InlineMoney value={proposta.valor ?? 0} onChange={ed.onValor} ariaLabel="Investimento total" />
              ) : (
                formatMoney(proposta.valor)
              )}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">
              Condições e formas de pagamento descritas abaixo
            </span>
          </div>

          <div className="p-5 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
            <span className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--color-text-muted)]">
              Validade Comercial
            </span>
            <p className="text-sm font-bold mt-1 text-[var(--color-text-primary)]">
              {ed ? (
                <InlineDate value={proposta.validade || ""} onChange={ed.onValidade} ariaLabel="Validade comercial" />
              ) : (
                formatDate(proposta.validade)
              )}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">Condições garantidas durante o período</span>
          </div>

          <div className="p-5 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
            <span className="text-[10px] font-black uppercase tracking-wider block mb-1 text-[var(--color-text-muted)]">
              Status da Proposta
            </span>
            <p className="text-sm font-bold mt-1 uppercase" style={{ color: brandColor }}>
              {ed && !isAccepted ? (
                <InlineSelect
                  value={proposta.status || "Enviada"}
                  options={ed.statusOptions || ["Rascunho", "Enviada", "Aceita", "Recusada"]}
                  onChange={ed.onStatus}
                  ariaLabel="Status da proposta"
                />
              ) : (
                statusLabel
              )}
            </p>
            <span className="text-[10px] text-slate-400 block mt-1">
              {isAccepted ? "Pronta para execução" : "Aguardando confirmação"}
            </span>
          </div>
        </div>

        {/* ESCOPO DE FORNECIMENTO (TABELA DE ITENS) */}
        {(itens.length > 0 || ed) && (
          <div className="space-y-3 mb-8">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-[var(--color-text-primary)]">
                <CreditCard className="w-3.5 h-3.5" style={{ color: brandColor }} />
                Escopo de Fornecimento & Soluções
              </h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                {itens.length} {itens.length === 1 ? "item contratado" : "itens contratados"}
              </span>
            </div>

            <div className="border rounded-2xl overflow-hidden border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-xs">
              <table className="w-full text-xs text-left">
                <thead className="uppercase tracking-wider text-[10px] border-b font-black bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border-[var(--color-border-default)]">
                  <tr>
                    <th className="py-3 px-4">Item / Descrição</th>
                    <th className="py-3 px-3 text-center">Quantidade</th>
                    <th className="py-3 px-3 text-right">Valor Unitário</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)] text-[var(--color-text-primary)]">
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-[var(--color-text-faint)] italic">
                        Nenhum produto cadastrado nesta proposta.
                      </td>
                    </tr>
                  )}
                  {itens.map((item, i) => {
                    // Item recorrente: `quantidade` guarda ciclos×unidades (não "quantas
                    // unidades"); multiplicar infla a linha pro valor do contrato inteiro.
                    // Mostra 1x pelo valor do ciclo; o total fica no rodapé.
                    const isRecurringItem = !!item.billingType && item.billingType !== "one_time";
                    const displayQty = isRecurringItem ? 1 : item.quantidade;
                    const displaySubtotal = isRecurringItem ? item.precoUnitario : item.precoUnitario * item.quantidade;
                    return (
                      <tr key={i} className="transition-colors hover:bg-[var(--color-surface-sunken)]">
                        <td className="py-3 px-4 font-semibold">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{item.productName}</span>
                            {item.productName.toLowerCase().includes("implantação") && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase">
                                Setup / Implantação
                              </span>
                            )}
                            {(item.productName.toLowerCase().includes("recorrente") ||
                              item.productName.toLowerCase().includes("assinatura")) && (
                              <span
                                className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase"
                                style={{
                                  backgroundColor: `${brandColor}15`,
                                  color: brandColor,
                                  borderColor: `${brandColor}30`,
                                }}
                              >
                                Recorrente
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-medium">{displayQty}</td>
                        <td className="py-3 px-3 text-right font-mono text-slate-500">
                          {formatMoney(item.precoUnitario)}
                          {isRecurringItem && <span className="text-[10px] text-slate-400">/ciclo</span>}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">{formatMoney(displaySubtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 font-bold bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]">
                  <tr>
                    <td
                      colSpan={3}
                      className="py-3.5 px-4 text-right uppercase text-[11px] text-[var(--color-text-muted)]"
                    >
                      Total do Fornecimento:
                    </td>
                    <td
                      className="py-3.5 px-4 text-right font-mono text-base font-black"
                      style={{ color: brandColor }}
                    >
                      {ed ? (
                        <InlineMoney
                          value={proposta.valor ?? 0}
                          onChange={ed.onValor}
                          ariaLabel="Total do fornecimento"
                          className="text-right"
                        />
                      ) : (
                        formatMoney(proposta.valor)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* DIRETRIZES E TERMOS CONTRATUAIS */}
        {(ed || proposta.conteudoTexto) && (
          <div className="space-y-3 pt-6 border-t border-[var(--color-border-default)]">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" style={{ color: brandColor }} />
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">
                Diretrizes, Cláusulas e Termos Contratuais
              </h3>
            </div>

            {ed ? (
              <ClausulasEditor
                value={proposta.conteudoTexto || ""}
                onChange={ed.onConteudo}
                textareaRef={ed.clausulasRef}
              />
            ) : (
              <div className="p-6 sm:p-8 rounded-2xl border text-xs leading-relaxed whitespace-pre-wrap text-justify shadow-xs border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]">
                {proposta.conteudoTexto}
              </div>
            )}
          </div>
        )}

        {/* DADOS DA EMPRESA PROPONENTE (CONTRATADA) */}
        <div className="mt-8 p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] block">
              Empresa Proponente / Contratada
            </span>
            <p className="font-bold text-sm text-[var(--color-text-primary)]">{tenantName}</p>
            {empresaDados?.cnpj && (
              <p className="text-[11px] font-mono text-[var(--color-text-muted)]">CNPJ: {empresaDados.cnpj}</p>
            )}
            {empresaDados?.endereco && (
              <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[var(--color-text-faint)]" /> {empresaDados.endereco}
              </p>
            )}
          </div>

          <div className="space-y-1 text-left sm:text-right">
            {(ed || proposta.vendedor) && (
              <p className="text-xs">
                <span className="text-[var(--color-text-muted)]">Consultor Responsável:</span>{" "}
                <strong className="text-[var(--color-text-primary)]">
                  {ed ? (
                    <InlineText
                      value={proposta.vendedor || ""}
                      onChange={ed.onVendedor}
                      placeholder="Nome do consultor"
                      ariaLabel="Consultor responsável"
                    />
                  ) : (
                    proposta.vendedor
                  )}
                </strong>
              </p>
            )}
            {empresaDados?.emailContato && (
              <p className="text-xs text-slate-500 flex items-center sm:justify-end gap-1">
                <Mail className="w-3 h-3 text-slate-400" /> {empresaDados.emailContato}
              </p>
            )}
            {empresaDados?.telefoneContato && (
              <p className="text-xs text-slate-500 flex items-center sm:justify-end gap-1">
                <Phone className="w-3 h-3 text-slate-400" /> {empresaDados.telefoneContato}
              </p>
            )}
          </div>
        </div>

        {/* AÇÕES DE ACEITE DIGITAL */}
        <div className="mt-10 pt-8 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-[var(--color-border-default)]">
          <div>
            <p className="text-xs font-bold mb-0.5 text-[var(--color-text-primary)]">
              Pronto para dar o próximo passo com a {tenantName}?
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              A formalização digital assegura o início imediato dos trabalhos e a reserva das condições propostas.
            </p>
          </div>

          <div className="flex items-center gap-2">{acceptSlot}</div>
        </div>
      </Card>

      {/* RODAPÉ INSTITUCIONAL */}
      <div className="text-center pt-4 space-y-1">
        <p className="text-[11px] text-slate-400">
          Documento emitido por <strong style={{ color: brandColor }}>{tenantName}</strong>
        </p>
        <p className="text-[10px] text-slate-400">
          Todos os direitos reservados. Em conformidade com a MP nº 2.200-2/2001 e a LGPD (Lei nº 13.709/2018).
        </p>
      </div>
    </>
  );
}
