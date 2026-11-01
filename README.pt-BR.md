# EDCH — Elite Dangerous Companion Helper

[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Português (Brasil)** · [Русский](README.ru.md)

Um companheiro leve para **Elite Dangerous** (Windows). Ele lê o diário do jogo em tempo real e, para cada material de engenharia, mostra **onde encontrá-lo, com sistemas reais e clicáveis ao seu redor**.

## ⚠️ Leia antes de usar o EDCH

**O EDCH não substitui as outras ferramentas da comunidade.** É um projeto independente, sem ligação com [EDMarketConnector](https://github.com/EDCD/EDMarketConnector), [Odyssey Materials Helper](https://github.com/jixxed/ed-odyssey-materials-helper), [EDEngineer](https://github.com/msarilar/EDEngineer), Inara, Spansh ou qualquer outro projeto, e não é afiliado à Frontier Developments. Se alguma dessas ferramentas atende você, continue usando: elas são mais antigas, mais completas e testadas por milhares de jogadores.

**O EDCH foi escrito em grande parte por uma IA (Claude, da Anthropic), com o acompanhamento de um desenvolvedor** que define as funções, testa e aprova cada versão. Por isso a ferramenta pode estar incompleta ou ter bugs ou dados imprecisos. Se encontrar algum, abra uma [issue](../../issues).

**O EDCH não funcionaria sem o trabalho de outras pessoas.** Os dados, as traduções e as buscas vêm de projetos criados e mantidos voluntariamente por membros da comunidade: Spansh, EDDN e EDCD, EDSM, Inara, EDEngineer, Odyssey Materials Helper, Elite Dangerous Almanac, EDRefCard, EDSY, Coriolis… Se o EDCH for útil para você, agradeça, apoie ou contribua com esses projetos. Detalhes em [Créditos](#créditos) e em [NOTICE](NOTICE).

![Ficha de um material: trocas e sistemas em Prosperidade/Expansão (dados de demonstração)](docs/materials.png)

## O que ele faz

- **Inventário ao vivo**: materiais brutos, manufaturados e codificados, organizados como no comerciante de materiais (uma linha por família, graus 1 a 5) com indicador de armazenamento. O armário da nave do Odyssey (dados, componentes, itens, consumíveis) é lido do `ShipLocker.json`.
- **Onde encontrar, com sistemas reais**: cada condição de surgimento vira uma busca no [Spansh](https://spansh.co.uk) ao redor da sua posição.
  - HGE: sistemas povoados em Prosperidade/Expansão, Guerra, Agitação civil, Surto, da Federação ou do Império. Estados de facção antigos demais são ignorados.
  - Emissões codificadas conforme a segurança, zonas de conflito, rastros de alta energia.
  - Planetas onde se pode pousar, ordenados pelo % do material bruto, anéis de gelo ou intocados, sítios Guardiões e Thargoid.
  - Assentamentos do Odyssey e locais de farm conhecidos (Jameson, Dav's Hope, brain trees, cristais…).
  - Clique em um sistema: ele é copiado, pronto para colar no mapa da galáxia. Ao lado, links para Spansh e Inara.
- **Comerciante de materiais mais próximo** do tipo certo, com **sugestões de troca** calculadas sobre o seu estoque (taxas do jogo, levando em conta o que a sua lista de desejos reserva).
- **Engenharia**: todas as modificações, efeitos experimentais, sínteses, desbloqueios do corretor de tecnologia e melhorias do Odyssey, com o que você já possui.
- **Lista de desejos**: adicione modificações (graus, número de rolagens, quantidade). Ela calcula o que falta e a melhor troca para cobrir.
- **Engenheiros**: status e nível lidos do diário, sistema copiável, distância e condições de desbloqueio marcadas automaticamente quando o diário permite verificá-las (armário do Odyssey, porão, materiais).
- **Importação de builds**: cole ou escolha uma exportação do **EDSY** ou do **Coriolis** (SLEF ou Loadout JSON). Cada módulo modificado e seu efeito experimental vão para a lista de desejos. Você também pode partir da sua nave atual.
- **Busca no estilo Inara**: onde comprar ou vender uma mercadoria (por preço ou distância), uma nave, um módulo (classe e classificação) ou um serviço (Interstellar Factors, corretor de tecnologia, comerciante de materiais…) ao seu redor.
- **Navegação**: alcance de salto da sua nave (vazia, cheia, carregada, agora, carga simulada), rota com impulso de estrelas de nêutrons via Spansh e Fleet Carrier (saltos, trítio e duração, como estimativa rápida ou plano detalhado do Spansh com paradas de reabastecimento).
- **Controles e dispositivos**: lê seus atalhos (predefinição ativa, inclusive predefinições diferentes para nave, SRV e a pé) e desenha cada dispositivo. O teclado é desenhado tecla por tecla (QWERTY, AZERTY ou QWERTZ) e o controle de Xbox ou PlayStation com marcadores numerados. HOTAS, joysticks e controles reconhecidos (cerca de 45 modelos: VKB, Virpil, Thrustmaster, Saitek/Logitech, CH…) aparecem sobre a imagem do modelo, com a ação escrita na caixa de cada botão. Os modelos vêm do EDRefCard e são carregados do repositório dele no GitHub. Para um modelo não reconhecido, você escolhe o mais parecido; senão, aparece um esquema simples de eixos, chapéus e botões. Cada controle tem sua legenda e uma cor por modo, com filtros Nave / SRV / A pé, busca e ficha para imprimir.
- **Backup da configuração**: exporta seus atalhos (e configurações gráficas) para um zip em Documentos\EDCH e os restaura com um clique. Sua configuração atual é salva automaticamente antes de cada importação.
- **Missões**: cada missão em andamento com objetivo, destino, tempo restante e progresso; as missões de massacre empilhadas com os abates que cada facção emissora ainda precisa.
- Nas missões de abastecimento e mineração, onde conseguir a mercadoria: estações ordenadas por preço, distância e atualidade dos dados do mercado, com o lucro estimado, e os pontos quentes mais próximos para as missões de mineração.
- **Missões de ala compartilhadas**: os membros da ala que usam o EDCH digitam o mesmo código e veem quem aceitou cada missão compartilhada: você escolhe quais missões compartilhar (ou todas automaticamente). As mensagens passam pelo ntfy.sh, criptografadas de ponta a ponta com esse código. Um som e/ou uma aba lateral piscando (sem janelas do Windows) avisam quando alguém tem uma missão que você não tem, ou quando a ala inteira aceitou.
- **Colonização**: cada depósito de construção com o que falta entregar, o que está no seu porão, as viagens necessárias e uma busca em um clique de onde comprar cada mercadoria.
- **Metas comunitárias**: sua contribuição, sua faixa de recompensa e o nível das metas em que você entrou; todas as metas em andamento pelo Inara com sua chave API.
- **Exploração**: valor dos dados cartográficos não vendidos, ajuda com as amostras de exobiologia (distância das amostras anteriores comparada ao alcance da colônia), espécies possíveis e valores de cada planeta com sinais biológicos, análises não vendidas.
- **Mineração**: resultados dos prospectores ao vivo com alertas para seus alvos e núcleos, tonelagem da sessão; uma busca no estilo Merit Miner de onde minerar e vender nos sistemas da sua potência.
- **Powerplay e sessão**: méritos da semana e da sessão, estado de Powerplay do sistema atual; créditos ganhos por atividade desde que você entrou.
- **Acesso pelo celular**: abra o EDCH no celular ou tablet escaneando um QR code. Um servidor local (desligado por padrão) serve o app na sua rede. Só entram os aparelhos que escanearam o QR code: o IP do PC não basta. "Novo código" desconecta todos os aparelhos. A interface se adapta ao celular (navegação embaixo, painéis em tela cheia) e as alterações na lista de desejos feitas no celular voltam para o PC.
- **Atualizações automáticas**: o EDCH verifica no GitHub se há uma versão nova, mostra um aviso, baixa o instalador quando você pede (soma de verificação conferida) e reinicia para concluir. Pode ser desligado nas Configurações.
- **Sincronização no estilo EDMC**: envio ao vivo para o **EDDN** (mercados, equipamentos, estaleiros, saltos, escaneamentos, rotas), o **EDSM** e o **Inara** (com sua chave API). As regras do EDDN são respeitadas: dados pessoais removidos, posição conferida, uma mensagem recusada nunca é reenviada, nada do seu histórico.

![Um VKB Gladiator com seus atalhos (atalhos de demonstração)](docs/controls.png)

## Dados e privacidade

O EDCH lê o diário do jogo no seu PC. Isto é tudo o que sai dele, e para onde:

- **Spansh**: suas buscas (sistema, material, mercadoria…) e sua posição como ponto de partida.
- **EDDN** (ligado por padrão, como no EDMC; pode ser desligado em Sincronização): dados de mercados, equipamentos, estaleiros, saltos e escaneamentos, sem seus dados pessoais, como o EDDN exige.
- **EDSM e Inara**: nada enquanto você não informar sua própria chave API em Sincronização. Suas chaves ficam no seu PC.
- **ntfy.sh** (só se você ativar a ala compartilhada): suas missões de ala, criptografadas com o código da ala antes de sair do seu PC.
- **GitHub**: só para verificar se existe uma versão nova (pode ser desligado nas Configurações).
- **Acesso pelo celular**: fica na sua rede local; desligado por padrão e protegido pelo QR code.

Nada mais é coletado ou enviado. Suas configurações, chaves e lista de desejos ficam em `%LOCALAPPDATA%\EDCompanionHelper`.

## Idiomas

O EDCH está disponível nos seis idiomas do jogo: inglês (padrão), francês, alemão, espanhol, português (Brasil) e russo. O instalador pergunta o idioma e o app o adota no primeiro uso. Você pode mudá-lo a qualquer momento em **Configurações → Idioma**. Os nomes de materiais, módulos, projetos e efeitos seguem a tradução do jogo; os nomes dos controles ficam como no jogo em inglês.

Para adicionar ou corrigir uma tradução, edite `tools/translations_*.txt` (uma linha por texto: `fr ¦ en ¦ de ¦ es ¦ pt ¦ ru`) e depois rode `python3 tools/gen_locales.py`.

## Instalação

Baixe o instalador (`.exe` ou `.msi`) em [Releases](../../releases), ou a versão portátil `EDCH_<version>_x64-portable.exe`: nada para instalar, rode de qualquer pasta (ela avisa quando sai uma nova versão e abre a página da release). O Windows 10/11 já vem com o WebView2.

O EDCH guarda logs do que faz (Configurações → Logs do aplicativo, com um botão para abrir a pasta). Um modo debug grava um log detalhado separado, para anexar a um relato de bug.

O instalador não tem assinatura digital (um certificado é caro para uma ferramenta gratuita), então o Windows SmartScreen pode mostrar "O Windows protegeu o computador" na primeira vez. Clique em **Mais informações** e depois em **Executar assim mesmo**. As próximas atualizações são oferecidas dentro do EDCH.

No primeiro uso, a pasta do diário é detectada automaticamente (`%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`). Você pode mudá-la em **Configurações**.

## Desenvolvimento

Requisitos: Node 20+, Rust estável e os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) para Windows.

```bash
npm install
npm test            # compila a interface e roda os testes (diário, trocas, consultas ao Spansh, EDDN, atalhos)
npm run app:dev     # abre o app
npm run app:build   # instaladores do Windows em src-tauri/target/release/bundle
npm run demo        # só a interface, no navegador, com um diário de exemplo
```

Estrutura:

- `src-tauri/`: backend em Rust (leitura do diário, arquivos JSON do jogo, chamadas HTTP, arquivos de opções e zips, abertura de links). Não contém lógica do jogo.
- `src/`: interface em TypeScript sem framework.
  - `journal.ts`: estado do comandante a partir dos eventos do diário.
  - `sources.ts`: condições de surgimento transformadas em buscas.
  - `spansh.ts`: chamadas e formatação dos resultados.
  - `trade.ts`: taxas do comerciante de materiais.
  - `eddn.ts`, `uploaders.ts`: mensagens do EDDN, EDSM e Inara.
  - `binds.ts`: arquivos `.binds` e nomes dos dispositivos.
  - `i18n.ts`: camada de tradução.
- `tools/gen_data.py`, `tools/gen_binds.py`, `tools/gen_locales.py`: regeneram os dados de `public/` (veja NOTICE).

Um build para Windows roda a cada push em `main`. Para publicar uma versão, envie uma tag como `v0.8.9`: a Release é publicada e as cópias instaladas oferecem a atualização.

## Roteiro

- Login da Frontier (cAPI, OAuth) para frota, estoque e Fleet Carrier: é preciso um Client ID da Frontier.
- EDDN: esquemas restantes (codexentry, approachsettlement, fssbodysignals, fsssignaldiscovered…).
- Rota de farm otimizada para a lista de desejos.

## Créditos

Dados: EDCD/FDevIDs e msarilar/EDEngineer (MIT), via dseelinger/d47 (MIT). Nomes do jogo traduzidos: Elite Dangerous Almanac (MIT) e EDEngineer. Nomes dos controles e modelos dos dispositivos: EDRefCard (Richard Buckle, MIT). Buscas: Spansh (EDDN). Elite Dangerous é uma marca da Frontier Developments plc. Ferramenta comunitária não oficial e não comercial. Detalhes em [NOTICE](NOTICE).
