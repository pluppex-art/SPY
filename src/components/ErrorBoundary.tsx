import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  /** Para boundaries locais (um formulário, um card) em vez da página inteira. */
  compact?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Extensões de navegador (gerenciadores de senha, principalmente) injetam
// nós no DOM assim que campos de e-mail/senha aparecem, fora do controle do
// React. Quando o React tenta reconciliar em volta desses nós estranhos,
// dispara um NotFoundError benigno e transitório — a remontagem seguinte se
// recupera sozinha. Tratar isso como uma tela de erro real é pior do que
// simplesmente tentar de novo automaticamente.
const BENIGN_DOM_RACE = /insertBefore|removeChild/;

// Algumas extensões (o gerenciador de senhas nativo do Chrome, entre
// outras) reinjetam nós repetidamente, então um teto baixo de tentativas
// esgota rápido. O contador "esfria" sozinho: se a última tentativa foi há
// mais de alguns segundos, tratamos como um novo início — só uma sequência
// rápida e contínua (sinal de um loop real, não a extensão) chega ao teto.
const MAX_AUTO_RETRIES = 8;
const RETRY_DECAY_MS = 4000;

// Depois de um deploy, os arquivos de chunk antigos (hash no nome) somem do
// servidor. Um navegador que ainda tem o index.html antigo em cache tenta
// buscar um chunk com hash velho, recebe o fallback HTML da SPA (vercel.json
// reescreve tudo pra index.html) e o browser rejeita por MIME type errado —
// vira exatamente este erro. Recarregar a página busca o index.html atual
// (agora sem cache, ver vercel.json) com os hashes corretos e resolve por
// conta própria; só a MARCA de que já tentamos fica em sessionStorage, pra
// não entrar num loop se o problema for outra coisa.
const CHUNK_LOAD_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;
const CHUNK_RELOAD_KEY = "spy_chunk_reload_at";
const CHUNK_RELOAD_COOLDOWN_MS = 10000;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  private autoRetryCount = 0;
  private lastRetryAt = 0;
  private retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (CHUNK_LOAD_ERROR.test(error.message)) {
      const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
      if (Date.now() - lastReload > CHUNK_RELOAD_COOLDOWN_MS) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
      // Já recarregamos há pouco e o erro voltou — não é cache velho, é um
      // problema real. Cai pro log + tela de erro normal abaixo.
      console.error("[S.P.Y.] Falha ao carregar chunk persistiu após reload:", error, info.componentStack);
      return;
    }

    const isBenignDomRace = error.name === "NotFoundError" && BENIGN_DOM_RACE.test(error.message);

    if (isBenignDomRace) {
      const now = Date.now();
      if (now - this.lastRetryAt > RETRY_DECAY_MS) this.autoRetryCount = 0;

      if (this.autoRetryCount < MAX_AUTO_RETRIES) {
        this.autoRetryCount += 1;
        this.lastRetryAt = now;
        console.warn("[S.P.Y.] DOM alterado por extensão do navegador — remontando automaticamente:", error.message);
        // Resetar em uma nova macrotask (não sincronamente aqui dentro do
        // componentDidCatch) é essencial: se o retry acontece na mesma pilha
        // síncrona, o navegador nunca chega a terminar de desmontar o nó
        // corrompido antes da próxima tentativa, e o mesmo erro se repete
        // instantaneamente em loop até estourar o teto. Adiar dá um "respiro"
        // real para o DOM se estabilizar entre tentativas.
        this.retryTimeoutId = setTimeout(() => this.setState({ error: null }), 60);
        return;
      }
    }

    console.error("[S.P.Y.] Erro de renderização capturado:", error, info.componentStack);
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) clearTimeout(this.retryTimeoutId);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey) {
      this.autoRetryCount = 0;
      if (this.state.error) this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.compact) {
        return (
          <div className="flex flex-col items-center justify-center gap-3 text-center p-6 border border-rose-500/20 bg-rose-500/5 rounded-2xl">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
              Não foi possível carregar esta parte da tela.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
            </button>
          </div>
        );
      }
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-rose-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Não foi possível carregar esta página</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-md">
              Ocorreu um erro inesperado ao renderizar este módulo. Você pode tentar novamente ou navegar para outra seção.
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
