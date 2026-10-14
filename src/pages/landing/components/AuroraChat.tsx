import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

const Q1 = "Quais são meus compromissos amanhã?";
const A1 = "Consulto a sua agenda do Google Calendar conectada e listo horário, local e link da reunião.";
const Q2 = "Quais tarefas estão atrasadas?";
const A2 = "Consulto as suas tarefas do Google Tarefas conectado e destaco as que já passaram do prazo.";

type Phase = "idle" | "q1" | "t1" | "a1" | "q2" | "t2" | "a2";
const ORDER: Phase[] = ["idle", "q1", "t1", "a1", "q2", "t2", "a2"];

/** Conversa ilustrativa: digita as duas perguntas de exemplo e mostra as respostas, uma vez ao entrar na viewport. */
export function AuroraChat() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [phase, setPhase] = useState<Phase>(reduce ? "a2" : "idle");
  const [typed, setTyped] = useState(reduce ? 999 : 0);

  const at = (p: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(p);

  useEffect(() => {
    if (reduce || !inView) return;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(window.setTimeout(r, ms)));
    const type = async (len: number) => {
      for (let i = 1; i <= len; i++) {
        if (cancelled) return;
        setTyped(i);
        await wait(28);
      }
    };
    (async () => {
      await wait(300);
      setPhase("q1");
      await type(Q1.length);
      await wait(250);
      setPhase("t1");
      await wait(1100);
      setPhase("a1");
      await wait(900);
      setTyped(0);
      setPhase("q2");
      await type(Q2.length);
      await wait(250);
      setPhase("t2");
      await wait(1100);
      setPhase("a2");
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [inView, reduce]);

  const typedText = (full: string, active: boolean, done: boolean) =>
    done ? full : (
      <>
        {full.slice(0, active ? typed : 0)}
        <span style={{ visibility: "hidden" }}>{full.slice(active ? typed : 0)}</span>
      </>
    );

  const q1Done = at("t1");
  const q2Done = at("t2");

  return (
    <div className="sp-chat" role="img" aria-label="Exemplo ilustrativo de conversa com a Aurora" ref={ref}>
      <div className="sp-chat__head" aria-hidden="true">
        <img src="/avatar-ia.png" alt="" width={40} height={40} loading="lazy" />
        <div>
          <strong>Aurora</strong>
          <small>Assistente de IA do S.P.Y.</small>
        </div>
      </div>
      <div className="sp-bubble sp-bubble--user" data-hidden={!at("q1")} aria-hidden="true">
        {typedText(Q1, phase === "q1", q1Done)}
      </div>
      <div className="sp-bubble sp-bubble--ai" data-hidden={!at("t1")} aria-hidden="true">
        {at("a1") ? (
          <>
            {A1}
            <small>Usa só os dados do seu usuário.</small>
          </>
        ) : (
          <span className="sp-dots">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      <div className="sp-bubble sp-bubble--user" data-hidden={!at("q2")} aria-hidden="true">
        {typedText(Q2, phase === "q2", q2Done)}
      </div>
      <div className="sp-bubble sp-bubble--ai" data-hidden={!at("t2")} aria-hidden="true">
        {at("a2") ? A2 : (
          <span className="sp-dots">
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}
