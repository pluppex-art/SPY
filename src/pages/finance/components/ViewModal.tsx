import React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { FormSection, InfoRow, ModalTitle } from "./ModalKit";

type IconType = React.ComponentType<{ className?: string }>;

export interface ViewSection {
  icon: IconType;
  title: string;
  /** Linhas chave/valor; linhas com valor `null`/`undefined` são ocultadas. */
  rows: { label: string; value: React.ReactNode; mono?: boolean }[];
}

interface ViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  icon: IconType;
  title: string;
  subtitle?: string;
  tone?: "primary" | "success" | "danger" | "warning";
  /** Selo/valor em destaque no topo (ex.: valor e status). */
  highlight?: React.ReactNode;
  sections: ViewSection[];
  /** Conteúdo extra (listas, anexos...) abaixo das seções. */
  children?: React.ReactNode;
  /** "Editar" abre o modal de edição (o chamador fecha este modal). */
  onEdit?: () => void;
  /** "Novo" abre o modal de lançamento/cadastro novo. */
  onNew?: () => void;
  newLabel?: string;
  onDelete?: () => void;
}

/**
 * Modal de visualização padrão do Financeiro: abre pelo ícone de olho na linha e traz,
 * no rodapé, os atalhos para Editar e para criar um novo registro.
 */
export function ViewModal({
  isOpen, onClose, icon, title, subtitle, tone, highlight, sections, children, onEdit, onNew, newLabel = "Novo", onDelete,
}: ViewModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<ModalTitle icon={icon} title={title} subtitle={subtitle} tone={tone} />}
      maxWidth="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            {onDelete && (
              <Button variant="ghost" onClick={onDelete} className="h-9 px-3 text-xs font-bold gap-1.5 text-rose-500 hover:text-rose-600">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" onClick={onClose} className="h-9 px-3 text-xs font-bold">Fechar</Button>
            {onNew && (
              <Button variant="ghost" onClick={onNew} className="h-9 px-3 text-xs font-bold gap-1.5 border border-[var(--color-border-default)]">
                <Plus className="w-3.5 h-3.5" /> {newLabel}
              </Button>
            )}
            {onEdit && (
              <Button onClick={onEdit} className="h-9 px-4 text-xs font-bold gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {highlight && <div className="flex items-center justify-between gap-3 flex-wrap">{highlight}</div>}
        {sections.map((s) => {
          const rows = s.rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== false);
          if (rows.length === 0) return null;
          return (
            <FormSection key={s.title} icon={s.icon} title={s.title}>
              <div className="space-y-2">
                {rows.map((r) => <InfoRow key={r.label} label={r.label} value={r.value} mono={r.mono} />)}
              </div>
            </FormSection>
          );
        })}
        {children}
      </div>
    </Modal>
  );
}
