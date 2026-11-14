# EDCH — Elite Dangerous Companion Helper

[English](README.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **Português (Brasil)** · [Русский](README.ru.md) · [Code signing policy (política de assinatura)](CODE_SIGNING_POLICY.md)

Um companheiro leve para **Elite Dangerous** (Windows e Linux, x64 e ARM). Ele lê o diário do jogo em tempo real e, para cada material de engenharia, mostra **onde encontrá-lo, com sistemas reais e clicáveis ao seu redor**.

## ⚠️ Leia antes de usar o EDCH

**O EDCH não substitui as outras ferramentas da comunidade.** É um projeto independente, sem ligação com [EDMarketConnector](https://github.com/EDCD/EDMarketConnector), [Odyssey Materials Helper](https://github.com/jixxed/ed-odyssey-materials-helper), [EDEngineer](https://github.com/msarilar/EDEngineer), Inara, Spansh ou qualquer outro projeto, e não é afiliado à Frontier Developments. Se alguma dessas ferramentas atende você, continue usando: elas são mais antigas, mais completas e testadas por milhares de jogadores.

**O EDCH foi escrito em grande parte por uma IA (Claude, da Anthropic), com o acompanhamento de um desenvolvedor** que define as funções, testa e aprova cada versão. Por isso a ferramenta pode estar incompleta ou ter bugs ou dados imprecisos. Se encontrar algum, abra uma [issue](../../issues).

**O EDCH não funcionaria sem o trabalho de outras pessoas.** Os dados, as traduções e as buscas vêm de projetos criados e mantidos voluntariamente por membros da comunidade: Spansh, EDDN e EDCD, EDSM, Inara, EDEngineer, Odyssey Materials Helper, Elite Dangerous Almanac, EDRefCard, EDAssets, EDSY, Coriolis… Se o EDCH for útil para você, agradeça, apoie ou contribua com esses projetos. Detalhes em [Créditos](#créditos) e em [NOTICE](NOTICE).

![Os materiais de engenharia, com o que ainda falta para a lista de desejos (dados de demonstração)](docs/materials.png)

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
- **Lista de desejos**: adicione modificações (graus, número de rolagens, quantidade). Ela calcula o que falta e a melhor troca para cobrir. Cada linha mostra o engenheiro conhecido mais próximo que pode fazê-la. As linhas que sua nave já tem aparecem como feitas, e as linhas avançam sozinhas quando o jogo aplica uma modificação. Um seletor **Simples / Avançado**: Avançado mostra cada linha e os materiais necessários; Simples mostra só a **rota de engenheiros**, os engenheiros a visitar (o mais próximo primeiro) com os materiais que ainda faltam em cada parada. Clique em um engenheiro e o sistema dele é copiado para o mapa da galáxia; depois que a engenharia é feita lá, o próximo sistema é copiado sozinho. **Exportar minha nave para o EDSY** (ou Coriolis) abre sua nave atual no site de builds.
- **Engenheiros**: status e nível lidos do diário, sistema copiável, distância e condições de desbloqueio marcadas automaticamente quando o diário permite verificá-las (armário do Odyssey, porão, materiais). O jogo completa os dados do EDCH: cada engenharia do diário (quem fez qual modificação, em qual grau) é guardada.
- **Importação de builds**: cole ou escolha uma exportação do **EDSY** ou do **Coriolis** (SLEF ou Loadout JSON). Cada módulo modificado e seu efeito experimental vão para a lista de desejos. Você também pode partir da sua nave atual. Um **link EDOMH** ("Export to EDOMH" do EDSY e do Coriolis) também funciona: colado aqui, ou aberto direto no EDCH se você permitir nas Configurações.
- **Busca no estilo Inara**: onde comprar ou vender uma mercadoria (por preço ou distância), uma nave, um módulo (classe e classificação) ou um serviço (Interstellar Factors, corretor de tecnologia, comerciante de materiais…) ao seu redor. Uma aba **Facção** encontra os sistemas onde uma facção menor está presente ou no controle, pelo estado da facção. Cada estação mostra seu tipo com um ícone (Coriolis, Orbis, posto avançado, carrier, porto planetário…).
- **Navegação**: alcance de salto da sua nave (vazia, cheia, carregada, agora, carga simulada), rota com impulso de estrelas de nêutrons via Spansh e Fleet Carrier (saltos, trítio e duração, como estimativa rápida ou plano detalhado do Spansh com paradas de reabastecimento).
- **Controles e dispositivos**: lê seus atalhos (predefinição ativa, inclusive predefinições diferentes para nave, SRV e a pé) e desenha cada dispositivo. O teclado é desenhado tecla por tecla (QWERTY, AZERTY ou QWERTZ) e o controle de Xbox ou PlayStation com marcadores numerados. HOTAS, joysticks e controles reconhecidos (cerca de 60 modelos: VKB, Virpil, Thrustmaster, Saitek/Logitech, CH…) aparecem sobre a imagem do modelo, com a ação escrita na caixa de cada botão. Os modelos vêm do EDRefCard e são carregados do repositório dele no GitHub. Para um modelo não reconhecido, você escolhe o mais parecido; senão, aparece um esquema simples de eixos, chapéus e botões. Cada controle tem sua legenda e uma cor por modo, com filtros Nave / SRV / A pé, busca e ficha para imprimir. Escolha seu teclado (AZERTY, QWERTY ou QWERTZ) e o formato (ISO ou ANSI). **Configurar** faz uma cópia das suas predefinições chamada `…_EDCH` (as do jogo nunca são alteradas) e deixa você mudar um comando clicando nele no desenho ou acionando-o no seu dispositivo; aperte qualquer botão ou tecla e a página mostra o que ele faz. As predefinições padrão do jogo também aparecem.
- **Backup da configuração**: exporta seus atalhos (e configurações gráficas) para um zip em Documentos\EDCH e os restaura com um clique. Sua configuração atual é salva automaticamente antes de cada importação.
- **Missões**: cada missão em andamento com objetivo, destino, tempo restante e progresso; as missões de massacre empilhadas com os abates que cada facção emissora ainda precisa.
- Nas missões de abastecimento e mineração, onde conseguir a mercadoria: estações ordenadas por preço, distância e atualidade dos dados do mercado, com o lucro estimado, e os pontos quentes mais próximos para as missões de mineração.
- **Missões de ala compartilhadas**: os membros da ala que usam o EDCH digitam o mesmo código e veem quem aceitou cada missão compartilhada: você escolhe quais missões compartilhar (ou todas automaticamente). As mensagens passam pelo ntfy.sh, criptografadas de ponta a ponta com esse código. Um som e/ou uma aba lateral piscando (sem janelas do Windows) avisam quando alguém tem uma missão que você não tem, ou quando a ala inteira aceitou.
- **Colonização**: cada depósito de construção com o que falta entregar, o que está no seu porão, as viagens necessárias e uma busca em um clique de onde comprar cada mercadoria.
- **Metas comunitárias**: sua contribuição, sua faixa de recompensa e o nível das metas em que você entrou; todas as metas em andamento pelo Inara com sua chave API.
- **Exploração**: valor dos dados cartográficos não vendidos, ajuda com as amostras de exobiologia (distância das amostras anteriores comparada ao alcance da colônia), espécies possíveis e valores de cada planeta com sinais biológicos, análises não vendidas.
- **Mineração**: resultados dos prospectores ao vivo com alertas para seus alvos e núcleos, tonelagem da sessão; uma busca no estilo Merit Miner de onde minerar e vender nos sistemas da sua potência.
- **Powerplay e sessão**: méritos da semana e da sessão, estado de Powerplay do sistema atual; créditos ganhos por atividade desde que você entrou. Um botão **Zerar contadores** recomeça os contadores de sessão, mineração ou Powerplay.
- **Thargoides**: os Thargoides que você abateu por tipo de nave (batedores, Cyclops, Basilisk, Medusa, Hydra…), nesta sessão e nos últimos 60 dias de diário, com seus títulos, e as zonas de conflito AX em que você entrou.
- **BGS**: acompanhe uma facção menor. Os sistemas dela com a influência, a diferença para a rival mais próxima, os estados e alertas (conflito, risco de retirada, rival próxima, expansão possível, dados antigos), o que fazer em cada sistema, e a **tendência**: a variação média de influência por dia e a influência esperada em 3 dias, com um alerta "Em perigo em 3 dias". O que você fez por ela desde o tick do BGS, em 24 horas ou 7 dias (missões e sua influência, recompensas, títulos de combate, comércio, cartografia, e o que contou contra ela), e uma rota de atualização pelos sistemas com dados antigos. Seu diário é lido primeiro; "Atualizar" carrega os sistemas da facção do Spansh e o histórico de influência deles do EDSM (guardado por 7 dias). Clique em um sistema da rota: ao chegar, o próximo é copiado para o mapa da galáxia. Com o **bot do Discord** do seu esquadrão (página Sincronização, opcional, cada esquadrão hospeda o seu): seu trabalho de BGS e os sistemas visitados vão para o fórum dele, uma postagem por sistema, e a coluna **Privado** mostra sua última visita ou a de um colega quando mais recente (marcada Discord).
- **Acesso remoto**: abra o EDCH no celular ou tablet escaneando um QR code. Um servidor local (desligado por padrão) serve o app na sua rede. Só entram os aparelhos que escanearam o QR code: o IP do PC não basta. "Novo código" desconecta todos os aparelhos. A interface se adapta ao celular (navegação embaixo, painéis em tela cheia) e as alterações na lista de desejos feitas no celular voltam para o PC. Também pode abrir uma página sozinha em um navegador, para uma segunda tela, e um modo de tela cheia mostra só a página atual.
- **Temas**: temas prontos (incluindo um tema claro "Dia"), cores próprias e modo OLED. Cores claras ou escuras demais para ler são ajustadas automaticamente.
- **Interface**: o menu é agrupado pelo uso no jogo e pode ser reorganizado (arraste páginas, oculte-as, escolha quais o celular mostra). **Todas as tabelas podem ser ordenadas**: clique no título de uma coluna, de novo para inverter a ordem, uma terceira vez para a ordem habitual.
- **Atualizações automáticas**: o EDCH verifica no GitHub se há uma versão nova, mostra um aviso, baixa o instalador quando você pede (soma de verificação conferida) e reinicia para concluir. Pode ser desligado nas Configurações.
- **Sincronização no estilo EDMC**: envio ao vivo para o **EDDN** (mercados, equipamentos, estaleiros, saltos, escaneamentos, rotas), o **EDSM** e o **Inara** (com sua chave API). As regras do EDDN são respeitadas: dados pessoais removidos, posição conferida, uma mensagem recusada nunca é reenviada, nada do seu histórico. Um seletor de **modo de compartilhamento** na barra superior: **Normal**, **BGS** (facções, influência, estados e conflitos, suas missões e recompensas ficam privados: nada disso vai para o EDDN, EDSM ou Inara) ou **Invisível** (nada é enviado).

![O teclado desenhado em AZERTY ISO, com seus atalhos (atalhos de demonstração)](docs/controls.png)

<p>
<img src="docs/wishlist.png" width="49%" alt="A lista de desejos no modo Avançado: cada linha e os materiais necessários">
<img src="docs/phone.png" width="23%" alt="A rota de engenheiros (modo Simples) no celular, pelo acesso remoto">
</p>
<p>
<img src="docs/bgs.png" width="49%" alt="A página BGS: os sistemas de uma facção, alertas, tendência e previsão (dados de demonstração)">
<img src="docs/colonisation.png" width="49%" alt="Colonização: porões e um canteiro de obras">
</p>
<p>
<img src="docs/day-theme.png" width="68%" alt="A página Engenheiros no tema claro &quot;Dia&quot;">
</p>

## Dados e privacidade

O EDCH lê o diário do jogo no seu PC. Isto é tudo o que sai dele, e para onde:

- **Spansh**: suas buscas (sistema, material, mercadoria, facção menor…) e sua posição como ponto de partida.
- **EDDN** (ligado por padrão, como no EDMC; pode ser desligado em Sincronização): dados de mercados, equipamentos, estaleiros, saltos e escaneamentos, sem seus dados pessoais, como o EDDN exige.
- **EDSM e Inara**: nada sobre você enquanto você não informar sua própria chave API em Sincronização; suas chaves ficam no seu PC. O EDCH também lê dados públicos do EDSM quando você pede (os corpos de um sistema na página Exploração, o histórico de influência de uma facção na página BGS): só o nome do sistema é enviado.
- **O bot do Discord EDCH** (a cópia própria do seu esquadrão, no servidor dele): nada enquanto você não colar sua chave em Sincronização e ligar a chave. Depois, logo após uma ação de BGS ou uma chegada, ou a cada 5 ou 15 minutos, como você escolher, o que você fez pelas facções que o esquadrão acompanha e o que o jogo mostrava nos sistemas visitados onde uma delas está (sistemas, missões e sua influência, créditos, influência e estados das facções; sem nome de comandante), escrito em um canal privado do servidor do Discord do seu esquadrão. Em troca, sua página BGS mostra os sistemas que seus colegas viram (nunca reenviados).
- **ntfy.sh** (só se você ativar a ala compartilhada): suas missões de ala, criptografadas com o código da ala antes de sair do seu PC.
- **tick.edcd.io** (só enquanto a página BGS está aberta, com uma facção acompanhada): pergunta o horário do último tick do BGS. Nada é enviado junto.
- **GitHub**: só para verificar se existe uma versão nova (pode ser desligado nas Configurações).
- **Acesso remoto**: fica na sua rede local; desligado por padrão e protegido pelo QR code.

Nada mais é coletado ou enviado. Suas configurações, chaves, lista de desejos o histórico da página BGS e o que seu esquadrão compartilhou (7 dias) ficam em `%LOCALAPPDATA%\EDCompanionHelper`.

**Os arquivos do jogo**: o EDCH lê o diário e os arquivos que o jogo escreve ao lado dele (`Status.json`, `Cargo.json`, `Market.json`…), e seus arquivos de controles (`Options\Bindings`) para mostrá-los, exportá-los e importá-los; ele só escreve um arquivo de controles para as próprias predefinições (chamadas `…_EDCH`), nunca as do jogo. Na pasta de instalação do jogo, os **únicos** arquivos que o EDCH toca são as predefinições de controles padrão (`ControlSchemes\*.binds`), **somente leitura**, para mostrá-las na página Controles e copiá-las. Nada mais do jogo é lido ou alterado.

## Idiomas

O EDCH está disponível nos seis idiomas do jogo: inglês (padrão), francês, alemão, espanhol, português (Brasil) e russo. O instalador pergunta o idioma e o app o adota no primeiro uso. Você pode mudá-lo a qualquer momento em **Configurações → Idioma**. Os nomes de materiais, módulos, projetos e efeitos seguem a tradução do jogo; os nomes dos controles ficam como no jogo em inglês.

Para adicionar ou corrigir uma tradução, edite `public/locales/<idioma>.json` (o inglês é a referência); veja [docs/TRANSLATING.md](docs/TRANSLATING.md). `npm run i18n:check` lista os textos que faltam.

## Instalação

Baixe o instalador (`.exe` ou `.msi`) em [Releases](../../releases), ou a versão portátil `EDCH_<version>_windows_x64-portable.exe`: nada para instalar, rode de qualquer pasta (ela avisa quando sai uma nova versão e abre a página da release). O Windows 10/11 já vem com o WebView2. O Windows em ARM tem seu próprio instalador e exe portátil (`arm64`); o Linux em ARM seus `.AppImage`, `.deb` e `.rpm` (`arm64`). A atualização automática escolhe a versão do seu processador.

**Linux** (Steam/Proton, Steam Deck incluso): cada release também traz um `.AppImage` (qualquer distribuição: torne-o executável e rode), um `.deb` (Debian, Ubuntu, Mint, Pop!_OS), um `.rpm` (Fedora, openSUSE), um `PKGBUILD` para Arch Linux e derivadas (`makepkg -si` na pasta onde você o salvou) e um `.flatpak` experimental (`flatpak install EDCH_….flatpak`). O EDCH encontra sozinho o diário na pasta Proton do Steam. No Linux, as atualizações não são instaladas automaticamente: o EDCH abre a página da release.

O EDCH guarda logs do que faz (Configurações → Logs do aplicativo, com um botão para abrir a pasta). Um modo debug grava um log detalhado separado, para anexar a um relato de bug.

O instalador não tem assinatura digital (um certificado é caro para uma ferramenta gratuita), então o Windows SmartScreen pode mostrar "O Windows protegeu o computador" na primeira vez. Clique em **Mais informações** e depois em **Executar assim mesmo**. As próximas atualizações são oferecidas dentro do EDCH.

No primeiro uso, a pasta do diário é detectada automaticamente (`%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`). Você pode mudá-la em **Configurações**.

## Desenvolvimento

Requisitos: Node 20+, Rust estável e os [pré-requisitos do Tauri](https://tauri.app/start/prerequisites/) para o seu sistema.

```bash
npm install
npm test            # compila a interface e roda os testes (diário, trocas, consultas ao Spansh, EDDN, atalhos)
npm run app:dev     # abre o app
npm run app:build   # instaladores do Windows em src-tauri/target/release/bundle
npm run demo        # só a interface, no navegador, com um diário de exemplo
```

Estrutura:

- `src/`: interface em TypeScript sem framework, em camadas (platform, game, state, ui, services, features, views, app); `src-tauri/`: backend em Rust (diário, HTTP, arquivos de opções, servidor de acesso remoto, atualizações), sem lógica de jogo. Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [CONTRIBUTING.md](CONTRIBUTING.md) (em inglês).
- `tools/gen_data.py`, `tools/gen_binds.py`, `tools/gen_game_locales.py`: regeneram os dados de `public/` (veja NOTICE).

Cada push em `main` ou em um branch `prerelease/<version>` compila todas as plataformas; um push em `prerelease/<version>` também publica uma pré-release (oferecida a quem marcou "Oferecer também as pré-releases"). Para publicar uma versão, envie uma tag como `v0.10.14`: a Release é publicada e as cópias instaladas oferecem a atualização.

## Roteiro

- Login da Frontier (cAPI, OAuth) para frota, estoque e Fleet Carrier: é preciso um Client ID da Frontier.
- EDDN: esquemas restantes (codexentry, approachsettlement, fssbodysignals, fsssignaldiscovered…).
- Rota de farm otimizada para a lista de desejos.

## Apoiar o EDCH

O EDCH é gratuito, sem anúncios, e vai continuar assim. Ele é criado, testado e mantido por CMDR MDLuffy, e desenvolvido com a ajuda da IA Claude (Anthropic). Se ele for útil para você, você pode apoiar o projeto no [Ko-fi](https://ko-fi.com/bknadir): isso paga as ferramentas (a assinatura da IA), o tempo de testes e correções e, no futuro, a assinatura do aplicativo.

## Créditos

Dados: EDCD/FDevIDs e msarilar/EDEngineer (MIT), via dseelinger/d47 (MIT). Nomes do jogo traduzidos: Elite Dangerous Almanac (MIT) e EDEngineer. Nomes dos controles e modelos dos dispositivos: EDRefCard (Richard Buckle, Jason Bramley — edrefcard2, MIT). Ícones das estações e animação de carregamento: EDAssets (SpyTec, MIT). Buscas: Spansh (EDDN). Histórico de influência das facções menores: EDSM. Tick do BGS: o detector de tick do EDCD. A página BGS partiu do protótipo de Cyberpunk Philou. Elite Dangerous é uma marca da Frontier Developments plc. Ferramenta comunitária não oficial e não comercial. Detalhes em [NOTICE](NOTICE).
