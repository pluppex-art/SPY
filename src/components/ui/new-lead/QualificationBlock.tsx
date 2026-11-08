import { Briefcase, Sparkles } from "lucide-react";
import { AI_OUTSIDE_AURORA_ENABLED } from "../../../lib/featureFlags";
import { Button } from "../button";
import { FormField } from "../form-field";
import { Input } from "../input";

interface QualificationBlockProps {
  teamSize: string;
  setTeamSize: (v: string) => void;
  currentRole: string;
  setCurrentRole: (v: string) => void;
  linkedinLink: string;
  setLinkedinLink: (v: string) => void;
  tags: string;
  setTags: (v: string) => void;
  aiLoading: boolean;
  suggestTags: (e: React.MouseEvent) => void;
  isMaster: boolean;
  selectedTenant: string;
  setSelectedTenant: (v: string) => void;
  allTenantModules: Record<string, any>;
}

/**
 * Removido "Produtos de Interesse" (checkboxes marcadas aqui, na criação do
 * lead) — bug real: `lead.productIds` era preenchido por isso E pela venda
 * de verdade (AddProdutoLeadModal), sem distinção. 8 leads da Pluppex
 * tinham os mesmos produtos "marcados como interesse" na qualificação e
 * nunca fecharam negócio nenhum, mas apareciam com "Produto (catálogo):
 * R$2.997" no Lead Details/card do Kanban como se fosse uma venda real (ver
 * ProfileSection.tsx/LeadCard.tsx). Seleção de produto agora só existe
 * dentro da criação de proposta de verdade (CriarPropostaModal.tsx já tem
 * isso), nunca mais aqui.
 */
export function QualificationBlock({
  teamSize, setTeamSize, currentRole, setCurrentRole, linkedinLink, setLinkedinLink,
  tags, setTags, aiLoading, suggestTags, isMaster, selectedTenant, setSelectedTenant,
  allTenantModules,
}: QualificationBlockProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-xs font-black text-[var(--color-text-primary)] border-b border-[var(--color-border-subtle)] pb-2 flex items-center gap-2 uppercase tracking-wider">
        <Briefcase className="w-3.5 h-3.5 text-purple-500" /> Qualificação & Produtos
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField label="Porte da Empresa">
          <select
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-9"
          >
            <option value="">Indefinido</option>
            <option value="1-10">1 a 10 colaboradores</option>
            <option value="11-50">11 a 50 colaboradores</option>
            <option value="51-200">51 a 200 colaboradores</option>
            <option value="200+">Grande Empresa (+200)</option>
          </select>
        </FormField>

        <div className="md:col-span-2">
          <FormField label="Cargo do Decisor">
            <Input
              name="currentRole"
              type="text"
              value={currentRole}
              onChange={(e) => setCurrentRole(e.target.value)}
              placeholder="Ex: Diretor Comercial, CEO, Gerente de TI"
            />
          </FormField>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Interesse Principal">
          <Input
            name="lead_interesse_cliente"
            type="text"
            placeholder="Ex: Consultoria, Licença Enterprise..."
          />
        </FormField>
        <FormField label="Perfil LinkedIn">
          <Input
            name="linkedinLink"
            type="url"
            value={linkedinLink}
            onChange={(e) => setLinkedinLink(e.target.value)}
            placeholder="https://linkedin.com/in/..."
          />
        </FormField>
      </div>

      {isMaster && (
        <div className="p-3.5 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 rounded-[var(--radius-control)]">
          <FormField label="Distribuição de Tenant (Master)">
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-9"
            >
              {Object.keys(allTenantModules).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </FormField>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
            Notas & Tags do Lead
          </label>
          {AI_OUTSIDE_AURORA_ENABLED && <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={suggestTags}
            disabled={aiLoading}
            className="h-7 text-[10px] gap-1 font-bold"
          >
            <Sparkles className="w-3 h-3 text-purple-500" /> {aiLoading ? "Gerando..." : "Sugerir Tags (IA)"}
          </Button>}
        </div>
        <textarea
          name="notes"
          rows={2}
          className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all resize-none"
          placeholder="Anotações iniciais sobre a oportunidade..."
        />
        <Input
          name="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          type="text"
          placeholder="Tags separadas por vírgula (ex: inbound, enterprise, urgente)"
        />
      </div>
    </div>
  );
}
