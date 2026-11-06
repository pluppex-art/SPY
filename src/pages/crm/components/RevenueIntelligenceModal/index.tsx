import { useState } from 'react';
import { X, Brain } from 'lucide-react';
import { analyzeCall, type RevenueAnalysis, type PromptData } from '../../../../lib/revenueIntelligence';
import { toast } from 'sonner';
import { useData } from '../../../../contexts/DataContext';
import { InputForm } from './InputForm';
import { ResultsView } from './ResultsView';

interface Props {
  lead: any;
  stageName: string;
  pipelineName: string;
  onClose: () => void;
  embedded?: boolean;
}

export function RevenueIntelligenceModal({ lead, stageName, pipelineName, onClose, embedded = false }: Props) {
  const { addTask } = useData();

  const [transcript, setTranscript] = useState('');
  const [productName, setProductName] = useState('');
  const [officialPrice, setOfficialPrice] = useState('');
  const [enrollmentFee, setEnrollmentFee] = useState('');
  const [installments, setInstallments] = useState('');
  const [commercialRules, setCommercialRules] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RevenueAnalysis | null>(null);

  async function handleAnalyze() {
    if (!transcript.trim()) { toast.error('Cole a transcrição da ligação antes de analisar.'); return; }
    setLoading(true);
    try {
      const data: PromptData = {
        today: new Date().toLocaleDateString('pt-BR'),
        tenantName: lead.tenantName ?? 'SPY',
        clientName: lead.tenantName ?? 'SPY',
        pipelineName, stageName,
        leadName: lead.name, companyName: lead.company,
        sellerName: lead.seller ?? 'Não atribuído',
        productName: productName || 'Não informado',
        officialPrice: officialPrice || lead.value || 'Não informado',
        enrollmentFee: enrollmentFee || 'Não informado',
        installments: installments || 'Não informado',
        commercialRules: commercialRules || 'Nenhuma regra específica',
        crmNotes: lead.iaSummary ?? 'Sem notas',
        history: 'Veja histórico no CRM',
        transcript,
      };
      setResult(await analyzeCall(data));
    } catch (err: any) {
      toast.error(err.message ?? 'Erro ao analisar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateTask() {
    if (!result?.task) return;
    const combinedDate = `${result.task.date} ${result.task.time}`.trim();
    const parsed = new Date(combinedDate);
    addTask({
      title: result.task.title,
      description: result.task.description,
      priority: 'Alta',
      due_date: isNaN(parsed.getTime()) ? undefined : parsed.toISOString(),
      lead_id: lead.id,
      status: 'Em Aberto',
    });
    toast.success('Tarefa criada com sucesso!');
  }

  const body = (
    <div className={embedded ? undefined : 'flex-1 overflow-y-auto'}>
      {!result ? (
        <InputForm
          lead={lead}
          transcript={transcript} onTranscriptChange={setTranscript}
          productName={productName} onProductNameChange={setProductName}
          officialPrice={officialPrice} onOfficialPriceChange={setOfficialPrice}
          enrollmentFee={enrollmentFee} onEnrollmentFeeChange={setEnrollmentFee}
          installments={installments} onInstallmentsChange={setInstallments}
          commercialRules={commercialRules} onCommercialRulesChange={setCommercialRules}
          loading={loading} onAnalyze={handleAnalyze}
        />
      ) : (
        <ResultsView result={result} onCreateTask={handleCreateTask} onReset={() => setResult(null)} />
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col bg-[var(--color-surface)] border border-white/10 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">Revenue Intelligence</h2>
              <p className="text-[10px] text-slate-500">{lead.name} · {lead.company}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl border-none bg-transparent cursor-pointer transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
