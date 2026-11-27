/**
 * VSL da venda consultiva: ciclo longo, decisor, proposta e reunião. Só mostra o que o sistema faz hoje.
 * Cada fala: texto da legenda; "dito" só quando a voz precisa de outra grafia.
 */
(() => {
  const D = window.Desenho;
  const ana = (classe = "", humor = "bem") => D.pessoa({ pele: "#d89a74", cabelo: "longo", cor: "#3a2316", roupa: "#4338ca", fone: true, humor, classe });
  const gestor = (classe = "") => D.pessoa({ pele: "#c98a63", cabelo: "raspado", cor: "#20140f", roupa: "#334155", barba: true, oculos: true, classe });
  const solta = (html) => html.replace('class="janela "', 'class="janela" style="position:relative"');
  const fone = (config, estilo, extra = "") => D.celular(config).replace('class="celular "', `class="celular" style="${estilo}" ${extra}`);
  const reduzido = (x, y) => `left:${x}px;top:${y}px;transform:scale(.88);transform-origin:top left`;
  const cartao = (nome, texto, etiqueta, cor, em) => `<div class="cartao" data-em="${em}" data-fx="dir"><b>${nome}</b><small>${texto}</small><span class="etiqueta ${cor}">${etiqueta}</span></div>`;

  window.ROTEIRO = {
    id: "consultiva",
    bpm: 92,
    ritmo: 186,
    cenas: [
      {
        id: "abertura",
        falas: [
          "Venda consultiva não se fecha em uma mensagem.",
          "São dias de conversa: necessidade, orçamento, quem decide e objeções.",
        ],
        sons: [["tecla", "f0"], ["pop", "f1+0.8"], ["pop", "f1+1.6"], ["pop", "f1+2.4"], ["pop", "f1+3.1"]],
        html: `${D.exemplo}
          <div class="abs" style="left:170px;top:340px;width:500px" data-em="0.1">${ana("pessoa--digitando")}</div>
          <div class="mesa" style="left:80px;top:830px;width:720px"></div>
          <div class="abs" style="left:540px;top:690px;width:250px;height:150px;background:#2b2850;border:6px solid #6d68a8;border-radius:16px 16px 4px 4px"></div>
          <span class="nome-tag" style="left:230px;top:885px" data-em="0.5">Ana, consultora</span>
          ${fone({ nome: "Ricardo · Empresa Alfa", foto: "👔", corpo: `
            ${D.bolha("c", "Ana, preciso resolver isso ainda neste trimestre.", "f0+0.4", "Seg 09:14")}
            ${D.bolha("v", "Entendi. Quantas unidades vocês têm?", "f0+1.6", "Seg 11:02")}
            ${D.bolha("c", "Três. Mas quem aprova é a diretora, a Paula.", "f1+0.8", "Ter 16:40")}
            ${D.bolha("c", "Nosso limite é R$ 2.500 por mês.", "f1+2.4", "Qua 10:05")}
            ${D.bolha("c", "Fiquei em dúvida no prazo de implantação…", "f1+3.1", "Qui 18:22")}` }, "left:1230px;top:90px", 'data-em="0.3" data-fx="dir"')}
          <span class="dado" style="left:760px;top:260px" data-em="f1+0.4" data-fx="pop">Necessidade</span>
          <span class="dado" style="left:900px;top:370px" data-em="f1+1.4" data-fx="pop">Orçamento</span>
          <span class="dado" style="left:780px;top:490px" data-em="f1+2.4" data-fx="pop">Quem decide</span>
          <span class="dado" style="left:930px;top:600px" data-em="f1+3.1" data-fx="pop">Objeção</span>`,
      },
      {
        id: "problema",
        falas: [
          "Aí o gestor pergunta: como ficou aquela proposta?",
          "E a resposta está perdida no meio das conversas do celular.",
        ],
        sons: [["pop", "f0+0.9"], ["tecla", "f1"], ["carimbo", "f1+1.8"]],
        html: `${D.exemplo}
          <div class="abs" style="left:110px;top:410px;width:450px" data-em="0.1" data-fx="esq">${gestor()}</div>
          <span class="nome-tag" style="left:270px;top:885px" data-em="0.3">Gestor</span>
          <div class="fala-balao" style="left:300px;top:230px" data-em="f0+0.9" data-fx="pop">Ana, como ficou a proposta da Alfa?</div>
          <div class="abs" style="left:1340px;top:410px;width:450px" data-em="0.2" data-fx="dir">${ana("pessoa--digitando", "aperto")}</div>
          <span class="nome-tag" style="left:1520px;top:885px" data-em="0.4">Ana</span>
          <div class="fala-balao fala-balao--d" style="left:1190px;top:230px" data-em="f1+0.3" data-fx="pop">Peraí… deixa eu procurar aqui 😅</div>
          <div class="abs" style="left:670px;top:440px;width:580px" data-em="f1+0.8" data-fx="sobe">${solta(D.janela("CRM da empresa", `<div class="campo"><em>Proposta Alfa</em><strong class="vm">sem anotação</strong></div><div class="campo"><em>Último contato</em><strong class="vm">?</strong></div>`))}</div>
          <div class="abs carimbo" style="left:730px;top:790px;background:var(--fundo)" data-em="f1+1.8" data-fx="carimbo">Informação perdida</div>`,
      },
      D.cenaMarca({ texto: "É aí que entra o S.P.Y., com o Agente Secreto de Vendas.", dito: "É aí que entra o Spai, com o Agente Secreto de Vendas." }),
      {
        id: "captura",
        falas: [
          "Pilar um: captura. O Agente Secreto acompanha o WhatsApp conectado do vendedor.",
          "Cria a oportunidade no funil já na primeira mensagem.",
          "Ele lê texto, áudio e documento.",
          "E, combinou uma reunião? Ela vai para a agenda.",
        ],
        sons: [["carimbo", 0.2], ["vuush", "f1"], ["ding", "f1+1.2"], ["vuush", "f2+0.5"], ["vuush", "f3"], ["ding", "f3+1.2"]],
        cauda: 0.9,
        html: `${D.exemplo}${D.pilar(1, "Captura")}
          ${fone({ nome: "Ricardo · Empresa Alfa", foto: "👔", corpo: `
            ${D.bolha("c", "Oi, Ana! Queremos organizar o comercial das nossas 3 unidades.", "f0+0.9", "09:14")}
            ${D.bolha("c", "🎤 ▂▅▃▇▂▆▃▅▂ &nbsp;0:42", "f2+0.2", "09:16")}
            ${D.bolha("c", "📄 requisitos.pdf", "f2+1", "09:17")}
            ${D.bolha("v", "Perfeito! Quinta às 15h para uma reunião?", "f3-0.5", "09:20")}
            ${D.bolha("c", "Fechado, quinta às 15h.", "f3+0.4", "09:21")}` }, reduzido(80, 150), 'data-em="0.3" data-fx="esq"')}
          <div class="abs" style="left:600px;top:330px;width:340px" data-em="f0+1.8" data-fx="pop">${D.espiao()}</div>
          <div class="abs" style="left:620px;top:690px;width:300px;text-align:center" data-em="f0+2.1"><span class="etiqueta">Agente Secreto</span></div>
          <div class="abs" style="left:1050px;top:200px;width:800px" data-em="0.5" data-fx="dir">${solta(D.janela("S.P.Y. · Funil de vendas", `<div class="colunas">
              <div class="coluna"><h4>Novo lead</h4><div class="cartao" data-em="f1+1.2" data-ate="f3+1.1" data-fx="pop"><b>Empresa Alfa</b><small>Ricardo<br>via Agente Secreto</small></div></div>
              <div class="coluna"><h4>Reunião</h4><div class="cartao" data-em="f3+1.2" data-fx="pop"><b>Empresa Alfa</b><small>Quinta, 15h</small><span class="etiqueta etiqueta--ver">na agenda</span></div></div>
              <div class="coluna"><h4>Orçamento</h4></div></div>`))}</div>
          ${D.voo("nova oportunidade", "f1", 460, 380, 1210, 420)}
          ${D.voo("áudio e PDF", "f2+0.5", 460, 520, 790, 500)}
          ${D.voo("reunião marcada", "f3", 460, 640, 1480, 420)}
          <p class="abs" style="left:1050px;top:850px;width:800px;text-align:center;font-size:24px;color:var(--suave)" data-em="f0+1">Só os números que a empresa conecta. Avise a equipe (LGPD).</p>`,
      },
      {
        id: "analise",
        falas: [
          "Pilar dois: análise. A conversa vira informação organizada.",
          "Necessidade, quem decide, orçamento, urgência e objeção.",
          "Com resumo, próximo passo e tarefa, para ninguém depender de memória.",
        ],
        sons: [["carimbo", 0.2], ["pop", "f1"], ["pop", "f1+0.8"], ["pop", "f1+1.6"], ["pop", "f1+2.4"], ["pop", "f1+3.2"], ["ding", "f2+0.9"]],
        cauda: 1,
        html: `${D.exemplo}${D.pilar(2, "Análise")}
          <div class="abs" style="left:90px;top:330px;width:400px" data-em="0.3" data-fx="esq">${D.espiao()}</div>
          <div class="abs" style="left:560px;top:150px;width:1290px" data-em="0.35">${solta(D.janela("Oportunidade · Empresa Alfa", `<dl>
              <div class="campo" data-em="f1" data-fx="dir"><dt>Necessidade</dt><strong>${D.digita("Organizar o comercial de 3 unidades", "f1+0.1", 48)}</strong></div>
              <div class="campo" data-em="f1+0.8" data-fx="dir"><dt>Quem decide</dt><strong>${D.digita("Paula, diretora", "f1+0.9", 48)}</strong></div>
              <div class="campo" data-em="f1+1.6" data-fx="dir"><dt>Orçamento</dt><strong>${D.digita("Até R$ 2.500 por mês", "f1+1.7", 48)}</strong></div>
              <div class="campo" data-em="f1+2.4" data-fx="dir"><dt>Urgência</dt><strong>${D.digita("Neste trimestre", "f1+2.5", 48)}</strong></div>
              <div class="campo" data-em="f1+3.2" data-fx="dir"><dt>Objeção</dt><strong>${D.digita("Prazo de implantação", "f1+3.3", 48)}</strong></div>
              <div class="campo" data-em="f2" data-fx="dir"><dt>Próximo passo</dt><strong class="lar">${D.digita("Levar cronograma de implantação na reunião", "f2+0.1", 48)}</strong></div>
            </dl>`))}</div>
          <div class="popup" style="left:880px;top:755px;width:700px;padding:20px 30px" data-em="f2+0.9" data-fx="pop"><span class="etiqueta etiqueta--ver">✔ Tarefa criada</span><p style="margin-top:8px">Preparar cronograma para a Empresa Alfa</p></div>`,
      },
      {
        id: "esfriando",
        falas: ["Pilar três: repescagem. O Radar mostra o que está esfriando, antes de virar venda perdida."],
        sons: [["carimbo", 0.2], ["pop", "f0+1.4"], ["pop", "f0+2.3"], ["alerta", "f0+3.2"]],
        cauda: 0.9,
        html: `${D.exemplo}${D.pilar(3, "Repescagem")}
          <div class="abs" style="left:210px;top:220px;width:1500px" data-em="0.3">${solta(D.janela("S.P.Y. · Radar de oportunidades", `<div class="colunas">
              <div class="coluna"><h4>Atenção · 1 a 6 dias</h4>${cartao("Clínica Vida", "R$ 1.800/mês · parada há 4 dias", "retomar", "", "f0+1.4")}</div>
              <div class="coluna"><h4>Alto · 7 a 13 dias</h4>${cartao("Grupo Norte", "R$ 3.200/mês · parado há 9 dias", "retomar", "", "f0+2.3")}</div>
              <div class="coluna"><h4>Crítico · 14 dias ou mais</h4>${cartao("Escola Horizonte", "R$ 2.100/mês · parada há 19 dias", "retomar hoje", "etiqueta--vm", "f0+3.2")}</div>
            </div>`))}</div>`,
      },
      {
        id: "repescagem",
        falas: [
          "Você define quanto tempo um cliente pode ficar esperando.",
          "Passou do prazo? Aparece um aviso na tela do S.P.Y.",
          "E a Aurora chama o vendedor no WhatsApp.",
        ],
        sons: [["tecla", "f0+1.2"], ["alerta", "f1+0.4"], ["ding", "f2+0.5"]],
        cauda: 1,
        html: `${D.exemplo}${D.pilar(3, "Repescagem")}
          <div class="abs" style="left:110px;top:230px;width:520px;text-align:center" data-em="0.3">
            <svg viewBox="0 0 200 200" width="360"><circle cx="100" cy="100" r="88" fill="#17152a" stroke="#ff8126" stroke-width="10"/>${Array.from({ length: 12 }, (_, i) => `<path d="M100 22v12" stroke="#fff" stroke-width="4" transform="rotate(${i * 30} 100 100)"/>`).join("")}<path class="ponteiro" d="M100 100V40" stroke="#ffab4a" stroke-width="8" stroke-linecap="round"/><circle cx="100" cy="100" r="9" fill="#fff"/></svg>
            <p style="font:800 54px/1.2 var(--titulo);margin-top:20px">Ricardo esperando</p>
            <p style="font:800 90px/1.1 var(--titulo)" class="vm"><span data-conta="30" data-de="f0+1.2" data-depois=" min">0</span></p>
            <span class="etiqueta" data-em="f0+1">Prazo definido pela empresa: 30 min</span>
          </div>
          <div class="popup" style="left:700px;top:420px;width:620px" data-em="f1+0.4" data-fx="pop"><span class="etiqueta etiqueta--vm">⏰ Aviso do S.P.Y.</span><h4>Cliente esperando resposta</h4><p>Fale com Ricardo: sem resposta há 30 min.</p></div>
          ${fone({ nome: "Aurora · SPY", foto: "✨", corpo: `
            ${D.bolha("a", "⏱️ <b>Cliente esperando sua resposta</b><br>1. <b>Ricardo</b> — há 30 min<br><u style='color:#7dd3fc'>wa.me/55 00 0000-0000</u><br><br><i>Aurora · SPY</i>", "f2+0.5", "14:30")}
            ${D.bolha("v", "Respondendo agora! 💪", "f2$+0.2", "14:31")}` }, "left:1390px;top:60px", 'data-em="f2" data-fx="dir"')}`,
        animar: (el, t, em) => { el.querySelector(".ponteiro").setAttribute("transform", `rotate(${Math.max(0, t - em("f0+1.2")) * 130} 100 100)`); },
      },
      {
        id: "relatorios",
        falas: [
          "Pilar quatro: relatórios. O gestor pede para a Aurora, no WhatsApp.",
          "Relatório de ruptura: contratos cancelados, negócios perdidos e os motivos.",
          "É a base para corrigir o processo, e não só cobrar o time.",
          "E o vendedor pede o resumo dele, vendo o que é dele.",
        ],
        sons: [["carimbo", 0.2], ["tecla", "f0+1.4"], ["ding", "f1+0.2"], ["pop", "f3+0.3"], ["ding", "f3+1.4"]],
        cauda: 1.4,
        html: `${D.exemplo}${D.pilar(4, "Relatórios")}
          <div class="abs" style="left:60px;top:470px;width:360px" data-em="0.3" data-fx="esq">${gestor("pessoa--digitando")}</div>
          <span class="nome-tag" style="left:155px;top:870px" data-em="0.5">Gestor</span>
          ${fone({ nome: "Aurora · SPY", foto: "✨", corpo: `
            ${D.bolha("v", "Aurora, me manda o relatório de ruptura", "f0+1.4", "18:00")}
            ${D.bolha("a", "<b>Relatório de ruptura</b><br>📉 Contratos cancelados: <b>2</b><br>❌ Negócios perdidos: <b>7</b><br><br><b>Motivos</b><br>• Preço: 3<br>• Sem retorno: 2<br>• Prazo: 1<br>• Concorrente: 1", "f1+0.2", "18:00")}` }, reduzido(430, 150), 'data-em="0.4"')}
          <div class="abs" style="left:900px;top:220px" data-em="0.7" data-fx="pop">${D.aurora()}</div>
          ${fone({ nome: "Aurora · SPY", foto: "✨", corpo: `
            ${D.bolha("v", "Meu resumo", "f3+0.3", "18:02")}
            ${D.bolha("a", "<b>Resumo seu</b><br>👥 Seus clientes: <b>22</b><br>🤝 Em negociação: <b>8</b><br>💰 Em aberto: <b>R$ 18.400</b><br>📋 Tarefas abertas: <b>11</b><br>⏰ Atrasadas: <b>2</b>", "f3+1.4", "18:02")}` }, reduzido(1140, 150), 'data-em="f3" data-fx="dir"')}
          <div class="abs" style="left:1545px;top:470px;width:340px" data-em="f3" data-fx="dir">${ana("pessoa--digitando")}</div>
          <span class="nome-tag" style="left:1675px;top:870px" data-em="f3+0.2">Ana</span>`,
      },
      {
        id: "painel",
        falas: ["Na tela, o gestor acompanha o funil e baixa os relatórios em Excel ou PDF."],
        sons: [["vuush", 0], ["ding", "f0+2.6"]],
        cauda: 0.8,
        html: `${D.exemplo}${D.pilar(4, "Relatórios")}
          <div class="abs" style="left:360px;top:170px;width:1200px" data-em="0.15">${solta(D.janela("S.P.Y. · Relatório de vendas", `
            ${D.indicadores([["Oportunidades", 64, "f0"], ["Ganhos", 14, "f0", "ver"], ["Perdidos", 7, "f0", "vm"]])}
            ${D.barras([["Novo lead", 92, "21"], ["Reunião", 61, "14"], ["Proposta", 39, "9"], ["Negociação", 27, "6"]], "f0+0.4")}
            <div class="botoes" data-em="f0+2.6" data-fx="pop"><span>Baixar em Excel</span><span>Imprimir / PDF</span></div>`))}</div>`,
      },
      D.cenaFinal([
        "O espião anota, a Aurora avisa, e o seu time foca em fechar.",
        { texto: "Escolha o seu plano aqui embaixo e coloque o S.P.Y. na sua operação.", dito: "Escolha o seu plano aqui embaixo, e coloque o Spai na sua operação." },
      ], "Nenhuma oportunidade no escuro"),
    ],
  };
})();
