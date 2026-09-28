import { Building2, Hash, Building, LinkIcon, AlertTriangle, Target } from "lucide-react";
import { FormField } from "../form-field";
import { Input } from "../input";
import { CityAutocomplete } from "../CityAutocomplete";

type CnpjStatus = { status: "idle" | "checking" | "active" | "inactive" | "invalid"; message?: string };

interface CompanyBlockProps {
  cnpjValue: string;
  handleCnpjChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  cnpjStatus: CnpjStatus;
  isCnpjDuplicate: boolean;
  companyValue: string;
  setCompanyValue: (v: string) => void;
  cidadeValue: string;
  setCidadeValue: (v: string) => void;
}

export function CompanyBlock({
  cnpjValue, handleCnpjChange, cnpjStatus, isCnpjDuplicate, companyValue, setCompanyValue,
  cidadeValue, setCidadeValue,
}: CompanyBlockProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black text-[var(--color-text-primary)] border-b border-[var(--color-border-subtle)] pb-2 flex items-center gap-2 uppercase tracking-wider">
        <Building2 className="w-3.5 h-3.5 text-emerald-500" /> Dados da Empresa
      </h4>

      <div className="p-4 bg-[var(--color-surface-sunken)] rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] space-y-3.5">
        <FormField
          label="Documento CNPJ"
          hint="Digite os 14 dígitos para buscar na Receita Federal"
          error={isCnpjDuplicate ? "CNPJ já cadastrado no CRM" : undefined}
        >
          <Input
            name="cnpj"
            maxLength={18}
            value={cnpjValue}
            onChange={handleCnpjChange}
            type="text"
            className="font-mono"
            placeholder="00.000.000/0000-00"
          />
          <div className="mt-1.5 min-h-[20px]">
            {cnpjStatus.status === "checking" && (
              <p className="text-[10px] text-[var(--color-primary-blue)] animate-pulse font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] animate-ping" /> Consultando Receita Federal...
              </p>
            )}
            {cnpjStatus.status === "active" && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <Target className="w-3 h-3" /> CNPJ Validado e Ativo
              </p>
            )}
            {cnpjStatus.status === "inactive" && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Situação: {cnpjStatus.message}
              </p>
            )}
            {cnpjStatus.status === "invalid" && (
              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {cnpjStatus.message}
              </p>
            )}
          </div>
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Razão Social / Nome Fantasia">
            <Input
              name="company"
              type="text"
              value={companyValue}
              onChange={(e) => setCompanyValue(e.target.value)}
              placeholder="Nome da empresa..."
            />
          </FormField>
          <FormField label="Cidade" hint="Busca no IBGE — ou preenchida automaticamente ao validar o CNPJ">
            <CityAutocomplete
              name="cidade"
              value={cidadeValue}
              onChange={setCidadeValue}
              placeholder="Buscar cidade..."
              className="flex h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] ring-offset-[var(--color-surface)] placeholder:text-[var(--color-text-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)] focus-visible:ring-offset-2 transition-all"
            />
          </FormField>
        </div>

        <FormField label="Website Corporativo">
          <Input
            name="website"
            type="url"
            placeholder="https://www.empresa.com.br"
          />
        </FormField>
      </div>
    </div>
  );
}
