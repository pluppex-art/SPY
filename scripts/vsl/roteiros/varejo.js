/**
 * VSL do varejo: ritmo rápido, vendedor de balcão. Só mostra o que o sistema faz hoje.
 * Cada fala: texto da legenda; "dito" só quando a voz precisa de outra grafia.
 */
(() => {
  const D = window.Desenho;
  const loja = (extra = "") => `
    <div class="prateleira" style="left:90px;top:300px;width:760px"><span><i>🔧</i><i>🪛</i><i>🔩</i><i>🪚</i><i>🔨</i></span></div>
    <div class="prateleira" style="left:90px;top:440px;width:760px"><span><i>🧰</i><i>💡</i><i>🪣</i><i>🧱</i><i>🪜</i></span></div>${extra}`;

  window.ROTEIRO = {
    id: "varejo",
    bpm: 112,
    ritmo: 202,
    cenas: [
      {
        id: "balcao",
        falas: ["Balcão cheio. E o WhatsApp não para.", "Enquanto você atende um, outros clientes esperam resposta."],
        sons: [["pop", "f0+0.5"], ["pop", "f0+1.1"], ["pop", "f0+1.6"], ["ding", "f1"], ["pop", "f1+0.7"], ["pop", "f1+1.4"]],
        html: `${D.exemplo}${loja()}
          <div class="abs" style="left:150px;top:370px;width:430px" data-em="0.1">${D.pessoa({ cabelo: "curto", roupa: "#1f6f5c", avental: "#ff8126", humor: "aperto", classe: "pessoa--digitando" })}</div>
          <div class="abs" style="left:760px;top:500px;width:390px;z-index:2" data-em="0.4" data-fx="dir">${D.pessoa({ pele: "#8d5b3f", cabelo: "coque", cor: "#17100d", roupa: "#7c3aed" })}</div>
          <div class="balcao" style="left:60px;top:790px;width:660px"></div>
          <div class="fala-balao" style="left:690px;top:215px" data-em="f0+0.4" data-fx="pop">Moço, tem em estoque?</div>
          <span class="nome-tag" style="left:245px;top:825px" data-em="0.6">Bruno, vendedor</span>
          ${D.celular({ nome: "Conversas", foto: "💬", classe: "", corpo: `
            ${D.bolha("c", "<b>Marcos</b><br>Qual o preço da furadeira?", "f0+0.5", "10:02")}
            ${D.bolha("c", "<b>Dona Célia</b><br>Vocês entregam hoje?", "f0+1.1", "10:03")}
            ${D.bolha("c", "<b>Obra Alfa</b><br>Preciso de 40 sacos de cimento", "f0+1.6", "10:03")}
            ${D.bolha("c", "<b>Marcos</b><br>Alô? 👀", "f1+0.7", "10:11")}
            ${D.bolha("c", "<b>Dona Célia</b><br>Vou ver em outro lugar então", "f1+1.4", "10:18")}`,
            extra: `<span class="selo-n" data-conta="23" data-de="f0">0</span>` }).replace('class="celular "', 'class="celular" style="left:1250px;top:90px;transform:scale(.95);transform-origin:top left" data-em="0.3" data-fx="dir"')}`,
      },
      {
        id: "problema",
        falas: ["A venda acontece na conversa.", "Só que ninguém tem tempo de passar para o sistema."],
        sons: [["tecla", "f0"], ["carimbo", "f1+0.9"]],
        html: `${D.exemplo}
          <div class="abs" style="left:90px;top:330px;width:500px" data-em="0.1" data-fx="esq">${D.pessoa({ cabelo: "curto", roupa: "#1f6f5c", avental: "#ff8126", humor: "aperto", classe: "pessoa--digitando" })}</div>
          <div class="balcao" style="left:40px;top:810px;width:640px"></div>
          ${D.celular({ nome: "Marcos", foto: "👷", corpo: `
            ${D.bolha("c", "Qual o preço da furadeira?", "0.2", "10:02")}
            ${D.bolha("v", "R$ 389 à vista", "f0+0.3", "10:12")}
            ${D.bolha("c", "Parcela? Preciso até sexta", "f0+1.2", "10:13")}
            ${D.bolha("v", "Já te falo!", "f1+0.2", "10:13")}` }).replace('class="celular "', 'class="celular" style="left:640px;top:50px" data-em="0.2"')}
          <div data-em="0.4" data-fx="dir" class="abs" style="left:1200px;top:200px;width:640px">${D.janela("Sistema da loja", `<div class="colunas"><div class="coluna"><h4>Clientes hoje</h4><div class="cartao cartao--fantasma"><b>—</b><small>nada anotado</small></div><div class="cartao cartao--fantasma"><b>—</b><small>nada anotado</small></div></div></div>`, "").replace('class="janela "', 'class="janela" style="position:relative"')}</div>
          <div class="abs carimbo" style="left:1250px;top:760px;background:var(--fundo)" data-em="f1+0.9" data-fx="carimbo">Ficou só no celular</div>`,
      },
      D.cenaMarca({ texto: "É aí que entra o S.P.Y., com o Agente Secreto.", dito: "É aí que entra o Spai, com o Agente Secreto." }),
      {
        id: "captura",
        falas: [
          "Pilar um: captura. O vendedor conversa normal, no WhatsApp conectado.",
          "Na primeira mensagem, o Agente Secreto já cria o cliente no funil.",
          "Mandou o preço? O negócio avança para orçamento.",
        ],
        sons: [["carimbo", 0.2], ["vuush", "f1"], ["ding", "f1+1.2"], ["vuush", "f2"], ["ding", "f2+1.2"]],
        cauda: 0.6,
        html: `${D.exemplo}${D.pilar(1, "Captura")}
          ${D.celular({ nome: "Marcos", foto: "👷", corpo: `
            ${D.bolha("c", "Oi! Qual o preço da furadeira de impacto?", "f0+0.8", "10:02")}
            ${D.bolha("v", "R$ 389 à vista 👍", "f2", "10:04")}
            ${D.bolha("c", "Parcela? Preciso até sexta", "f2+1.6", "10:05")}` }).replace('class="celular "', 'class="celular" style="left:80px;top:150px;transform:scale(.88);transform-origin:top left" data-em="0.3" data-fx="esq"')}
          <div class="abs" style="left:600px;top:330px;width:340px" data-em="f0+1.6" data-fx="pop">${D.espiao()}</div>
          <div class="abs" style="left:620px;top:690px;width:300px;text-align:center" data-em="f0+1.9"><span class="etiqueta">Agente Secreto</span></div>
          <div class="abs" style="left:1050px;top:200px;width:800px" data-em="0.5" data-fx="dir">${D.janela("S.P.Y. · Funil de vendas", `<div class="colunas">
              <div class="coluna"><h4>Novo lead</h4><div class="cartao" data-em="f1+1.2" data-ate="f2+1.1" data-fx="pop"><b>Marcos</b><small>Furadeira de impacto<br>via Agente Secreto</small></div></div>
              <div class="coluna"><h4>Orçamento</h4><div class="cartao" data-em="f2+1.2" data-fx="pop"><b>Marcos</b><small>Furadeira de impacto<br>R$ 389,00</small><span class="etiqueta etiqueta--ver">preço enviado</span></div></div>
              <div class="coluna"><h4>Ganho</h4></div></div>`).replace('class="janela "', 'class="janela" style="position:relative"')}</div>
          ${D.voo("novo cliente", "f1", 460, 470, 1210, 420)}
          ${D.voo("preço enviado", "f2", 460, 560, 1480, 420)}
          <p class="abs" style="left:1050px;top:850px;width:800px;text-align:center;font-size:24px;color:var(--suave)" data-em="f0+1">Só os números que a empresa conecta. Avise a equipe (LGPD).</p>`,
      },
      {
        id: "analise",
        falas: [
          "Pilar dois: análise. Ele registra o interesse, o prazo e a dúvida do cliente.",
          "E sugere o próximo passo, com a tarefa criada.",
        ],
        sons: [["carimbo", 0.2], ["pop", "f0+1.4"], ["pop", "f0+2.1"], ["pop", "f0+2.8"], ["ding", "f1+0.8"]],
        cauda: 0.6,
        html: `${D.exemplo}${D.pilar(2, "Análise")}
          <div class="abs" style="left:100px;top:330px;width:420px" data-em="0.3" data-fx="esq">${D.espiao()}</div>
          <div class="abs" style="left:660px;top:170px;width:1170px" data-em="0.35">${D.janela("Ficha do cliente · Marcos", `<dl>
              <div class="campo" data-em="f0+1.4" data-fx="dir"><dt>Interesse</dt><strong>${D.digita("Furadeira de impacto", "f0+1.5")}</strong></div>
              <div class="campo" data-em="f0+2.1" data-fx="dir"><dt>Urgência</dt><strong>${D.digita("Precisa até sexta", "f0+2.2")}</strong></div>
              <div class="campo" data-em="f0+2.8" data-fx="dir"><dt>Dúvida</dt><strong>${D.digita("Quer parcelar", "f0+2.9")}</strong></div>
              <div class="campo" data-em="f0+3.5" data-fx="dir"><dt>Intenção</dt><strong><span class="etiqueta etiqueta--ver">quer comprar</span></strong></div>
              <div class="campo" data-em="f1" data-fx="dir"><dt>Próximo passo</dt><strong class="lar">${D.digita("Responder sobre o parcelamento", "f1+0.1")}</strong></div>
            </dl>`).replace('class="janela "', 'class="janela" style="position:relative"')}</div>
          <div class="popup" style="left:960px;top:730px;width:640px;padding:22px 30px" data-em="f1+0.8" data-fx="pop"><span class="etiqueta etiqueta--ver">✔ Tarefa criada</span><p style="margin-top:10px">Retornar para o Marcos sobre parcelas</p></div>`,
      },
      {
        id: "repescagem",
        falas: [
          "Pilar três: repescagem. Você define quanto tempo o cliente pode esperar.",
          "Passou do tempo? Salta um aviso na tela do S.P.Y.",
          "E a Aurora chama o vendedor no WhatsApp.",
        ],
        sons: [["carimbo", 0.2], ["tecla", "f0+1.6"], ["alerta", "f1+0.4"], ["ding", "f2+0.5"]],
        cauda: 0.9,
        html: `${D.exemplo}${D.pilar(3, "Repescagem")}
          <div class="abs" style="left:110px;top:230px;width:520px;text-align:center" data-em="0.3">
            <svg viewBox="0 0 200 200" width="360"><circle cx="100" cy="100" r="88" fill="#17152a" stroke="#ff8126" stroke-width="10"/>${Array.from({ length: 12 }, (_, i) => `<path d="M100 22v12" stroke="#fff" stroke-width="4" transform="rotate(${i * 30} 100 100)"/>`).join("")}<path class="ponteiro" d="M100 100V40" stroke="#ffab4a" stroke-width="8" stroke-linecap="round"/><circle cx="100" cy="100" r="9" fill="#fff"/></svg>
            <p style="font:800 58px/1.2 var(--titulo);margin-top:20px">Marcos esperando</p>
            <p style="font:800 90px/1.1 var(--titulo)" class="vm"><span data-conta="10" data-de="f0+1.8" data-depois=" min">0</span></p>
            <span class="etiqueta" data-em="f0+1.4">Tempo definido pela loja: 10 min</span>
          </div>
          <div class="abs" style="left:690px;top:230px;width:640px" data-em="0.45">${D.janela("S.P.Y.", `<div style="height:520px"><div class="colunas"><div class="coluna"><h4>Orçamento</h4><div class="cartao"><b>Marcos</b><small>Furadeira · R$ 389,00</small><br><span class="etiqueta etiqueta--vm" data-em="f1">sem resposta</span></div></div></div></div>`).replace('class="janela "', 'class="janela" style="position:relative"')}</div>
          <div class="popup" style="left:730px;top:560px;width:580px" data-em="f1+0.4" data-fx="pop"><span class="etiqueta etiqueta--vm">⏰ Aviso do S.P.Y.</span><h4>Cliente esperando resposta</h4><p>Fale com Marcos: sem resposta há 10 min.</p></div>
          ${D.celular({ nome: "Aurora · SPY", foto: "✨", corpo: `
            ${D.bolha("a", "⏱️ <b>Cliente esperando sua resposta</b><br>1. <b>Marcos</b> — há 10 min<br><u style='color:#7dd3fc'>wa.me/55 00 0000-0000</u><br><br><i>Aurora · SPY</i>", "f2+0.5", "10:15")}
            ${D.bolha("v", "Vou responder agora! 💪", "f2$+0.3", "10:16")}` }).replace('class="celular "', 'class="celular" style="left:1400px;top:60px" data-em="f2" data-fx="dir"')}`,
        animar: (el, t, em) => { el.querySelector(".ponteiro").setAttribute("transform", `rotate(${Math.max(0, t - em("f0+1.8")) * 130} 100 100)`); },
      },
      {
        id: "ruptura",
        falas: ["E na tela de ruptura, você vê quem está há muito tempo sem comprar."],
        sons: [["vuush", 0], ["pop", "f0+0.8"], ["pop", "f0+1.2"], ["pop", "f0+1.6"]],
        cauda: 0.9,
        html: `${D.exemplo}${D.pilar(3, "Repescagem")}
          <div class="abs" style="left:310px;top:220px;width:1300px" data-em="0.2">${D.janela("S.P.Y. · Ruptura › Tempo sem comprar", `
            <div class="campo" data-em="f0+0.8" data-fx="dir"><strong style="text-align:left">Dona Célia</strong><em>última compra há 74 dias</em><span class="etiqueta">sem comprar</span></div>
            <div class="campo" data-em="f0+1.2" data-fx="dir"><strong style="text-align:left">Obra Alfa</strong><em>última compra há 92 dias</em><span class="etiqueta">sem comprar</span></div>
            <div class="campo" data-em="f0+1.6" data-fx="dir"><strong style="text-align:left">Seu Joaquim</strong><em>última compra há 118 dias</em><span class="etiqueta etiqueta--vm">sem comprar</span></div>`).replace('class="janela "', 'class="janela" style="position:relative"')}</div>`,
      },
      {
        id: "relatorios",
        falas: [
          "Pilar quatro: relatórios. O gestor pede para a Aurora, no WhatsApp.",
          "Relatório de ruptura: estoque zerado, vendas perdidas e o motivo.",
          "O vendedor pede o resumo dele, e vê o que é dele.",
        ],
        sons: [["carimbo", 0.2], ["tecla", "f0+1.4"], ["ding", "f1+0.2"], ["pop", "f2+0.4"], ["ding", "f2+1.6"]],
        cauda: 1.1,
        html: `${D.exemplo}${D.pilar(4, "Relatórios")}
          <div class="abs" style="left:60px;top:470px;width:360px" data-em="0.3" data-fx="esq">${D.pessoa({ pele: "#c98a63", cabelo: "raspado", cor: "#20140f", roupa: "#1e3a8a", barba: true, oculos: true, classe: "pessoa--digitando" })}</div>
          <span class="nome-tag" style="left:155px;top:870px" data-em="0.5">Gestor</span>
          ${D.celular({ nome: "Aurora · SPY", foto: "✨", corpo: `
            ${D.bolha("v", "Aurora, me manda o relatório de ruptura", "f0+1.4", "18:00")}
            ${D.bolha("a", "<b>Ruptura de hoje</b><br>📦 Estoque zerado: <b>3 produtos</b><br>⚠️ Abaixo do mínimo: <b>5 produtos</b><br>❌ Vendas perdidas: <b>4</b><br>Motivos: preço (2), prazo (1), falta no estoque (1)", "f1+0.2", "18:00")}` }).replace('class="celular "', 'class="celular" style="left:430px;top:150px;transform:scale(.88);transform-origin:top left" data-em="0.4"')}
          <div class="abs" style="left:900px;top:220px" data-em="0.7" data-fx="pop">${D.aurora()}</div>
          ${D.celular({ nome: "Aurora · SPY", foto: "✨", corpo: `
            ${D.bolha("v", "Meu resumo de vendas", "f2+0.4", "18:02")}
            ${D.bolha("a", "<b>Resumo seu</b><br>👥 Seus clientes: <b>15</b><br>✅ Ganhos: <b>6</b><br>💰 Em aberto: <b>R$ 4.870</b><br>📋 Tarefas abertas: <b>9</b><br>⏰ Atrasadas: <b>3</b>", "f2+1.6", "18:02")}` }).replace('class="celular "', 'class="celular" style="left:1140px;top:150px;transform:scale(.88);transform-origin:top left" data-em="f2" data-fx="dir"')}
          <div class="abs" style="left:1550px;top:470px;width:330px" data-em="f2" data-fx="dir">${D.pessoa({ cabelo: "curto", roupa: "#1f6f5c", avental: "#ff8126", classe: "pessoa--digitando" })}</div>
          <span class="nome-tag" style="left:1660px;top:870px" data-em="f2+0.2">Bruno</span>`,
      },
      {
        id: "painel",
        falas: ["Na tela, o relatório completo sai em Excel ou PDF."],
        sons: [["vuush", 0], ["ding", "f0+1.8"]],
        cauda: 0.8,
        html: `${D.exemplo}${D.pilar(4, "Relatórios")}
          <div class="abs" style="left:360px;top:180px;width:1200px" data-em="0.15">${D.janela("S.P.Y. · Relatório de vendas", `
            ${D.indicadores([["Vendas", 48, "f0"], ["Orçamentos", 112, "f0"], ["Perdidos", 17, "f0", "vm"]])}
            ${D.barras([["WhatsApp", 86, "31"], ["Balcão", 42, "12"], ["Instagram", 18, "5"]], "f0+0.4")}
            <div class="botoes" data-em="f0+1.8" data-fx="pop"><span>Baixar em Excel</span><span>Imprimir / PDF</span></div>`).replace('class="janela "', 'class="janela" style="position:relative"')}</div>`,
      },
      D.cenaFinal(["Você cuida do balcão. O espião anota, a Aurora avisa.", "Escolha o seu plano aqui embaixo."], `Venda mais sem perder conversa`),
    ],
  };
})();
