import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, Phone, Mail, Star, MapPin, Bed, Bath, Car, Home, MessageCircle, ChevronLeft } from "lucide-react";
import { Card } from "../../components/ui/card";
import { fetchPublicCorretorPortfolio, PublicCorretorPortfolio, PublicCorretorImovel } from "../../lib/publicCorretor";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "Disponível": "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    "Vendido": "bg-slate-500/20 text-slate-400 border border-slate-500/30",
    "Locado": "bg-violet-500/20 text-violet-400 border border-violet-500/30",
    "Reservado": "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  };
  return <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${colors[status] || "bg-slate-500/20 text-slate-400"}`}>{status}</span>;
}

function formatValor(operacao: string, valor: number) {
  if (operacao === "Locação") return `R$ ${valor.toLocaleString("pt-BR")}/mês`;
  if (valor >= 1000000) return `R$ ${(valor / 1000000).toFixed(1).replace(".", ",")}M`;
  return `R$ ${(valor / 1000).toFixed(0)}k`;
}

export default function PortfolioCorretor() {
  const { slug } = useParams<{ slug: string }>();
  const [corretor, setCorretor] = useState<PublicCorretorPortfolio | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicCorretorPortfolio(slug || "").then((data) => {
      if (!cancelled) {
        setCorretor(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-center text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20 animate-pulse" />
          <p className="font-bold">Carregando portfólio...</p>
        </div>
      </div>
    );
  }

  if (!corretor) {
    return (
      <div className="min-h-dvh bg-[var(--color-surface)] flex items-center justify-center">
        <div className="text-center">
          <Building2 className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">Corretor não encontrado</h1>
          <p className="text-slate-500">O link que você acessou pode estar desatualizado.</p>
        </div>
      </div>
    );
  }

  const phoneRaw = (corretor.telefone || "").replace(/\D/g, "");
  const whatsappLink = `https://wa.me/55${phoneRaw}?text=${encodeURIComponent(`Olá ${corretor.nome}! Vi seu portfólio e gostaria de saber mais sobre os imóveis disponíveis.`)}`;

  const disponiveis = corretor.imoveis.filter(i => i.status === "Disponível");
  const outros = corretor.imoveis.filter(i => i.status !== "Disponível");

  return (
    <div className="min-h-dvh bg-[var(--color-surface)] text-white">
      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 via-[var(--color-surface)] to-violet-900/20" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-black text-slate-400">S.P.Y. CRM</span>
            </div>
            <a href="/" className="flex items-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" /> Voltar ao site
            </a>
          </div>

          {/* Perfil do corretor */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-8">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-black text-3xl shadow-2xl shadow-blue-900/30 shrink-0">
              {corretor.nome.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <h1 className="text-3xl font-black text-white mb-1">{corretor.nome}</h1>
              <p className="text-sm text-blue-400 font-bold mb-2">
                {corretor.especialidade}{corretor.creci ? ` · ${corretor.creci}` : ""}
              </p>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-1 text-amber-400">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`w-4 h-4 ${i <= Math.floor(corretor.avaliacao) ? "fill-current" : "opacity-30"}`} />
                  ))}
                  <span className="font-black ml-1">{corretor.avaliacao}</span>
                </div>
                <span className="text-slate-600">·</span>
                <span>{corretor.totalVendas} negócios realizados</span>
              </div>
            </div>
          </div>

          {corretor.bio && <p className="text-slate-400 text-sm leading-relaxed max-w-2xl mb-8">{corretor.bio}</p>}

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            {phoneRaw && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-900/30 text-sm"
              >
                <MessageCircle className="w-4 h-4" /> Falar no WhatsApp
              </a>
            )}
            {corretor.telefone && (
              <a
                href={`tel:${corretor.telefone}`}
                className="flex items-center gap-2.5 px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10 text-sm"
              >
                <Phone className="w-4 h-4" /> {corretor.telefone}
              </a>
            )}
            {corretor.email && (
              <a
                href={`mailto:${corretor.email}`}
                className="flex items-center gap-2.5 px-6 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all border border-white/10 text-sm"
              >
                <Mail className="w-4 h-4" /> E-mail
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        {/* Stats rápidas */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
            <Building2 className="w-5 h-5 text-indigo-500 mb-4" />
            <div className="text-2xl font-display font-black text-white mb-1 italic">{corretor.imoveis.length}</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Imóveis no Portfólio</div>
          </Card>
          <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
            <Home className="w-5 h-5 text-emerald-500 mb-4" />
            <div className="text-2xl font-display font-black text-white mb-1 italic">{disponiveis.length}</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Disponíveis Agora</div>
          </Card>
          <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
            <Star className="w-5 h-5 text-amber-500 mb-4" />
            <div className="text-2xl font-display font-black text-white mb-1 italic">{corretor.avaliacao}</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avaliação Média</div>
          </Card>
        </div>

        {/* Imóveis disponíveis */}
        {disponiveis.length > 0 && (
          <div className="mb-10">
            <h2 className="text-base font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-500 rounded-full" /> Disponíveis
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {disponiveis.map(im => (
                <ImovelCard key={im.id} imovel={im} corretorNome={corretor.nome} phoneRaw={phoneRaw} />
              ))}
            </div>
          </div>
        )}

        {/* Outros imóveis */}
        {outros.length > 0 && (
          <div>
            <h2 className="text-base font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-slate-600 rounded-full" /> Histórico de Imóveis
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {outros.map(im => (
                <ImovelCard key={im.id} imovel={im} corretorNome={corretor.nome} phoneRaw={phoneRaw} dimmed />
              ))}
            </div>
          </div>
        )}

        {corretor.imoveis.length === 0 && (
          <div className="text-center py-20 text-slate-600">
            <Building2 className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="font-bold text-lg">Nenhum imóvel cadastrado ainda</p>
            <p className="text-sm mt-1">Entre em contato para ver as opções disponíveis.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>Portfólio gerado por <span className="text-blue-500 font-bold">S.P.Y. CRM</span></span>
          {corretor.creci && <span>{corretor.creci}</span>}
        </div>
      </footer>
    </div>
  );
}

function ImovelCard({ imovel: im, corretorNome, phoneRaw, dimmed = false }: {
  imovel: PublicCorretorImovel;
  corretorNome: string;
  phoneRaw: string;
  dimmed?: boolean;
}) {
  const whatsappLink = `https://wa.me/55${phoneRaw}?text=${encodeURIComponent(`Olá ${corretorNome}! Tenho interesse no imóvel "${im.titulo}". Pode me passar mais informações?`)}`;

  return (
    <div className={`bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all ${dimmed ? "opacity-60 hover:opacity-80" : ""}`}>
      <div className="h-44 bg-gradient-to-br from-blue-900/20 to-violet-900/20 flex items-center justify-center relative">
        <Building2 className="w-12 h-12 text-white/10" />
        <div className="absolute top-3 left-3 flex gap-2">
          <StatusBadge status={im.status} />
        </div>
        <div className="absolute top-3 right-3">
          <span className="text-[10px] font-black px-2 py-1 rounded-full bg-black/40 text-white">{im.tipo}</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-black text-white text-sm mb-1">{im.titulo}</h3>
        <p className="text-[11px] text-slate-500 flex items-center gap-1 mb-3">
          <MapPin className="w-3 h-3" />{im.bairro}, {im.cidade}
        </p>
        {im.descricao && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{im.descricao}</p>}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-4">
          {im.quartos > 0 && <span className="flex items-center gap-1"><Bed className="w-3 h-3" />{im.quartos} quartos</span>}
          <span className="flex items-center gap-1"><Bath className="w-3 h-3" />{im.banheiros} banheiros</span>
          {im.vagas > 0 && <span className="flex items-center gap-1"><Car className="w-3 h-3" />{im.vagas} vagas</span>}
          <span className="flex items-center gap-1"><Home className="w-3 h-3" />{im.area}m²</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-500">{im.operacao === "Locação" ? "Aluguel" : "Valor"}</p>
            <p className="text-xl font-black text-white">{formatValor(im.operacao, im.valor)}</p>
          </div>
          {im.status === "Disponível" && phoneRaw && (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all text-[11px]"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Tenho Interesse
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
