import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Printer,
  Download,
  Lock,
  Sun,
  Moon,
} from "lucide-react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { fetchPublicProposal, acceptPublicProposal, PublicProposal } from "../../lib/publicProposal";
import { handleDownloadPdf } from "../crm/utils/proposalPdf";
import { toast } from "sonner";
import { PropostaDocumento } from "../../components/proposta/PropostaDocumento";

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const [proposta, setProposta] = useState<PublicProposal | null | undefined>(undefined);
  const [isAccepted, setIsAccepted] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false); // Default to clean Executive Light theme

  // Página pública, sem sessão logada — não há tema de app pra herdar, então o
  // toggle aqui aplica a mesma classe `dark` em <html> que o resto do sistema usa
  // (ver DataContext.tsx), fazendo as variáveis --color-* baterem com "os outros"
  // em vez de manter uma paleta hexadecimal própria e desalinhada.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.toggle("dark", isDarkMode);
    return () => {
      root.classList.toggle("dark", hadDark);
    };
  }, [isDarkMode]);

  useEffect(() => {
    if (!token) {
      setProposta(null);
      return;
    }
    fetchPublicProposal(token).then((data) => {
      setProposta(data);
      if (data?.status === "Aceita") {
        setIsAccepted(true);
      }
    });
  }, [token]);

  if (proposta === undefined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0d0f14] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-3 border-blue-500/20 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-slate-500 text-xs font-mono tracking-wider uppercase">
          Carregando proposta comercial autenticada...
        </p>
      </div>
    );
  }

  if (!proposta) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <Card className="p-8 text-center max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl">
          <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-4 opacity-80" />
          <h1 className="text-xl font-black text-slate-900 mb-2">Proposta não encontrada</h1>
          <p className="text-slate-500 text-xs leading-relaxed mb-6">
            O link acessado pode ter expirado, estar incorreto ou a proposta foi reemitida com novos termos. Entre em contato com a equipe comercial para obter a versão atualizada.
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="text-xs h-9"
          >
            Tentar Novamente
          </Button>
        </Card>
      </div>
    );
  }

  // Multi-tenant Branding & Details
  const brandColor = proposta.tenantPrimaryColor || "#2563EB";
  const tenantName =
    proposta.tenantName ||
    proposta.empresaDados?.nomeFantasia ||
    proposta.empresaDados?.razaoSocial ||
    "Empresa Proponente";
  const isVencida = proposta.validade ? new Date(proposta.validade) < new Date() : false;

  const handleAcceptProposal = async () => {
    if (!token) return;
    setIsAccepting(true);
    try {
      const ok = await acceptPublicProposal(token, {
        clientName: proposta.cliente || undefined,
      });
      if (ok) {
        setIsAccepted(true);
        toast.success("🎉 Proposta Aceita com Sucesso!", {
          description: `O aceite comercial foi registrado junto à ${tenantName}.`,
          duration: 8000,
        });
      } else {
        toast.error("Não foi possível registrar o aceite agora.", {
          description: "Tente novamente em instantes ou entre em contato com a equipe comercial.",
        });
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDownloadDocPdf = () => {
    handleDownloadPdf(
      {
        id: `prop-${token?.slice(0, 8) || "public"}`,
        cliente: proposta.cliente || "Cliente",
        titulo: proposta.titulo,
        valor: proposta.valor || 0,
        vendedor: proposta.vendedor || tenantName,
        validade: proposta.validade || undefined,
        status: isAccepted ? "Aceita" : (proposta.status as any) || "Enviada",
        tipo: "texto",
        conteudo_texto: proposta.conteudoTexto,
      },
      proposta.itens?.map((i) => ({
        product_name: i.productName,
        quantidade: i.quantidade,
        preco_unitario: i.precoUnitario,
        billing_type: i.billingType ?? null,
      })) || [],
      { logoUrl: proposta.empresaDados?.logoUrl, tenantName }
    );
    toast.success("PDF do documento gerado com sucesso!");
  };

  return (
    <div className="min-h-screen font-sans selection:bg-blue-600 selection:text-white pb-20 bg-[var(--color-surface)] text-[var(--color-text-primary)]">
      {/* ── TOP NAV INSTITUCIONAL (COM BRANDING DO TENANT) ── */}
      <header className="sticky top-0 z-30 backdrop-blur-md border-b border-[var(--color-border-default)] bg-[var(--color-surface-elevated)]/90 shadow-xs px-4 sm:px-8 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {proposta.empresaDados?.logoUrl ? (
              <div className="w-9 h-9 rounded-xl bg-white border border-[var(--color-border-default)] flex items-center justify-center shadow-md shrink-0 overflow-hidden">
                <img src={proposta.empresaDados.logoUrl} alt={tenantName} className="w-full h-full object-contain p-1" />
              </div>
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md shrink-0"
                style={{ backgroundColor: brandColor }}
              >
                {tenantName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <span className="text-xs font-black tracking-wider uppercase block" style={{ color: brandColor }}>
                {tenantName}
              </span>
              <span className="text-[10px] font-mono flex items-center gap-1 text-[var(--color-text-muted)]">
                <Lock className="w-2.5 h-2.5 text-emerald-500" /> Documento Autenticado & Oficial
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Toggle (Light / Dark) */}
            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-xs font-bold transition-all cursor-pointer"
              title={isDarkMode ? "Mudar para Modo Claro" : "Mudar para Modo Escuro"}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadDocPdf}
              className="text-xs gap-1.5 h-8.5 font-bold cursor-pointer border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              <Download className="w-3.5 h-3.5" style={{ color: brandColor }} /> Baixar PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="text-xs gap-1.5 h-8.5 font-bold hidden sm:inline-flex cursor-pointer border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </Button>
          </div>
        </div>
      </header>

      {/* ── CORPO PRINCIPAL DA PROPOSTA ── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* BANNER DE ACEITE REALIZADO */}
        {isAccepted && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wide">
                Proposta Aprovada pelo Cliente
              </h4>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                O aceite comercial foi formalizado. A equipe da <strong>{tenantName}</strong> já foi notificada para os trâmites de implantação.
              </p>
            </div>
          </div>
        )}

        <PropostaDocumento
          proposta={{
            titulo: proposta.titulo,
            cliente: proposta.cliente,
            valor: proposta.valor,
            status: proposta.status,
            validade: proposta.validade,
            conteudoTexto: proposta.conteudoTexto,
            criadaEm: proposta.criadaEm,
            vendedor: proposta.vendedor,
            itens: proposta.itens || [],
          }}
          brandColor={brandColor}
          tenantName={tenantName}
          empresaDados={proposta.empresaDados}
          isAccepted={isAccepted}
          isVencida={isVencida}
          acceptSlot={
            !isAccepted ? (
              <Button
                type="button"
                size="lg"
                disabled={isAccepting || isVencida}
                onClick={handleAcceptProposal}
                style={{ backgroundColor: brandColor }}
                className="w-full sm:w-auto text-xs font-black uppercase tracking-wider h-11 px-6 text-white shadow-xl hover:brightness-110 cursor-pointer disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {isAccepting ? "Registrando Aceite..." : "Aceitar Proposta Comercial"}
              </Button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" /> Proposta Aceita com Sucesso
              </div>
            )
          }
        />
      </main>
    </div>
  );
}
