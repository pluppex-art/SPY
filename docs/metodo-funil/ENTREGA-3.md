# Método do funil · Entrega 3: telas do vendedor

**Situação:** telas prontas no código. **Para revisar.** Nenhum funil tem o método ligado, então nada muda para ninguém até você ligar o funil de teste.

**Pronto quando:** um vendedor opera o funil inteiro pela tela, sem IA.

## O que fazer, nesta ordem

1. Rodar [20261231_metodo_funil_mesclar.sql](../../supabase/migrations/20261231_metodo_funil_mesclar.sql) no SQL Editor. Esperado no fim: `true, true`.
2. Rodar [entrega-3_ligar-funil-de-teste.sql](entrega-3_ligar-funil-de-teste.sql).
3. Abrir o SPY em uma aba nova (a aba antiga pode levar até 5 minutos para perceber o funil) e fazer o roteiro abaixo na empresa SPY | IA.
4. Só depois decidir em qual funil de cliente ligar.

## O que muda na tela (só em funil com o método ligado)

| Onde | O que aparece |
|---|---|
| Cartão do quadro | Situação, com quem está a bola, prazo (em dia, atenção, estourado), tentativa da Repescagem (3/7), pausa com data |
| Quadro | Filtros por situação, prazo, bola e temperatura; atrasados e quentes primeiro |
| Arrastar ou botão Ganho/Perdido | Abre a janela certa; sem confirmar, nada é gravado |
| Detalhe do lead | Faixa com os status e os botões de ação; aba **Funil** com notas, pagamentos e histórico |
| Tarefas | Selo **Automática** com a situação; botão **Minhas de hoje** (em empresa com algum funil ligado) |

### Janelas

| Janela | Pede |
|---|---|
| Mudar de etapa ou situação | Situação, nota; valor ao ir para Orçamento; data quando a situação pede |
| Repescagem | Motivo, nota, data (se "Adiou"); preço esperado e concorrente, se houver |
| Perdido | Motivo, nota; concorrente e preço |
| Pagamento | O que aconteceu, forma, valor; vencimento no boleto |
| Venda presencial | Valor, forma, nota; se falta entregar |
| Cliente pediu mais tempo | Data, hora, nota |

## Roteiro de teste (cerca de 10 minutos)

Para ter um lead no funil de teste: abra um lead de teste e troque o funil dele para **Teste do método**. Não use lead de cliente real.

1. No detalhe, **Iniciar acompanhamento**. Aparece a situação e o prazo.
2. Arraste para **Orçamento**: sem valor e nota, o botão não libera.
3. **Mudar situação** para "Em negociação".
4. **Pediu mais tempo**: o prazo vira "Pausado até". Depois, **Retomar agora**.
5. **Repescagem** com motivo "Sumiu". Depois, **Cliente respondeu**: volta para a etapa de origem.
6. **Pagamento** → "Enviei a cobrança" por Pix. Depois, "Recebi o pagamento": vira venda ganha.
7. Na aba **Funil**, confira notas, pagamentos e histórico.
8. Em **Tarefas**, confira o selo "Automática" e o botão **Minhas de hoje**.
9. Com outros leads de teste: **Perdido**, **Venda presencial** e **Mesclar cards**.

## Onde me afastei do documento

| Documento | Como ficou | Motivo |
|---|---|---|
| Notas, pagamento e linha do tempo no detalhe | Reunidos em uma aba nova, **Funil** | Não misturar com as abas atuais |
| Aviso "Aurora moveu… Desfazer" | Aparece no detalhe do lead, não como aviso flutuante | A IA só passa a mover leads em entrega posterior |
| Janela com nota sugerida pela IA | Nota em branco | A IA fica para depois |
| Conversa, Relacionamento, Permissão | Mostram "—" | Quem preenche são as próximas entregas |

## O que ainda não funciona

- **Os prazos são calculados e coloridos, mas nada dispara sozinho:** follow-up, cadência da Repescagem, aviso de atraso e perda automática dependem do executor (entrega 4). O contador da Repescagem não avança até lá.
- **Lead novo não começa sozinho:** é preciso clicar em Iniciar acompanhamento.
- **Duas etapas do mesmo tipo no funil:** mover entre elas é livre; vindo de outro tipo, o lead vai para a primeira.
- **Mudanças feitas por outras pessoas** aparecem nos selos em até 1 minuto, ou ao voltar para a aba.
- **Estorno e sugestões da IA** não têm botão na tela.

## Mesclar cartões

A entrega 1 deixou este ponto anotado. Ao conferir o código: mesclar um lead com histórico do método **falharia**, porque o histórico é protegido contra alteração. Com a migração:

- histórico, notas e pagamentos vão para o card principal;
- valem a situação e os prazos do principal; os do card mesclado são encerrados;
- o histórico continua protegido contra qualquer outra alteração.

Para voltar atrás: [entrega-3_desfazer.sql](entrega-3_desfazer.sql).

## O que foi conferido e o que não foi

- **Conferido:** tipos, 322 testes, montagem de produção; no navegador, com dados simulados, os selos, o filtro, as janelas e o que cada uma envia ao banco, no computador e na largura de celular.
- **Conferido no banco (só leitura):** a função de mesclar no ar é idêntica à do repositório.
- **Não testado:** o fluxo contra o banco real (é o roteiro acima) e a migração de mesclagem, que não foi executada.
