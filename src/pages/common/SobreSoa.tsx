import { Link } from "react-router-dom";
import { ArrowRight, Boxes, Cog, Bot, Radar, Handshake, FileSignature, Wallet, BarChart3, MessageCircle, Sparkles } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Logo } from "../../components/ui/Logo";
import { useAuth } from "../../contexts/AuthContext";

const PILARES = [
  { letra: "S", palavra: "Sistema", icon: Boxes, texto: "Tudo num só lugar: leads, conversas, propostas, contratos, agenda, estoque e financeiro usam a mesma base de dados. Acabou o vai e volta entre planilhas e ferramentas soltas." },
  { letra: "O", palavra: "Operacional", icon: Cog, texto: "Não é só um painel para olhar: é onde a operação da empresa acontece no dia a dia, da primeira mensagem do cliente até o dinheiro entrar no caixa." },
  { letra: "A", palavra: "Autônomo", icon: Bot, texto: "Ele trabalha sozinho: registra as conversas, atualiza o funil, lembra o time, cobra o que está atrasado e aponta o próximo passo. A Aurora, a assistente de IA, acompanha tudo." },
];

const CICLO = [
  { titulo: "Captura", icon: Radar, texto: "O lead chega por WhatsApp, site ou anúncio e já entra no funil." },
  { titulo: "Conversa", icon: MessageCircle, texto: "As conversas são registradas e o histórico fica com o lead." },
  { titulo: "Fecha", icon: Handshake, texto: "Proposta, negociação e venda acompanhadas até o ganho." },
  { titulo: "Contrata", icon: FileSignature, texto: "Contrato e assinatura saem do mesmo cadastro, sem redigitar." },
  { titulo: "Recebe", icon: Wallet, texto: "A venda vira receita no financeiro, com cobrança e conciliação." },
  { titulo: "Decide", icon: BarChart3, texto: "Painéis e DRE mostram o resultado para a próxima decisão." },
];

export default function SobreSoa() {
  const { user } = useAuth();
  return (
    <PageContainer title="Conheça o SOA" description="Sistema Operacional Autônomo: o que ele é e como funciona.">
      <div className="max-w-5xl mx-auto space-y-10 pb-12">
        <section className="rounded-[var(--radius-panel-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-6 md:p-10 flex flex-col md:flex-row items-center gap-8">
          <div className="shrink-0"><Logo variant="full" size={64} /></div>
          <div className="text-center md:text-left">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--color-primary-blue)]">S.P.Y. SOA</p>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-[var(--color-text-primary)] mt-1">Sistema Operacional Autônomo</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-3 leading-relaxed">
              {user?.name ? `${user.name.split(" ")[0]}, o` : "O"} SOA é o sistema que roda a operação da sua empresa e trabalha sozinho por você: atende, organiza, cobra e mostra o resultado. Você acompanha e decide; ele cuida do resto.
            </p>
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-faint)] mb-4">O que cada palavra significa</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {PILARES.map((p) => (
              <div key={p.letra} className="rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)] text-white flex items-center justify-center text-xl font-black">{p.letra}</span>
                  <div>
                    <p className="text-base font-black text-[var(--color-text-primary)] leading-tight">{p.palavra}</p>
                    <p.icon className="w-4 h-4 text-[var(--color-text-faint)] mt-0.5" />
                  </div>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{p.texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text-faint)] mb-4">Do primeiro contato ao caixa, no mesmo lugar</h3>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
            {CICLO.map((c, i) => (
              <li key={c.titulo} className="rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 flex gap-3">
                <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center"><c.icon className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[var(--color-text-primary)]"><span className="text-[var(--color-text-faint)] mr-1.5">{i + 1}</span>{c.titulo}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">{c.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[var(--radius-panel)] border border-[var(--color-primary-blue)]/25 bg-[var(--color-primary-blue)]/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <Sparkles className="w-6 h-6 text-[var(--color-primary-blue)] shrink-0" />
          <p className="flex-1 text-sm text-[var(--color-text-primary)] leading-relaxed">
            <strong>Autônomo não quer dizer sem você.</strong> Ações importantes, como enviar proposta ou mexer em dinheiro, seguem as permissões e regras que a sua empresa define.
          </p>
          <Link to="/app/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-xs font-bold no-underline shrink-0">
            Ir para o painel <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </div>
    </PageContainer>
  );
}
