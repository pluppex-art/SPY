import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, ExternalLink, FileText, MessageSquareWarning, Paperclip } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ROTULO_APROVACAO, type RespostaAprovacao, type SituacaoAprovacao } from "../../lib/aprovacaoConteudo";
import { cn } from "../../lib/utils";

interface Item {
  id: string; titulo: string; descricao: string; canal: string; formato: string; data: string; roteiro: string;
  hashtags: string[]; links: string[]; anexos: { url: string; nome: string }[];
  status: SituacaoAprovacao; resposta: RespostaAprovacao | null; versao: string; alterado: boolean;
}
interface Dados { empresa: string; cor: string | null; cliente: string; itens: Item[] }

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CHAVE_NOME = "spy_aprovacao_nome";
const IMAGEM = /\.(png|jpe?g|webp|gif)(\?.*)?$/i;

const SELO: Record<SituacaoAprovacao, { icone: typeof Clock; cor: string }> = {
  aguardando: { icone: Clock, cor: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovado: { icone: CheckCircle2, cor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ajustes: { icone: MessageSquareWarning, cor: "bg-rose-50 text-rose-700 border-rose-200" },
};

const mesDe = (data: string) => (data ? `${MESES[Number(data.slice(5, 7)) - 1]} ${data.slice(0, 4)}` : "Sem data definida");
const pendente = (i: Item) => i.status === "aguardando" || i.alterado;

/** Página pública em que o cliente confere o calendário de conteúdo e aprova (ou pede ajustes) cada publicação. */
export default function AprovacaoConteudoPublica() {
  const { token } = useParams<{ token: string }>();
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [erro, setErro] = useState("");
  // Quem estava pendente ao abrir continua na lista depois de respondido, para a pessoa ver o que acabou de fazer.
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<"pendentes" | "todos">("pendentes");
  const [nome, setNome] = useState(() => { try { return localStorage.getItem(CHAVE_NOME) || ""; } catch { return ""; } });

  // Página sem login: sempre no tema claro, sem herdar o tema escolhido no sistema.
  useEffect(() => {
    const root = document.documentElement;
    const escuro = root.classList.contains("dark");
    root.classList.remove("dark");
    const titulo = document.title;
    document.title = "Aprovação de conteúdo";
    return () => { root.classList.toggle("dark", escuro); document.title = titulo; };
  }, []);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const res = await fetch(`/api/public-aprovacao/${encodeURIComponent(token || "")}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.itens) { setErro(json?.error || "Não foi possível carregar os conteúdos."); setDados(null); return; }
      setDados(json);
      setAbertos(new Set((json.itens as Item[]).filter(pendente).map((i) => i.id)));
      if (!(json.itens as Item[]).some(pendente)) setAba("todos");
    } catch {
      setErro("Sem conexão. Verifique sua internet e tente de novo.");
      setDados(null);
    }
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);

  const trocarNome = (v: string) => { setNome(v); try { localStorage.setItem(CHAVE_NOME, v); } catch { /* navegação privada */ } };
  const atualizar = (item: Item) => setDados((d) => (d ? { ...d, itens: d.itens.map((i) => (i.id === item.id ? item : i)) } : d));

  const grupos = useMemo(() => {
    const lista = (dados?.itens ?? []).filter((i) => aba === "todos" || pendente(i) || abertos.has(i.id));
    const mapa = new Map<string, Item[]>();
    for (const i of lista) mapa.set(mesDe(i.data), [...(mapa.get(mesDe(i.data)) ?? []), i]);
    return [...mapa.entries()];
  }, [dados, aba, abertos]);

  if (dados === undefined) {
    return (
      <div className="min-h-dvh bg-slate-50 grid place-items-center">
        <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-600 rounded-full animate-spin" aria-label="Carregando" />
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="min-h-dvh bg-slate-50 grid place-items-center px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <p className="text-sm text-slate-700 mb-5">{erro}</p>
          <Button variant="outline" onClick={() => { setDados(undefined); void carregar(); }} className="text-xs h-9">Tentar de novo</Button>
        </div>
      </div>
    );
  }

  const cor = dados.cor || "#2563EB";
  const aguardando = dados.itens.filter(pendente).length;
  const aprovados = dados.itens.filter((i) => i.status === "aprovado" && !i.alterado).length;
  const ajustes = dados.itens.filter((i) => i.status === "ajustes" && !i.alterado).length;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200" style={{ borderTop: `4px solid ${cor}` }}>
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cor }}>{dados.empresa}</p>
          <h1 className="text-xl font-black">Aprovação de conteúdo{dados.cliente ? ` · ${dados.cliente}` : ""}</h1>
          <p className="text-sm text-slate-500">{aguardando} para responder · {aprovados} {aprovados === 1 ? "aprovado" : "aprovados"} · {ajustes} com ajustes</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block text-xs font-bold text-slate-700">
            Seu nome
            <input value={nome} onChange={(e) => trocarNome(e.target.value)} maxLength={80} autoComplete="name" placeholder="Quem está respondendo"
              className="mt-1 block w-64 max-w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500" />
          </label>
          <div className="flex rounded-lg border border-slate-300 bg-white overflow-hidden">
            {([["pendentes", `Para responder (${aguardando})`], ["todos", `Calendário completo (${dados.itens.length})`]] as const).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => setAba(id)} aria-pressed={aba === id}
                className={cn("h-10 px-3 text-xs font-bold cursor-pointer border-none", aba === id ? "!text-white" : "bg-white text-slate-600")}
                style={aba === id ? { backgroundColor: cor } : undefined}>{rotulo}</button>
            ))}
          </div>
        </div>

        {grupos.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-bold">Tudo respondido. Obrigado!</p>
          </div>
        )}

        {grupos.map(([mes, itens]) => (
          <section key={mes} className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><CalendarDays className="w-4 h-4" /> {mes}</h2>
            {itens.map((i) => <Cartao key={i.id} item={i} token={token!} nome={nome} cor={cor} onAtualizar={atualizar} />)}
          </section>
        ))}
      </main>
    </div>
  );
}

function Cartao({ item, token, nome, cor, onAtualizar }: { item: Item; token: string; nome: string; cor: string; onAtualizar: (i: Item) => void }) {
  const [pedindoAjuste, setPedindoAjuste] = useState(false);
  const [mudando, setMudando] = useState(false);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const s = SELO[item.status];
  const dia = item.data ? new Date(`${item.data}T12:00:00`) : null;
  const responder = pendente(item) || mudando;

  const enviar = async (decisao: "aprovado" | "ajustes") => {
    setAviso("");
    if (nome.trim().length < 2) { setAviso("Preencha o campo “Seu nome” no alto da página."); return; }
    if (decisao === "ajustes" && comentario.trim().length < 3) { setAviso("Escreva o que precisa mudar."); return; }
    setEnviando(true);
    try {
      const res = await fetch(`/api/public-aprovacao/${encodeURIComponent(token)}/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao, comentario, nome, versao: item.versao }),
      });
      const json = await res.json().catch(() => null);
      if (json?.item) onAtualizar(json.item);
      if (!res.ok) { setAviso(json?.error || "Não foi possível registrar sua resposta."); return; }
      setPedindoAjuste(false); setMudando(false); setComentario("");
    } catch {
      setAviso("Sem conexão. Sua resposta não foi enviada.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <article className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-14 shrink-0 rounded-xl border border-slate-200 text-center py-1.5">
          <span className="block text-[10px] font-bold uppercase text-slate-500">{dia ? SEMANA[dia.getDay()] : "—"}</span>
          <span className="block text-xl font-black leading-tight">{dia ? dia.getDate() : "?"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black break-words">{item.titulo}</h3>
          <p className="text-xs text-slate-500">{[item.canal, item.formato].filter(Boolean).join(" · ")}</p>
        </div>
        <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border shrink-0", s.cor)}>
          <s.icone className="w-3 h-3" /> {item.status === "aguardando" ? "Aguardando você" : ROTULO_APROVACAO[item.status]}
        </span>
      </div>

      {item.alterado && <p className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">Este conteúdo mudou depois da sua última resposta. Confira novamente.</p>}
      {item.descricao && <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{item.descricao}</p>}
      {item.roteiro && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="flex items-center gap-1.5 text-xs font-bold cursor-pointer"><FileText className="w-3.5 h-3.5" /> Texto / roteiro</summary>
          <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">{item.roteiro}</p>
        </details>
      )}
      {item.hashtags.length > 0 && <p className="text-xs text-blue-700 break-words">{item.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>}

      {item.anexos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {item.anexos.map((a) => IMAGEM.test(a.url) ? (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener" title={a.nome}>
              <img src={a.url} alt={a.nome} loading="lazy" className="h-40 max-w-full rounded-lg border border-slate-200 object-contain bg-slate-100" />
            </a>
          ) : (
            <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2 no-underline hover:bg-slate-50 max-w-full">
              <Paperclip className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{a.nome}</span>
            </a>
          ))}
        </div>
      )}
      {item.links.map((l) => (
        <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-xs text-blue-700 no-underline hover:underline">
          <ExternalLink className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{l}</span>
        </a>
      ))}

      {item.resposta && !item.alterado && (
        <p className="text-xs text-slate-500 border-t border-slate-100 pt-3 whitespace-pre-wrap break-words">
          <span className="font-bold text-slate-700">{item.resposta.nome}</span> {item.resposta.decisao === "aprovado" ? "aprovou" : "pediu ajustes"} em {new Date(item.resposta.em).toLocaleDateString("pt-BR")}
          {item.resposta.comentario ? `: ${item.resposta.comentario}` : "."}
        </p>
      )}

      {responder ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {pedindoAjuste && (
            <textarea autoFocus rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={2000} placeholder="O que precisa mudar?" aria-label="O que precisa mudar"
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-blue-500" />
          )}
          <div className="flex flex-wrap gap-2">
            {pedindoAjuste ? (
              <>
                <Button onClick={() => void enviar("ajustes")} disabled={enviando} className="h-10 px-4 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white">{enviando ? "Enviando..." : "Enviar pedido de ajuste"}</Button>
                <Button variant="ghost" onClick={() => { setPedindoAjuste(false); setAviso(""); }} disabled={enviando} className="h-10 px-4 text-xs font-bold">Voltar</Button>
              </>
            ) : (
              <>
                <Button onClick={() => void enviar("aprovado")} disabled={enviando} className="h-10 px-5 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"><CheckCircle2 className="w-4 h-4" /> {enviando ? "Enviando..." : "Aprovar"}</Button>
                <Button variant="outline" onClick={() => { setPedindoAjuste(true); setAviso(""); }} disabled={enviando} className="h-10 px-4 text-xs font-bold gap-1.5"><MessageSquareWarning className="w-4 h-4" /> Pedir ajuste</Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setMudando(true)} className="text-xs font-bold bg-transparent border-none p-0 cursor-pointer" style={{ color: cor }}>Mudar minha resposta</button>
      )}
      {aviso && <p role="alert" className="text-xs font-bold text-rose-700">{aviso}</p>}
    </article>
  );
}
