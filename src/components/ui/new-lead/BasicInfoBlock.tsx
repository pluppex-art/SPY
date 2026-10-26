import { User, Mail, Phone, Tag, Users, Target, AlertTriangle } from "lucide-react";
import { FormField } from "../form-field";
import { Input } from "../input";

interface BasicInfoBlockProps {
  emailValue: string;
  setEmailValue: (v: string) => void;
  phoneValue: string;
  handlePhoneChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isEmailDuplicate: boolean;
  selectedSeller: string;
  setSelectedSeller: (v: string) => void;
  sellerOptions: string[];
  sellerPipelineId: string;
  sellerCargoLabel: string;
  valueEstimate?: string;
  setValueEstimate?: (v: string) => void;
  /** Origens configuradas em Configurações › CRM › Origens (+ as já usadas nos leads). */
  origemOptions?: string[];
}

export function BasicInfoBlock({
  emailValue, setEmailValue, phoneValue, handlePhoneChange, isEmailDuplicate,
  selectedSeller, setSelectedSeller, sellerOptions, sellerPipelineId, sellerCargoLabel,
  valueEstimate, setValueEstimate, origemOptions = [],
}: BasicInfoBlockProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black text-[var(--color-text-primary)] border-b border-[var(--color-border-subtle)] pb-2 flex items-center gap-2 uppercase tracking-wider">
        <User className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Informações do Contato
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField label="Nome do Contato" required>
          <Input name="name" required type="text" placeholder="Nome completo do lead" />
        </FormField>

        <FormField label="Valor Estimado / Negócio (R$)">
          <Input
            name="value"
            type="text"
            value={valueEstimate || ""}
            onChange={(e) => setValueEstimate?.(e.target.value)}
            placeholder="Ex: R$ 5.000,00"
            className="font-mono text-emerald-600 dark:text-emerald-400 font-bold"
          />
        </FormField>

        <FormField label="Cargo / Sufixo (Opcional)">
          <Input name="nameSuffix" type="text" placeholder="Ex: Diretor de TI, Dr." />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="E-mail Comercial"
          error={isEmailDuplicate ? "Este e-mail já existe na base do CRM" : undefined}
        >
          <Input
            name="email"
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            placeholder="contato@empresa.com"
          />
        </FormField>

        <FormField label="Celular / WhatsApp">
          <Input
            name="phone"
            type="tel"
            value={phoneValue}
            onChange={handlePhoneChange}
            maxLength={15}
            className="font-mono"
            placeholder="(00) 00000-0000"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--color-border-subtle)]">
        <FormField label="Origem de Aquisição">
          <select name="source" defaultValue="" className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-9">
            <option value="">Selecione a origem…</option>
            {origemOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>

        <FormField label="Responsável Comercial">
          <select
            name="seller"
            value={selectedSeller}
            onChange={(e) => setSelectedSeller(e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-9"
          >
            {sellerOptions.length > 0
              ? sellerOptions.map(s => <option key={s} value={s}>{s}</option>)
              : <option value="" disabled>Nenhum vendedor cadastrado</option>
            }
          </select>
          {selectedSeller && (
            <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${sellerPipelineId === "sdr" ? "text-purple-600 dark:text-purple-400" : "text-[var(--color-primary-blue)]"}`}>
              <Target className="w-3 h-3" /> Funil: {sellerCargoLabel}
            </p>
          )}
        </FormField>
      </div>
    </div>
  );
}
