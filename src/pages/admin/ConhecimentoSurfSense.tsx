import { BookOpen, ExternalLink, ShieldCheck } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// Endereço do SurfSense hospedado pela própria plataforma (VPS). Pode ser trocado por VITE_SURFSENSE_URL.
const SURFSENSE_URL = (import.meta as any).env?.VITE_SURFSENSE_URL || "https://surfsense.spycrm.com.br";

/**
 * Administração Master → Base de Conhecimento (SurfSense).
 * Atalho para o SurfSense: pesquisa com citações em documentos da empresa. A Aurora e os diretores consultam a
 * mesma base pelas ferramentas do n8n; cada empresa tem o seu espaço de trabalho, sem misturar dados.
 */
export default function ConhecimentoSurfSense() {
  return (
    <PageContainer
      title="Base de Conhecimento (SurfSense)"
      description="Documentos, contratos e pesquisas da empresa, com respostas citando a fonte. A Aurora consulta esta mesma base."
    >
      <div className="max-w-3xl space-y-4">
        <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-4">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 mt-0.5 text-[var(--color-primary-blue)]" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-[var(--color-text-primary)]">Abrir o SurfSense</h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                Envie PDFs, planilhas e documentos, faça perguntas e receba respostas com a fonte. Abre em uma nova aba, no servidor da própria plataforma.
              </p>
            </div>
          </div>
          <Button asChild className="bg-[var(--color-primary-blue)] text-white font-bold">
            <a href={SURFSENSE_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" /> Abrir SurfSense
            </a>
          </Button>
        </Card>
        <Card className="p-4 bg-warning/10 border border-warning/30 text-xs text-[var(--color-text-primary)] flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Cada empresa usa o seu próprio espaço de trabalho: não suba documentos de um cliente no espaço de outro.</span>
        </Card>
      </div>
    </PageContainer>
  );
}
