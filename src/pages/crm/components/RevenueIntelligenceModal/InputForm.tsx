import { Brain, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

interface InputFormProps {
  lead: any;
  transcript: string;
  onTranscriptChange: (v: string) => void;
  productName: string;
  onProductNameChange: (v: string) => void;
  officialPrice: string;
  onOfficialPriceChange: (v: string) => void;
  enrollmentFee: string;
  onEnrollmentFeeChange: (v: string) => void;
  installments: string;
  onInstallmentsChange: (v: string) => void;
  commercialRules: string;
  onCommercialRulesChange: (v: string) => void;
  loading: boolean;
  onAnalyze: () => void;
}

export function InputForm({
  lead,
  transcript, onTranscriptChange,
  productName, onProductNameChange,
  officialPrice, onOfficialPriceChange,
  enrollmentFee, onEnrollmentFeeChange,
  installments, onInstallmentsChange,
  commercialRules, onCommercialRulesChange,
  loading, onAnalyze,
}: InputFormProps) {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Produto', value: productName, onChange: onProductNameChange, placeholder: 'Ex: Mentoria Premium' },
          { label: 'Valor Oficial', value: officialPrice, onChange: onOfficialPriceChange, placeholder: lead.value || 'Ex: R$ 3.000' },
          { label: 'Taxa de Matrícula', value: enrollmentFee, onChange: onEnrollmentFeeChange, placeholder: 'Ex: R$ 500' },
          { label: 'Parcelamento', value: installments, onChange: onInstallmentsChange, placeholder: 'Ex: 12x R$ 250' },
        ].map(({ label, value, onChange, placeholder }) => (
          <div key={label} className="space-y-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{label}</label>
            <input
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-[var(--color-surface)] border border-white/5 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500/40 placeholder:text-slate-600"
            />
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Regras Comerciais (opcional)</label>
        <input
          value={commercialRules}
          onChange={e => onCommercialRulesChange(e.target.value)}
          placeholder="Ex: Desconto máx 10%, não negociar matrícula"
          className="w-full bg-[var(--color-surface)] border border-white/5 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500/40 placeholder:text-slate-600"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">
          Transcrição da Ligação <span className="text-rose-400">*</span>
        </label>
        <textarea
          value={transcript}
          onChange={e => onTranscriptChange(e.target.value)}
          placeholder="Cole aqui a transcrição completa da ligação, reunião ou mensagens de WhatsApp..."
          rows={10}
          className="w-full bg-[var(--color-surface)] border border-white/5 text-xs text-white rounded-xl px-3 py-3 focus:outline-none focus:border-blue-500/40 resize-none placeholder:text-slate-600 font-mono leading-relaxed"
        />
        <p className="text-[9px] text-slate-600">{transcript.length} caracteres</p>
      </div>

      <Button
        onClick={onAnalyze}
        disabled={loading || !transcript.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 text-xs font-black uppercase tracking-widest gap-2 disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Analisando com IA...</>
        ) : (
          <><Brain className="w-4 h-4" /> Analisar Ligação</>
        )}
      </Button>
    </div>
  );
}
