# Método do funil · Entrega 2: motor de regras

**Situação:** **aplicada em 27/11/2026** e conferida: 30 funções iguais às do arquivo, 2 colunas, 2 gatilhos, nenhuma função interna exposta e nenhum funil com o método ligado. O ensaio passou antes ("ENSAIO OK").

**Pronto quando:** chamando as funções direto no banco, o lead percorre o funil com nota, histórico, prazos e tarefas corretos.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| [20261231_metodo_funil_motor.sql](../../supabase/migrations/20261231_metodo_funil_motor.sql) | A migração, já aplicada |
| [entrega-2_ensaio.sql](entrega-2_ensaio.sql) | Teste do funil; desfaz tudo e termina no erro "ENSAIO OK" |
| [entrega-2_desfazer.sql](entrega-2_desfazer.sql) | Volta atrás |
| [entrega-2_opcional_status-de-tarefa.sql](entrega-2_opcional_status-de-tarefa.sql) | Padroniza status antigos de tarefa (não aplicado). Muda telas de quem não usa o método |

## Funções

| Função | O que faz |
|---|---|
| `spy_iniciar` | Dá a primeira situação ao lead (com ou sem prazos, para leads antigos) |
| `spy_mudar_situacao` | Troca a situação dentro da etapa |
| `spy_mover_etapa` | Novo Lead, Em Atendimento, Orçamento e Aguardando Pagamento |
| `spy_enviar_repescagem` | Guarda a etapa de origem e agenda a cadência |
| `spy_marcar_perdido` | Venda perdida ou Não-lead, com motivo e nota |
| `spy_registrar_pagamento` | Aviso do gateway ou marcação manual; ignora repetidos e fora de ordem |
| `spy_registrar_venda_presencial` | Venda ganha na loja, com a venda do PDV quando houver |
| `spy_pausar_ate` / `spy_retomar` | Regra de foco |
| `spy_reativar` | O cliente voltou a falar |
| `spy_aceitar_sugestao` / `spy_recusar_sugestao` | Sugestões da IA |
| `spy_desfazer` | Desfaz a última mudança feita pela IA |

Gatilhos novos, só nas tabelas novas: a nota vai para a linha do tempo e o histórico vai para `aurora_events`.

**Acesso:** usuário logado só alcança os leads que já enxerga e é sempre registrado como "usuário". Funções internas (`spy__`) não são chamáveis pela tela.

## Efeitos no que já existe

Quando uma função move um lead, os gatilhos atuais disparam normalmente:

- conversão de anúncio (se ligada na empresa) e automações ligadas à etapa;
- avisos de **venda ganha** e **negócio perdido**; por isso o motivo é gravado em `loss_reason` e em `lost_reason`;
- data de fechamento e a trava de permissão por cargo;
- **cada tarefa automática dispara o aviso "Nova Tarefa"** da empresa, e cada conclusão, o "Tarefa Concluída".

Sem método ligado (hoje, nenhum funil), nada muda.

## Regras que eu defini e precisam da sua aprovação

| Tema | Como ficou |
|---|---|
| Saída para a repescagem | 1 hora depois das 72h, para o follow-up D+3 sair antes |
| Fim da cadência | "Sumiu", "Preço" e "Vai pesquisar" vão para Venda perdida um dia após a última tentativa. "Adiou" e "Sem estoque" não saem sozinhos |
| Nota | Pessoa é obrigada a escrever; automação grava um rascunho e cria "Revisar nota" |
| Orçamento | Pessoa precisa informar o valor |
| Estorno | Só avisa; não muda a etapa |
| Cliente de venda perdida que volta | Só aviso e tarefa. Abrir novo negócio fica para a entrega 5 ou 6 |
| Tarefas | Nascem "Em Aberto" e fecham "Concluída"; os status antigos não são convertidos |
| Desfazer | Não recupera a etapa de origem da repescagem |

## Limites desta entrega

- **Nada chama as funções ainda.** A tela é a entrega 3; quem executa os prazos e lê o WhatsApp é a entrega 4.
- **Não ligar o método em funil real antes da entrega 3:** arrastar o cartão no quadro não passa pelas funções e deixaria o histórico incompleto.
- Prazos em tempo corrido; a pausa fora do expediente fica na entrega 4.
- O alerta atual `sla-primeiro-contato` continua ligado; substituir na entrega 4.

## Como repetir o teste

Rodar [entrega-2_ensaio.sql](entrega-2_ensaio.sql) no SQL Editor. O esperado é o erro **"ENSAIO OK"**; nada fica gravado.
