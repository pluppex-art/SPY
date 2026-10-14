import React, { useState, useEffect, useRef } from "react";
import {
  Save,
  Download,
  Link2,
  ExternalLink,
  Eye,
  Edit3,
  CheckCircle2,
  X,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { handleDownloadPdf } from "../../../../pages/crm/utils/proposalPdf";
import { cn } from "../../../../lib/utils";
import { PropostaDocumento } from "../../../proposta/PropostaDocumento";

export interface PropostaEditorData {
  id?: string;
  cliente: string;
  titulo: string;
  valor: number;
  validade?: string | null;
  status?: string;
  vendedor: string;
  conteudo_texto?: string | null;
  view_token?: string | null;
  /** Copiado do lead vinculado no momento da criação (Contato/Decisor + Cargo
   * do Decisor em Lead Details) — ver DataContext.tsx (createProposalWithItems). */
  decisor_nome?: string | null;
  decisor_cargo?: string | null;
  itens?: Array<{
    product_name: string;
    quantidade: number;
    preco_unitario: number;
    /** 'recurring' | 'one_time' | null — recorrente NÃO deve multiplicar
     * quantidade×preço na linha (quantidade ali guarda ciclos×unidades pro
     * cálculo de MRR em DataContext.tsx, não "quantas unidades comprou"; ver
     * AddProdutoLeadModal.tsx). Exibir isso multiplicado faz uma assinatura
     * de R$997/mês por 12 meses aparecer como "12x R$997 = R$11.964", como
     * se fosse uma compra avulsa de 12 unidades em vez de uma recorrência. */
    billing_type?: string | null;
  }>;
}

interface PropostaEditorWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  proposalData: PropostaEditorData | null;
  onSaveProposal?: (data: PropostaEditorData) => Promise<void> | void;
}

const STATUS_OPTIONS = ["Rascunho", "Enviada", "Aceita", "Recusada"];

const DEFAULT_TERMS_TEMPLATE = (tenantName: string) => `CLÁUSULA 1ª – DO OBJETO E ESCOPO
O presente instrumento tem por finalidade a prestação dos serviços especializados e o fornecimento das soluções discriminadas na Tabela de Itens e Escopo Financeiro deste documento, em estrita consonância com os padrões técnicos de excelência da ${tenantName}.

CLÁUSULA 2ª – DAS OBRIGAÇÕES DA CONTRATADA
A Contratada se compromete a:
a) Empregar profissionais qualificados para a perfeita execução dos serviços contratados;
b) Cumprir com presteza os prazos acordados nas reuniões de alinhamento e cronograma técnico;
c) Manter canal aberto de suporte operacional e consultivo durante todo o ciclo do projeto;
d) Comunicar previamente qualquer eventualidade que possa influenciar no cumprimento do cronograma.

CLÁUSULA 3ª – DAS OBRIGAÇÕES DO CONTRATANTE
O Contratante se compromete a:
a) Fornecer oportunamente todas as informações, credenciais e acessos necessários para a execução dos trabalhos;
b) Designar um responsável técnico ou interlocutor direto para validação de etapas e entregáveis;
c) Efetuar pontualmente os pagamentos nos termos e condições comerciais acordadas neste instrumento.

CLÁUSULA 4ª – DOS PRAZOS E VIGÊNCIA
Os serviços terão início imediato após a formalização deste instrumento e aprovação comercial, com vigência estipulada no cronograma de implantação. Eventuais alterações de escopo solicitadas pelo Contratante demandarão ajuste prévio de prazos e custos.

CLÁUSULA 5ª – DO VALOR E CONDIÇÕES DE PAGAMENTO
Pela prestação dos serviços contratados, o Contratante pagará à Contratada o valor total estipulado neste documento, conforme as condições comerciais pactuadas (via Transferência Bancária / Chave PIX Oficial ou Boleto Bancário). Em caso de atraso injustificado, incidirá multa moratória de 2% (dois por cento) sobre o saldo devedor acrescida de juros de mora legais de 1% ao mês.

CLÁUSULA 6ª – DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS (LGPD)
As partes declaram conhecer e se obrigam a cumprir as disposições da Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD). Todas as informações estratégicas, financeiras, cadastrais e operacionais trocadas entre as partes serão tratadas com absoluto sigilo, sendo expressamente vedada sua divulgação a terceiros sem autorização prévia por escrito.

CLÁUSULA 7ª – DAS DISPOSIÇÕES GERAIS E FORO
O presente documento vincula as partes e seus sucessores a qualquer título. Fica eleito o Foro da Comarca da sede da Contratada para dirimir quaisquer dúvidas ou litígios oriundos deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`;

export function PropostaEditorWordModal({
  isOpen,
  onClose,
  proposalData,
  onSaveProposal,
}: PropostaEditorWordModalProps) {
  const { updateProposal, tenantPrimaryColor, appSettings } = useData();
  const { activeTenantName } = useAuth();

  // Multi-tenant Branding & Details
  const empresaDados = appSettings?.empresa_dados || {};
  const tenantName =
    empresaDados?.nomeFantasia ||
    empresaDados?.razaoSocial ||
    activeTenantName ||
    "Empresa Proponente";
  const brandColor = tenantPrimaryColor || "#2563EB";

  // Document Fields
  const [titulo, setTitulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [validade, setValidade] = useState("");
  const [status, setStatus] = useState("Enviada");
  const [decisorNome, setDecisorNome] = useState("");
  const [decisorCargo, setDecisorCargo] = useState("");
  const [conteudoTexto, setConteudoTexto] = useState("");
  const [itens, setItens] = useState<
    Array<{ product_name: string; quantidade: number; preco_unitario: number; billing_type?: string | null }>
  >([]);
  const [viewToken, setViewToken] = useState<string | null>(null);
  // Data de emissão exibida no documento (a proposta ainda não traz criada_em aqui).
  const [emissao] = useState(() => new Date().toISOString());

  // View state & ergonomics
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen || !proposalData) return;

    setTitulo(proposalData.titulo || "Proposta Comercial");
    setCliente(proposalData.cliente || "Cliente");
    setVendedor(proposalData.vendedor || "Consultoria Comercial");
    setValor(proposalData.valor || 0);
    setValidade(
      proposalData.validade ||
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    );
    setStatus(proposalData.status || "Enviada");
    setDecisorNome(proposalData.decisor_nome || "");
    setDecisorCargo(proposalData.decisor_cargo || "");
    setConteudoTexto(
      proposalData.conteudo_texto?.trim() || DEFAULT_TERMS_TEMPLATE(tenantName)
    );
    setItens(proposalData.itens || []);
    setViewToken(proposalData.view_token || null);
    setMode("edit");
  }, [isOpen, proposalData, tenantName]);

  if (!isOpen || !proposalData) return null;

  const isVencida = validade ? new Date(validade) < new Date() : false;

  // Insert helper clause at cursor position
  const insertClauseAtCursor = (clauseText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setConteudoTexto((prev) => prev + "\n\n" + clauseText);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const updated =
      current.substring(0, start) +
      "\n\n" +
      clauseText +
      "\n\n" +
      current.substring(end);
    setConteudoTexto(updated);
    toast.success("Cláusula inserida no documento!");
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + clauseText.length + 4,
        start + clauseText.length + 4
      );
    }, 50);
  };

  const handleCopyPublicLink = () => {
    if (!viewToken) {
      toast.info("Link público gerado automaticamente no salvamento.");
      return;
    }
    const publicUrl = `${window.location.origin}/proposta/${viewToken}`;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link público copiado!", {
      description: "Envie este link para o cliente acompanhar e aprovar a proposta online.",
    });
  };

  const handleOpenPublicProposal = () => {
    if (!viewToken) {
      toast.info("Salve a proposta para ativar a visualização pública com token seguro.");
      return;
    }
    window.open(`/proposta/${viewToken}`, "_blank", "noopener,noreferrer");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedData: PropostaEditorData = {
        ...proposalData,
        titulo,
        cliente,
        vendedor,
        valor,
        validade,
        status,
        decisor_nome: decisorNome || null,
        decisor_cargo: decisorCargo || null,
        conteudo_texto: conteudoTexto,
        itens,
      };

      if (onSaveProposal) {
        await onSaveProposal(updatedData);
      } else if (proposalData.id && updateProposal) {
        await updateProposal(proposalData.id, {
          titulo,
          cliente,
          vendedor,
          valor,
          validade,
          status,
          decisor_nome: decisorNome || null,
          decisor_cargo: decisorCargo || null,
          conteudo_texto: conteudoTexto,
        });
      }

      toast.success("✅ Proposta salva com sucesso!", {
        description: "Diretrizes, escopo e termos contratuais sincronizados no banco de dados.",
      });
    } catch (err: any) {
      toast.error("Erro ao salvar proposta: " + err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPdf = () => {
    handleDownloadPdf(
      {
        id: proposalData.id || `prop-${Date.now()}`,
        cliente,
        titulo,
        valor,
        vendedor,
        validade: validade || undefined,
        status: (status as any) || "Enviada",
        tipo: "texto",
        conteudo_texto: conteudoTexto,
      },
      itens,
      { logoUrl: empresaDados?.logoUrl, tenantName }
    );
    toast.success("PDF da Proposta gerado com sucesso!");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      noPadding={true}
      maxWidth={
        isMaximized
          ? "max-w-none w-screen h-screen m-0"
          : "max-w-[1360px] w-[96vw]"
      }
      className={cn(
        "overflow-hidden flex flex-col transition-all duration-200 border",
        "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-primary)] shadow-2xl",
        isMaximized
          ? "fixed inset-0 h-screen max-h-screen rounded-none z-[110]"
          : "h-[92vh] max-h-[92vh] rounded-2xl"
      )}
    >
      {/* ── TOP BAR: IDENTIDADE DO DOCUMENTO + FECHAR ── */}
      <div className="px-6 pt-3.5 pb-2.5 border-b border-[var(--color-border-default)] bg-[var(--color-surface)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {empresaDados?.logoUrl ? (
            <div className="w-10 h-10 rounded-xl bg-white border border-[var(--color-border-default)] flex items-center justify-center shadow-md shrink-0 overflow-hidden">
              <img src={empresaDados.logoUrl} alt={tenantName} className="w-full h-full object-contain p-1" />
            </div>
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shadow-md shrink-0"
              style={{ backgroundColor: brandColor }}
            >
              {tenantName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: brandColor }}>
                {tenantName}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]">
                Editor de Contrato
              </span>
              {viewToken && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Link Público Ativo
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">
              Edite o documento direto na página — é exatamente o que o cliente vê
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer shrink-0"
          title="Fechar Editor"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── BARRA DE FERRAMENTAS: VISUALIZAÇÃO + AÇÕES ── */}
      <div className="px-6 py-2.5 border-b border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* Modo de visualização */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="p-0.5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] flex items-center">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                mode === "edit"
                  ? "bg-[var(--color-primary-blue)] text-white shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Edit3 className="w-3.5 h-3.5" /> Editando
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                mode === "preview"
                  ? "bg-[var(--color-primary-blue)] text-white shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              <Eye className="w-3.5 h-3.5" /> Pré-visualizar
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
            title={isMaximized ? "Restaurar Janela" : "Expandir em Tela Cheia"}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Ações do documento */}
        <div className="flex items-center gap-2 flex-wrap">
          {viewToken && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyPublicLink}
                title="Copiar link público para o cliente"
                className="text-xs gap-1.5 h-8.5 font-bold cursor-pointer border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
              >
                <Link2 className="w-3.5 h-3.5 text-blue-500" /> Copiar Link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPublicProposal}
                title="Ver proposta exatamente como o cliente vê"
                className="text-xs gap-1.5 h-8.5 font-bold cursor-pointer border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-500" /> Ver como Cliente
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            className="text-xs gap-1.5 h-8.5 font-bold cursor-pointer border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
          >
            <Download className="w-3.5 h-3.5" /> Baixar PDF
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isSaving}
            onClick={handleSave}
            style={{ backgroundColor: brandColor }}
            className="text-xs font-black uppercase tracking-wider gap-1.5 h-8.5 px-4 text-white shadow-md hover:brightness-110 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? "Salvando..." : "Salvar Proposta"}
          </Button>
        </div>
      </div>

      {/* ── QUICK INSERT CLAUSES RIBBON ── */}
      {mode === "edit" && (
        <div className="px-6 py-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] flex items-center justify-between gap-2 overflow-x-auto scrollbar-none text-xs shrink-0">
          <div className="flex items-center gap-1.5 flex-nowrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mr-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Inserir Cláusulas com 1 Clique:
            </span>

            <button
              type="button"
              onClick={() =>
                insertClauseAtCursor(
                  `CLÁUSULA – DA ASSINATURA RECORRENTE E VIGÊNCIA\nA prestação dos serviços e soluções de software sob o regime de recorrência mensal terá vigência inicial acordada neste instrumento, com faturamento periódico emitido pela ${tenantName}. A renovação se dará automaticamente por iguais períodos, assegurado o reajuste anual pelo índice oficial (IPCA/IGP-M).`
                )
              }
              className="px-2.5 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]"
            >
              🔄 + Recorrência & Vigência
            </button>

            <button
              type="button"
              onClick={() =>
                insertClauseAtCursor(
                  `CLÁUSULA – DA TAXA DE IMPLANTAÇÃO E SETUP DO SISTEMA\nA taxa de implantação/setup inicial contempla as etapas de parametrização da plataforma, cargas de dados, homologação dos fluxos operacionais e treinamento capacitatório dos usuários designados pelo Contratante. O cronograma de implantação pela equipe da ${tenantName} se inicia imediatamente após a formalização comercial e quitação da respectiva taxa.`
                )
              }
              className="px-2.5 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]"
            >
              🛠️ + Implantação & Setup
            </button>

            <button
              type="button"
              onClick={() =>
                insertClauseAtCursor(
                  `CLÁUSULA – DA GARANTIA TÉCNICA E SUPORTE\nA Contratada (${tenantName}) concede garantia integral sobre os serviços executados pelo período de 90 (noventa) dias corridos, garantindo assistência corretiva sem custos adicionais decorrentes de vícios técnicos de fabricação ou parametrização.`
                )
              }
              className="px-2.5 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]"
            >
              🛡️ + Garantia & Suporte
            </button>

            <button
              type="button"
              onClick={() =>
                insertClauseAtCursor(
                  `CLÁUSULA – DA CONTA BANCÁRIA E PAGAMENTOS\nOs pagamentos referentes a esta proposta deverão ser efetuados em favor da ${tenantName} (${empresaDados?.razaoSocial || tenantName}), CNPJ: ${empresaDados?.cnpj || "00.000.000/0001-00"}.\nO comprovante de transferência deverá ser remetido ao e-mail ${empresaDados?.emailContato || "financeiro@empresa.com.br"}.`
                )
              }
              className="px-2.5 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]"
            >
              💳 + Dados Bancários / PIX
            </button>

            <button
              type="button"
              onClick={() =>
                insertClauseAtCursor(
                  "CLÁUSULA – DOS NÍVEIS DE SERVIÇO (SLA)\nOs atendimentos de chamados e suporte obedecerão aos seguintes níveis de severidade:\n• Crítica (paralisação total): Resposta em até 2 horas e resolução em até 8 horas úteis;\n• Alta: Resposta em até 4 horas úteis;\n• Normal/Dúvidas: Resposta em até 24 horas úteis."
                )
              }
              className="px-2.5 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]"
            >
              ⏱️ + SLAs e Suporte
            </button>

            <button
              type="button"
              onClick={() =>
                insertClauseAtCursor(
                  "CLÁUSULA – DAS TESTEMUNHAS E ASSINATURA ELETRÔNICA\nAs partes concordam expressamente que a aceitação digital desta proposta via link web ou confirmação documental possui plena validade jurídica e eficácia probatória para todos os fins de direito, nos termos da MP 2.200-2/2001."
                )
              }
              className="px-2.5 py-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer hover:border-[var(--color-primary-blue)] hover:text-[var(--color-primary-blue)]"
            >
              ✍️ + Validade Digital
            </button>
          </div>

          <div className="text-[11px] text-slate-400 font-mono hidden md:block">
            {conteudoTexto.length} caracteres
          </div>
        </div>
      )}

      {/* ── DOCUMENTO: o mesmo que o cliente vê em /proposta/:token, editável no lugar ── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-[var(--color-surface)] text-[var(--color-text-primary)] font-sans">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
          <PropostaDocumento
            proposta={{
              titulo: titulo,
              cliente: cliente,
              valor,
              status,
              validade: validade || null,
              conteudoTexto: conteudoTexto,
              criadaEm: emissao,
              vendedor,
              decisorNome,
              decisorCargo,
              itens: itens.map((i) => ({
                productName: i.product_name,
                quantidade: i.quantidade,
                precoUnitario: i.preco_unitario,
                billingType: i.billing_type,
              })),
            }}
            brandColor={brandColor}
            tenantName={tenantName}
            empresaDados={empresaDados}
            isAccepted={false}
            isVencida={isVencida}
            refId={`PROP-${proposalData.id?.slice(0, 8) || "NOVA"}`}
            editable={
              mode === "edit"
                ? {
                    onTitulo: setTitulo,
                    onCliente: setCliente,
                    onDecisorNome: setDecisorNome,
                    onDecisorCargo: setDecisorCargo,
                    onValidade: setValidade,
                    onValor: setValor,
                    onStatus: setStatus,
                    onVendedor: setVendedor,
                    onConteudo: setConteudoTexto,
                    clausulasRef: textareaRef,
                    statusOptions: STATUS_OPTIONS,
                  }
                : undefined
            }
            acceptSlot={
              <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto">
                <Button
                  type="button"
                  size="lg"
                  disabled
                  style={{ backgroundColor: brandColor }}
                  className="w-full sm:w-auto text-xs font-black uppercase tracking-wider h-11 px-6 text-white shadow-xl opacity-40 cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Aceitar Proposta Comercial
                </Button>
                <span className="text-[10px] text-[var(--color-text-muted)] italic">
                  O cliente verá aqui o botão de aceite
                </span>
              </div>
            }
          />
        </div>
      </div>
    </Modal>
  );
}
