import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Link } from "react-router-dom";
import { BotaoImportarLeads } from "../../components/ImportadorPlanilha";
import { FileSpreadsheet, CheckCircle2 } from "lucide-react";

// Atalho para importar leads. O importador em si é o mesmo de todas as telas (ImportadorPlanilha):
// Excel/CSV/Google Forms, mapeamento de colunas, duplicados ignorados, lotes com progresso.
export default function CRMImportacao() {
  return (
    <PageContainer
      title="Importar planilha"
      description="Traga uma lista de inscritos, clientes ou contatos (Excel, CSV ou Google Forms) para o funil do CRM."
      actions={<BotaoImportarLeads label="Importar leads" />}
    >
      <Card className="p-6 max-w-3xl space-y-4">
        <h4 className="text-sm font-bold flex items-center gap-2 text-[var(--color-text-primary)]"><FileSpreadsheet className="w-4 h-4 text-[var(--color-primary-blue)]" /> Como funciona</h4>
        <ul className="space-y-2 text-xs text-[var(--color-text-muted)]">
          {[
            "Baixe a planilha do Google Forms/Planilhas (Arquivo › Fazer download › .xlsx ou .csv) ou use o seu Excel.",
            "Escolha o funil e a etapa onde os leads entram e uma origem (ex.: “Treinão 14/11”) para filtrar depois.",
            "O sistema reconhece as colunas (nome, WhatsApp, e-mail…). As demais respostas do formulário vão para as observações do lead.",
            "Quem já está no CRM (mesmo e-mail ou telefone) é pulado — sem duplicar. Aguenta dezenas de milhares de linhas.",
          ].map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--color-success)]" />{t}</li>)}
        </ul>
        <p className="text-xs text-[var(--color-text-muted)]">Também dá para importar em <Link className="font-bold text-[var(--color-primary-blue)]" to="/app/crm/clientes">Clientes</Link>, <Link className="font-bold text-[var(--color-primary-blue)]" to="/app/crm/empresas">Empresas</Link> e <Link className="font-bold text-[var(--color-primary-blue)]" to="/app/produtos">Produtos</Link>, e nas telas de Alunos e Pacientes.</p>
      </Card>
    </PageContainer>
  );
}
