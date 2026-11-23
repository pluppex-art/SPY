import React, { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type NovaPautaPayload = {
    titulo: string;
    descricao: string;
    data: string;
    hora: string;
    responsavel: string;
    participantes: string;
};

type NovaPautaModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (payload: NovaPautaPayload) => void;
    title?: string;
    submitText?: string;
    initialValue?: Partial<NovaPautaPayload> | null;
};

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputBaseClass =
    "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

export function NovaPautaModal({
    isOpen,
    onClose,
    onSave,
    title = "Nova Pauta",
    submitText = "Criar Pauta",
    initialValue,
}: NovaPautaModalProps) {
    const [titulo, setTitulo] = useState(initialValue?.titulo || "");
    const [descricao, setDescricao] = useState(initialValue?.descricao || "");
    const [data, setData] = useState(initialValue?.data || "");
    const [hora, setHora] = useState(initialValue?.hora || "");
    const [responsavel, setResponsavel] = useState(initialValue?.responsavel || "");
    const [participantes, setParticipantes] = useState(initialValue?.participantes || "");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setTitulo(initialValue?.titulo || "");
        setDescricao(initialValue?.descricao || "");
        setData(initialValue?.data || "");
        setHora(initialValue?.hora || "");
        setResponsavel(initialValue?.responsavel || "");
        setParticipantes(initialValue?.participantes || "");
        setLoading(false);
    }, [isOpen, initialValue]);

    const canSubmit = useMemo(() => {
        if (loading) return false;
        return Boolean(titulo.trim() && data.trim() && responsavel.trim());
    }, [loading, titulo, data, responsavel]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setLoading(true);
        try {
            onSave({
                titulo: titulo.trim(),
                descricao: descricao.trim(),
                data: data.trim(),
                hora: hora.trim(),
                responsavel: responsavel.trim(),
                participantes: participantes.trim(),
            });
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            maxWidth="max-w-2xl"
            title={
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center mt-0.5">
                        <Calendar className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="leading-tight">
                        <div className="text-base font-black text-white">{title}</div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                            Agenda de reuniões e pautas
                        </div>
                    </div>
                </div>
            }
            footer={
                <>
                    <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={loading}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="nova-pauta-form" className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-6" disabled={!canSubmit}>
                        {loading ? "Processando..." : submitText}
                    </Button>
                </>
            }
        >
            <form id="nova-pauta-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className={labelClass}>Título da Pauta *</label>
                    <input
                        type="text"
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        placeholder="Ex: Discussão de estratégia Q2"
                        className={inputBaseClass}
                        required
                    />
                </div>

                <div>
                    <label className={labelClass}>Descrição</label>
                    <textarea
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        placeholder="Detalhes e contexto da pauta..."
                        className={`${inputBaseClass} resize-none h-24`}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Data *</label>
                        <input
                            type="date"
                            value={data}
                            onChange={(e) => setData(e.target.value)}
                            className={inputBaseClass}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Hora</label>
                        <input
                            type="time"
                            value={hora}
                            onChange={(e) => setHora(e.target.value)}
                            className={inputBaseClass}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Responsável *</label>
                    <input
                        type="text"
                        value={responsavel}
                        onChange={(e) => setResponsavel(e.target.value)}
                        placeholder="Nome do facilitador"
                        className={inputBaseClass}
                        required
                    />
                </div>

                <div>
                    <label className={labelClass}>Participantes</label>
                    <input
                        type="text"
                        value={participantes}
                        onChange={(e) => setParticipantes(e.target.value)}
                        placeholder="Nomes separados por vírgula"
                        className={inputBaseClass}
                    />
                </div>
            </form>
        </Modal>
    );
}
