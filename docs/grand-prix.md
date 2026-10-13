# Grand Prix: plano

O modo de jogo atual passa a se chamar **Quick Play** e continua igual. O modo novo, **Grand Prix**, tem 4 corridas, cada uma numa pista desenhada por um dos jogadores.

## Fluxo

Repetido 4 vezes:

1. **Sorteio.** Todos veem um sorteio entre os jogadores humanos (bots nunca desenham). Ninguém repete até todos os humanos terem desenhado uma vez.
2. **Desenho.** O sorteado tem 15 s para desenhar a pista numa folha branca com lápis preto. Os outros veem uma **tela de espera** ("Fulano está desenhando a pista…" e o tempo restante), sem ver o desenho.
3. **Corrida.** 5 voltas, como no Quick Play. A pista só é revelada a todos na largada.
4. **Ranking.** Resultado da corrida e tabela acumulada.

Depois da 4ª corrida: **cena do vencedor levantando a taça**.

## Regras

- **Pontos por corrida:** 1º = 10, 2º = 6, 3º = 3, 4º = 1. Bots pontuam e podem ganhar o Grand Prix.
- **Corrida sem ninguém terminando (3 min):** as posições valem pela distância percorrida, e os pontos são dados normalmente.
- **Desempate no final:** mais vitórias; persistindo, melhor posição na última corrida.
- **Jogador que sai no meio:** vira bot, como no Quick Play, e continua somando pontos.

## Desenho → pista

- O traço precisa **fechar o ciclo**: o ponto de início aparece destacado e o ciclo fecha quando o lápis é **levantado** perto dele. Passar pelo início no meio do traço não fecha (num "8" começado no cruzamento isso acontece). **Esse ponto é a largada**, e o sentido da corrida é o sentido do traço.
- **Não fechou em 15 s:** a folha é limpa e o jogador ganha **mais 10 s**. Se ainda não fechar, o jogo **fecha com uma linha reta** do fim até o começo.
- **Cruzamentos (um "8"):** viram **ponte + túnel**. Não há atalho. No máximo **3 cruzamentos**; acima disso, o desenho é inválido e o jogador ganha os 10 s para refazer (com a mesma regra de fechamento automático no fim).
  - A ponte fica 4 m acima da água, no trecho que passa sobre o canal de baixo, e tem rampas de 12 m dos dois lados. Pontes vizinhas viram um viaduto só.
  - O jogo escolhe qual passagem de cada cruzamento vai por cima, para nenhum túnel cair na rampa de outra ponte.
  - Cruzamentos muito colados uns nos outros na volta não têm como virar ponte e túnel. Isso acontece no miolo de um nó (um "trevo" de 3 cruzamentos), que é recusado em ~70% dos casos. Um "8" e uma corrente de três laços ("∞∞") sempre funcionam nos testes.
- **Quem desenha cai da partida:** sorteia outro humano, com 15 s novos.
- **Limpeza automática do desenho:** suavizar o tremido, garantir raio mínimo de 15 m nas curvas, afastar trechos colados que não se cruzam, abrir o ângulo dos cruzamentos para pelo menos 55°, e ampliar o desenho para ocupar a cratera.
  - Laços pequenos demais para uma ponte (uma "enrolada" da mão) são cortados.
  - Cruzamentos quase paralelos (menos de 15°, como um traço que vai e volta pelo mesmo caminho) são desfeitos em vez de virar ponte.
  - A volta tem até 300 m, mais 60 m por ponte (no máximo 520 m). Nas pistas testadas, os bots levam de 50 s a 95 s sem ponte, ~85 s num "8", ~100 s com 2 pontes e ~110 s com 3.
  - Se a largada cair em cima de uma ponte, ela vai para o lugar livre mais perto, para a frente ou para trás.
- **Desenho que a limpeza não consegue consertar** (curva impossível, pontes perto demais): mesma regra do traço que não fecha, mais 10 s para refazer. Se falhar de novo, essa corrida usa a pista do Quick Play.

Tudo isso é geometria em código (`shared/sketch.js`), rodando no servidor. **Não usa a API do Claude: custo de R$ 0 por pista**, sem espera e sem chave de API. A conversão leva até ~0,4 s nos desenhos mais complicados e roda numa thread separada (`server/sketcher.js`), para não travar as corridas das outras salas.

Para ver de olho como os desenhos de teste viram pista: `node scripts/sketch-gallery.js` gera `dist/sketch-gallery.html`.

## Etapas

1. ✅ **`shared/sketch.js`**: transforma o traço em pista (fechamento, limpeza, cruzamentos, largada). Testes em `test/sketch.test.js` com desenhos gerados em `test/sketches.js`: voltas tortas, "8", nós de 3 cruzamentos, estrela (recusada), traços abertos, riscos retos e rabiscos. Os bots completam as 5 voltas nas pistas sem ponte; nas pistas com ponte isso depende da etapa 2.
2. ✅ **Posição na pista**: `projectOnTrack` procura só a até 40 m de onde o barco estava (e na pista inteira se não o achar ali), então ninguém troca de passagem no cruzamento. A pista guarda os cruzamentos (`buildTrack(raw, largura, crossings)`), e `collideBoats` recebe a pista para ignorar barcos em níveis diferentes (`onDifferentLevels`). Testes em `test/crossing.test.js`; os bots completam as 5 voltas em "8" (~85 s) e em nós de 3 pontes (~110 s). O Quick Play mantém os mesmos tempos.
3. ✅ **Pista por corrida**: cada sala tem a pista da corrida atual; `room.setNextTrack(desenho)` vale para a próxima largada e o `race:start` leva a pista (`null` = Quick Play). O navegador refaz muretas, linha de chegada e câmera a cada corrida (`world.setTrack`). Pistas sem cruzamento têm o visual do Quick Play; com cruzamento, muretas dos dois lados que sobem com a água, aterro nas rampas e ponte sobre o túnel, semitransparente quando há barco embaixo. Barcos, borrifos e a câmera de trás sobem junto com a água. Ilhotas em cima da pista somem e a baleia vai para trás da pista. Testes em `test/track-per-race.test.js`. Para testar no navegador antes do Grand Prix existir: rodar o servidor com `BICHO_DEV=1`, criar uma sala e `node scripts/dev-sketch.js CODIGO figureEight 3`; a próxima largada usa o desenho.
4. ✅ **Fluxo do Grand Prix no servidor** (`server/room.js`): os 4 pilotos ficam fixos durante o Grand Prix (quem sai vira bot e continua somando). Testes em `test/grand-prix.test.js` e `test/server.test.js`. O que as telas da etapa 5 recebem e mandam:
   - `lobby:mode` ('quick' | 'gp'): o anfitrião escolhe o modo na sala. `room:update` traz `mode`.
   - Ao largar no Grand Prix, a sala entra no estado `drawing`. `room:update` traz `gp.draw` = { drawerId, drawerName, attempt (1 ou 2), reason (por que a 1ª tentativa não deu pista: 'not-closed', 'empty', 'too-many-crossings', 'invalid', 'timeout'), race, startsIn (ms de sorteio na tela), endsIn (ms até o fim do desenho) }.
   - `gp:sketch` (pontos [u, v] de 0 a 1): o sorteado manda o desenho quando levanta o lápis fechando o ciclo, ou quando o tempo acaba (com o que tiver). O servidor espera até 1,5 s depois do fim.
   - `race:start` traz `gp` = { race, races, drawerName, fallback } (fallback = corrida na pista do Quick Play).
   - `race:end` traz `gp` = { race, races, final, table: [{ id, name, character, isBot, points, wins, gained, last }] } já em ordem de classificação.
   - No resultado, o botão do anfitrião (`race:again`) chama o próximo sorteio; depois da 4ª corrida (final), volta para a sala.
5. ✅ **Telas** (`client/src/draw.js`, `client/src/scene/podium.js`, `main.js`): escolha do modo na sala; sorteio com roleta dos retratos; folha de desenho (mouse e toque, círculo de largada, "Continue daqui" ao levantar o lápis cedo, botão Apagar, relógio); tela de espera com lápis rabiscando; aviso da segunda chance com o motivo; linha "Pista 2 de 4 · desenhada por Ana" no HUD; classificação entre corridas; pódio 3D com os 3 primeiros, o campeão levantando a taça e confete. O visual está descrito no `DESIGN.md`.

## Custos

- **API:** nenhum.
- **Servidor (Render, plano grátis):** sem mudança relevante. A pista vai uma vez por corrida (~35 KB) e é gerada em até ~0,4 s.
- **Desenvolvimento:** as etapas 1 e 2 são o maior risco técnico e vêm primeiro, testadas sem interface. As etapas 3 e 5 são as mais longas.
