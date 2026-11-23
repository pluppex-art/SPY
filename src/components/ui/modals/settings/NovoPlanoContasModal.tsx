import React, { useEffect, useMemo, useState } from "react";
import { FolderTree, Tag } from "lucide-react";
import { Modal } from "../../modal";
import { Field, FormSection, ModalFooter, ModalTitle, inputCls, selectCls } from "../../../../pages/finance/components/ModalKit";

export type FinanceCategorySubtipo = "DESPESA_FIXA" | "DESPESA_VARIAVEL" | "PESSOAS" | "IMPOSTOS";

type NovoPlanoContasPayload = {
    nome: string;
    tipo: "Receita" | "Despesa";
    subtipo: FinanceCategorySubtipo | null;
};

type NovoPlanoContasModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (payload: NovoPlanoContasPayload) => void;
    title?: string;
    submitText?: string;
    initialValue?: Partial<NovoPlanoContasPayload> | null;
};

const SUBTIPO_LABELS: Record<FinanceCategorySubtipo, string> = {
    DESPESA_FIXA: "Despesa Fixa",
    DESPESA_VARIAVEL: "Despesa Variável",
    PESSOAS: "Pessoas",
    IMPOSTOS: "Impostos",
};

export function NovoPlanoContasModal({
    isOpen,
    onClose,
    onSave,
    title = "Nova Categoria Financeira",
    submitText = "Cadastrar Categoria",
    initialValue,
}: NovoPlanoContasModalProps) {
    const [nome, setNome] = useState(initialValue?.nome || "");
    const [tipo, setTipo] = useState<"Receita" | "Despesa">(initialValue?.tipo || "Receita");
    const [subtipo, setSubtipo] = useState<FinanceCategorySubtipo>(initialValue?.subtipo || "DESPESA_VARIAVEL");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setNome(initialValue?.nome || "");
        setTipo(initialValue?.tipo || "Receita");
        setSubtipo(initialValue?.subtipo || "DESPESA_VARIAVEL");
        setLoading(false);
    }, [isOpen, initialValue]);

    const canSubmit = useMemo(() => {
        if (loading) return false;
        return Boolean(nome.trim());
    }, [loading, nome]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setLoading(true);
        try {
            onSave({ nome: nome.trim(), tipo, subtipo: tipo === "Despesa" ? subtipo : null });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg" title={<ModalTitle icon={FolderTree} title={title} subtitle="Plano de contas: classifica as receitas e despesas nos relatórios e no DRE." />}>
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <FormSection icon={Tag} title="Categoria">
                    <Field label="Nome da categoria" required>
                        <input id="plano-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls()} placeholder="Ex.: Software, Aluguel, Vendas PRO" required autoFocus />
                    </Field>
                    <Field label="Tipo" hint="Receita é dinheiro que entra; despesa é dinheiro que sai.">
                        <select id="plano-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "Receita" | "Despesa")} className={selectCls()}>
                            <option value="Receita">Receita</option>
                            <option value="Despesa">Despesa</option>
                        </select>
                    </Field>
                    {tipo === "Despesa" && (
                        <Field label="Classificação da despesa" hint="Define em que linha do DRE essa despesa entra.">
                            <select id="plano-subtipo" value={subtipo} onChange={(e) => setSubtipo(e.target.value as FinanceCategorySubtipo)} className={selectCls()}>
                                {(Object.keys(SUBTIPO_LABELS) as FinanceCategorySubtipo[]).map((s) => (
                                    <option key={s} value={s}>{SUBTIPO_LABELS[s]}</option>
                                ))}
                            </select>
                        </Field>
                    )}
                </FormSection>
                <ModalFooter onCancel={onClose} submitLabel={submitText} saving={loading} disabled={!canSubmit} />
            </form>
        </Modal>
    );
}
