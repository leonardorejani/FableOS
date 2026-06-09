# Aplicativos do FableOS

Documentação detalhada dos 12 aplicativos nativos. Para o núcleo do sistema (window manager, VFS, temas), veja [ARQUITETURA.md](./ARQUITETURA.md).

## Índice

- [Terminal](#terminal)
- [Arquivos](#arquivos)
- [Editor de código](#editor-de-código)
- [Paint](#paint)
- [Calculadora](#calculadora)
- [Synth Studio](#synth-studio)
- [Fluid](#fluid)
- [Fractal](#fractal)
- [Tetris](#tetris)
- [Monitor](#monitor)
- [Settings](#settings)
- [About](#about)

## Terminal

O Terminal é a interface de linha de comando do FableOS, executando o **fsh** (Fable Shell) v1.0. Ele opera sobre o sistema de arquivos virtual (VFS) do sistema e também serve como ponto de controle do ambiente: abre aplicativos, troca papel de parede, altera a cor de destaque e reinicia o FableOS. O prompt segue o formato `user@fableos:~$`, com o diretório atual abreviado (`/home/user` vira `~`), e o título da janela acompanha o diretório de trabalho.

### Funcionalidades

- Interpretador próprio com 22 comandos embutidos (arquivos, navegação, sistema e personalização).
- Tokenização com suporte a aspas simples e duplas; aspas não fechadas geram erro explícito (`aspas não fechadas`).
- Resolução de caminhos relativos, absolutos e com `~`/`~/...` a partir do diretório atual.
- Redirecionamento de saída no `echo` com `>` (sobrescreve) e `>>` (anexa).
- Tab completion contextual: nomes de comando no primeiro token, ids de aplicativos após `open`, ids de papel de parede após `wallpaper` e caminhos do VFS nos demais argumentos. Completa pelo maior prefixo comum e lista as alternativas quando há empate (diretórios destacados na cor de acento).
- Histórico de comandos da sessão navegável com ↑/↓, preservando o rascunho digitado antes de navegar.
- Saída colorida por spans (`dim`, `red`, `green`, `yellow`, `accent`, negrito e blocos com cor de fundo), usada no `ls`, `help`, `neofetch` e mensagens de erro.
- `ls -l` exibe tipo, tamanho (bytes para arquivos, contagem de itens para diretórios) e data de modificação.
- `neofetch` com arte ASCII, informações do sistema (OS, "kernel" React 19, shell, resolução, uptime da sessão, navegador detectado por user agent, estatísticas do VFS) e paleta de cores.
- Auto-scroll para o fim a cada saída, com "stick to bottom" inteligente: um `ResizeObserver` mantém o fim visível ao redimensionar a janela, mas só se o usuário já estava perto do fim (limiar de 24 px).
- Clique em qualquer ponto devolve o foco ao input — exceto quando há texto selecionado no scrollback, para não atrapalhar a cópia.
- `reboot` recarrega a página após 450 ms (timer cancelado se a janela fechar antes).
- Mensagem de boas-vindas no primeiro render e tratamento de exceções do interpretador com prefixo `fsh:`.

### Atalhos e comandos

Atalhos de teclado:

| Atalho | Ação |
|---|---|
| `Enter` | Executa o comando digitado |
| `Tab` | Completa comando, id ou caminho; lista opções em caso de ambiguidade |
| `↑` / `↓` | Navega no histórico (preserva o rascunho atual) |
| `Ctrl+L` | Limpa a tela |
| `Ctrl+C` | Cancela a linha atual (ecoa `^C`); só age se não houver texto selecionado |

Tabela completa de comandos do fsh:

| Comando | Sintaxe | Descrição |
|---|---|---|
| `help` | `help` | Lista os comandos disponíveis |
| `clear` | `clear` | Limpa a tela do terminal |
| `pwd` | `pwd` | Mostra o diretório atual |
| `ls` | `ls [-l] [caminho]` | Lista arquivos e diretórios |
| `cd` | `cd [caminho]` | Muda o diretório atual (sem argumento vai para `~`) |
| `cat` | `cat <arquivo>` | Mostra o conteúdo de um arquivo (aceita vários) |
| `echo` | `echo <texto> [> arq \| >> arq]` | Imprime texto ou grava em arquivo |
| `mkdir` | `mkdir <caminho>` | Cria diretório (recursivo) |
| `touch` | `touch <arquivo>` | Cria arquivo vazio ou atualiza a data |
| `rm` | `rm [-r] <caminho>` | Remove arquivo ou diretório (`-r` para diretório não vazio) |
| `mv` | `mv <de> <para>` | Move ou renomeia; destino diretório recebe o item dentro dele |
| `cp` | `cp <de> <para>` | Copia arquivo ou diretório (recursivo; impede copiar para dentro de si) |
| `date` | `date` | Mostra data e hora atuais em pt-BR |
| `whoami` | `whoami` | Mostra o usuário atual (`user`) |
| `history` | `history` | Histórico numerado de comandos da sessão |
| `apps` | `apps` | Lista os aplicativos instalados (id, nome, descrição) |
| `open` | `open <app> [caminho]` | Abre um aplicativo; o caminho extra vira payload do editor |
| `wallpaper` | `wallpaper <id\|list>` | Troca o papel de parede ou lista os disponíveis |
| `theme` | `theme <hex>` | Muda a cor de destaque (aceita `#rgb` ou `#rrggbb`) |
| `neofetch` | `neofetch` | Informações do sistema com estilo |
| `reboot` | `reboot` | Reinicia o FableOS (recarrega a página) |

### Por dentro

O coração do terminal é a função `executeCommand(raw, ctx)`, que recebe a linha crua e um `ShellContext` (`cwd` + histórico) e devolve um `CommandResult` — uma lista de `TermLine` mais flags opcionais (`clear`, `newCwd`, `reboot`). Esse desenho mantém o interpretador puro em relação à UI: o componente React só concatena linhas, troca o `cwd` e agenda o reboot. Cada linha é composta de `TermSpan`s tipados (texto, cor semântica, negrito, fundo), de modo que a renderização colorida é dado, não markup.

A tokenização é um autômato de um único passe sobre a string: caracteres são acumulados no token corrente, aspas simples/duplas alternam um estado `quote` (permitindo argumentos com espaços, como `echo "ola mundo" > arq.txt`), e a flag `hasToken` garante que `""` produza um token vazio em vez de ser engolido. A mesma string de entrada alimenta o tab completion, que divide o input no último espaço, decide o vocabulário pelo primeiro token já digitado (comandos, ids de app, ids de wallpaper ou entradas do VFS) e aplica o clássico algoritmo de maior prefixo comum antes de listar alternativas.

## Arquivos

O Arquivos é o gerenciador de arquivos gráfico do FableOS. Apresenta o conteúdo do VFS em uma grade de ícones, com barra lateral de atalhos, breadcrumb navegável e operações completas de criação, renomeação e exclusão — tudo reativo: qualquer mudança feita por outro aplicativo (Terminal, Editor, Paint) aparece imediatamente.

### Funcionalidades

- Navegação por grade de ícones com seleção, duplo clique para abrir (diretório navega; arquivo abre no Editor com o caminho como payload).
- Barra lateral "Locais" com atalhos fixos: Início, Documentos, Imagens, Músicas, Projetos e Raiz, com indicação do local ativo.
- Breadcrumb clicável segmento a segmento, com rolagem horizontal quando o caminho é longo.
- Botões Voltar (pilha de histórico de navegação) e Acima (diretório pai).
- Criação de pasta e de arquivo vazio com edição de nome inline na própria grade.
- Renomeação inline (F2 ou botão): o input pré-seleciona o nome sem a extensão, no estilo dos exploradores de desktop.
- Exclusão com modal de confirmação ("Esta ação não pode ser desfeita"), avisando quando uma pasta inteira será removida.
- Validação de nomes: rejeita `.` e `..` (reservados) e nomes contendo `/`; impede sobrescrever item existente na criação.
- Ícones por tipo/extensão: `md`/`txt` (documento), `js`/`ts`/`jsx`/`tsx` (script), imagens, `json` e genérico; pastas têm ícone próprio.
- Barra de status com contagem de itens, contagem de arquivos e tamanho total recursivo do diretório (formatado em B/KB/MB…); mostra nome e tamanho do item selecionado.
- Banner de erro descartável para falhas de operação no VFS.
- Auto-recuperação: se o diretório atual for removido por outro app, o gerenciador sobe automaticamente até o ancestral existente mais próximo.
- Abre em um caminho inicial vindo de payload (quando válido e diretório); caso contrário, em `/home/user`.
- Título da janela acompanha a pasta atual ("Arquivos — Raiz", "Arquivos — documentos"…).

### Atalhos e comandos

| Atalho | Ação |
|---|---|
| `Enter` | Abre o item selecionado |
| `F2` | Renomeia o item selecionado |
| `Delete` | Pede confirmação de exclusão do item selecionado |
| `Backspace` | Sobe para o diretório pai |
| `Escape` | Limpa a seleção (ou cancela edição/modal quando abertos) |
| `←` / `→` | Move a seleção entre os itens da grade |
| `Home` / `End` | Seleciona o primeiro / último item |
| Duplo clique | Abre pasta ou arquivo |

### Por dentro

O componente assina `useVfs(s => s.version)`, um contador incrementado pelo VFS a cada mutação. A listagem do diretório (`list(path)`) e os agregados da barra de status são `useMemo` dependentes de `path` e `version`, então qualquer escrita — local ou de outro aplicativo — invalida exatamente o que precisa ser recalculado, sem polling nem eventos manuais. O efeito de auto-recuperação usa o mesmo `version`: quando o caminho atual deixa de ser diretório, um laço `while` sobe por `parentPath` até encontrar um ancestral válido.

Criação e renomeação compartilham a mesma máquina de estados (`EditingState` com `mode: 'new-folder' | 'new-file' | 'rename'`) e o mesmo componente `NameInput`, que confirma com Enter, cancela com Escape/blur e interrompe a propagação de eventos para não disparar os atalhos globais da grade. Um detalhe de polimento: o `setSelectionRange` do input seleciona apenas o trecho antes do último ponto, deixando a extensão intacta ao renomear.

## Editor de código

O Editor ("Código") é um editor de texto com realce de sintaxe que lê e grava arquivos do VFS. Suporta detecção automática de linguagem pela extensão, seleção manual, números de linha com destaque da linha ativa, indicador de alterações não salvas e modais de abrir/salvar por caminho.

### Funcionalidades

- Abertura de arquivo por payload (vindo do Arquivos ou do `open` do Terminal), pelo botão "Abrir" ou por Ctrl+O; salvar e salvar como gravam no VFS.
- Realce de sintaxe para cinco linguagens além de texto puro: JavaScript/TypeScript, JSON, Markdown, CSS e HTML.
- Detecção automática de linguagem pela extensão (`ts`, `tsx`, `mjs`, `json`, `md`, `css`, `html`, `svg`, entre outras), com seletor manual que sobrepõe a detecção.
- Gutter de números de linha com a linha ativa destacada na cor de acento, sincronizado com a rolagem do editor via `transform: translateY`.
- Indicador de documento modificado: prefixo "•" no título da janela e estado "Modificado/Salvo/Novo" na barra de status.
- Barra de status com caminho do arquivo, posição do cursor (Ln/Col), total de caracteres e linguagem efetiva.
- Tecla Tab insere dois espaços preservando o histórico de undo nativo (via `document.execCommand`, com fallback para `setRangeText`).
- Modal de caminho (`PathModal`) reutilizado para abrir e salvar como, com validação inline (caminho vazio, terminando em `/`, raiz) e aviso de perda de alterações não salvas ao abrir outro arquivo.
- Toasts temporários (3,5 s) para confirmações de salvamento e erros de leitura/gravação.
- Ao carregar novo documento: rolagem ao topo, cursor no início e foco no editor; ao fechar um modal, o foco volta ao textarea.

### Atalhos e comandos

| Atalho | Ação |
|---|---|
| `Ctrl+S` (ou `Cmd+S`) | Salvar (abre "Salvar como" se o arquivo não tem caminho) |
| `Ctrl+Shift+S` | Salvar como |
| `Ctrl+O` | Abrir arquivo |
| `Tab` | Insere dois espaços (preservando undo) |
| `Enter` / `Escape` (no modal) | Confirma / cancela o modal de caminho |

### Por dentro

O editor usa a técnica clássica de **pre + textarea sobrepostos**: um `<pre>` com o HTML realçado fica atrás (com `pointer-events: none` e `aria-hidden`), e um `<textarea>` com texto transparente e caret branco fica na frente, ambos com métricas tipográficas idênticas (`fontSize: 13`, `lineHeight: 20px`, `tabSize: 2`, `whitespace-pre`, `wrap="off"`). Toda a edição — seleção, undo, IME, clipboard — é nativa do textarea; o realce é só pintura. A rolagem dos dois é sincronizada no evento `onScroll` e re-sincronizada num `useLayoutEffect` após cada re-render do highlight, evitando o "salto" de um frame.

O módulo de realce (`highlight.ts`) é um tokenizador por regex com saída em HTML seguro: a função `paintTokens` percorre o código com uma regex global de grupos alternativos, pinta cada match conforme o primeiro grupo capturado e escapa (`esc`) tudo que fica entre os matches — nada chega ao `dangerouslySetInnerHTML` sem escape. Dois casos fogem do regex puro: template literals de JS, onde `paintTemplate` faz varredura manual com contagem de chaves balanceadas para que `${f({ a: 1 })}` seja uma única interpolação; e HTML, processado em duas fases — primeiro a tag inteira como token, depois sub-tokenização interna de nome e atributos com `ATTR_RE`.

## Paint

O Paint é o aplicativo de desenho do FableOS: um canvas branco redimensionável com pincel, borracha, formas geométricas, balde de tinta com tolerância, conta-gotas, paleta de cores, desfazer/refazer e exportação — tanto como download de PNG quanto gravando no VFS em `/home/user/imagens`.

### Funcionalidades

- Sete ferramentas: pincel, borracha, linha, retângulo, elipse, balde de tinta e conta-gotas, com atalhos numéricos 1–7.
- Traço do pincel/borracha suavizado por curvas quadráticas e consumo de `getCoalescedEvents()` para não perder pontos em movimentos rápidos.
- Pré-visualização ao vivo das formas em um canvas de overlay separado, sem tocar o desenho até soltar o ponteiro; preview circular do tamanho do pincel ao passar o mouse.
- Shift como restrição geométrica: linha travada em múltiplos de 45°, retângulo vira quadrado e elipse vira círculo.
- Balde de tinta com tolerância por canal (24) para lidar com bordas com antialias.
- Conta-gotas lê o pixel real do canvas (respeitando devicePixelRatio) e retorna automaticamente à ferramenta anterior.
- Desfazer/refazer com até 30 estados, armazenados como snapshots PNG (data URL); descarte de restaurações obsoletas quando o usuário desfaz/refaz em sequência rápida.
- Paleta fixa de 16 cores, seletor de cor personalizada (`<input type="color">`) e exibição do hex atual.
- Espessura de 1 a 40 px com slider, atalhos `[`/`]` e amostra visual do diâmetro.
- Limpar tudo com modal de confirmação (reversível por Ctrl+Z).
- Exportação: botão "PNG" baixa `fableos-desenho.png`; "Salvar" grava o data URL como arquivo `.png` no VFS, com aviso de sobrescrita quando o nome já existe e sanitização do nome (remove `/` e `\`).
- Canvas ciente de devicePixelRatio (nítido em telas HiDPI) e que **preserva o desenho ao redimensionar a janela**, redesenhando o conteúdo salvo no novo tamanho (ResizeObserver com coalescência por `requestAnimationFrame`).
- Atalhos de teclado ativos apenas quando a janela do Paint está em foco; toasts de feedback para ações e erros.

### Atalhos e comandos

| Atalho | Ação |
|---|---|
| `1`–`7` | Seleciona pincel, borracha, linha, retângulo, elipse, balde, conta-gotas |
| `[` / `]` | Diminui / aumenta a espessura do traço |
| `Shift` (arrastando) | Trava linha em 45°; quadrado/círculo perfeitos |
| `Ctrl+Z` | Desfazer |
| `Ctrl+Shift+Z` ou `Ctrl+Y` | Refazer |
| `Ctrl+S` | Abre o modal de salvar no VFS |
| `Enter` / `Escape` (nos modais) | Confirma / cancela |

### Por dentro

O preenchimento do balde é um **flood fill scanline iterativo** (`floodFill.ts`): em vez de empilhar pixel a pixel (ou recursão, que estoura a pilha em áreas grandes), cada item da pilha é o início de um trecho horizontal. O algoritmo caminha para a esquerda até o limite do trecho contíguo, varre para a direita pintando, e agenda no máximo um seed por "span" nas linhas acima e abaixo — as flags `spanAbove`/`spanBelow` evitam empilhar pixels redundantes da mesma faixa. Um bitmap `Uint8Array` de visitados garante terminação mesmo quando a cor de preenchimento cai dentro da tolerância da cor alvo, e a comparação por canal com tolerância de 24 absorve o antialias das bordas dos traços.

A arquitetura de desenho usa dois canvas sobrepostos: o canvas principal guarda a arte e o overlay recebe os eventos de ponteiro, o cursor de pré-visualização e o "rascunho" das formas — assim a forma em arraste é redesenhada a cada movimento com um simples `clearRect`, sem precisar restaurar o desenho de fundo. O undo das formas guarda o snapshot *antes* do commit (`pendingSnap`), de modo que só entra na pilha se a forma realmente for aplicada. O traço do pincel passa pelo filtro de suavização de pontos médios: cada segmento é uma `quadraticCurveTo` do ponto médio anterior ao novo ponto médio, usando a posição real do ponteiro como ponto de controle — o que transforma a sequência de eventos discretos em uma curva contínua.

## Calculadora

A Calculadora é uma calculadora científica orientada a expressões: em vez de simular registradores de calculadora de mesa, o usuário digita (ou monta pelos botões) uma expressão completa — `sin(45) + 2^10 / ans` — que é tokenizada e avaliada por um parser próprio, com resultado parcial exibido ao vivo durante a digitação.

### Funcionalidades

- Avaliação de expressões com `+`, `-`, `*`, `/`, `%` (módulo), `^` (potência, associativa à direita), parênteses e sinais unários.
- Funções: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `log` (base 10), `ln`, `sqrt`, `abs`; constantes `pi`/`π` e `e`; variável `ans` com o último resultado.
- Modos de ângulo DEG/RAD aplicados às funções trigonométricas (e inversas), com a escolha persistida em `localStorage`.
- Resultado ao vivo: a expressão é avaliada silenciosamente a cada tecla; erros e resultados não finitos são suprimidos até o usuário pedir `=`.
- Símbolos "amigáveis" aceitos na entrada: `×`, `÷`, `−`, `√`, `π`; vírgula é aceita como separador decimal.
- Histórico das últimas 50 operações, persistido em `localStorage`, com restauração da expressão por clique e botão de limpar.
- Inserções dos botões respeitam a posição do cursor no campo de expressão (substituindo seleções), com reposicionamento do caret via `useLayoutEffect`.
- Captura de teclado fora do input: dígitos e operadores são inseridos no caret, `Enter`/`=` avalia, `Esc` limpa, `Backspace` apaga.
- Mensagens de erro em português: "Divisão por zero", "Função desconhecida: …", "Símbolo desconhecido: …", "Sintaxe inválida", "Resultado indefinido".
- Formatação de resultado com até 12 dígitos significativos, sem zeros à direita, e notação científica para |x| ≥ 1e12 ou |x| ≤ 1e-9.

### Atalhos e comandos

| Atalho | Ação |
|---|---|
| `Enter` ou `=` | Avalia a expressão |
| `Escape` | Limpa tudo |
| `Backspace` | Apaga (seleção ou caractere anterior ao caret) |
| `0-9 + - * / % ^ ( ) . ,` | Inseridos diretamente na expressão (vírgula vira ponto) |

### Por dentro

O `parser.ts` implementa um **parser recursivo descendente** clássico, com a gramática documentada no topo do arquivo:

```
expr    → term  (('+' | '-') term)*
term    → factor (('*' | '/' | '%') factor)*
factor  → unary ('^' factor)?     // potência associativa à direita
unary   → ('-' | '+') unary | primary
primary → número | constante | função '(' expr ')' | '(' expr ')'
```

Cada não terminal vira um método privado da classe `Parser` que consome tokens e devolve diretamente o valor numérico — a árvore sintática nunca é materializada, a avaliação acontece durante o parse. Dois pontos de precedência merecem atenção: o menos unário fica *acima* da potência, então `-2^2 = -(2^2) = -4` (como em matemática), enquanto o expoente recursa por `unary`, permitindo `2^-3`; e a potência é associativa à direita (`2^3^2 = 2^9`) porque `power` chama `unary` no expoente em vez de iterar.

O tokenizador é manual (sem regex), em um passe: números aceitam ponto ou vírgula decimal, identificadores agrupam letras, e os símbolos Unicode da UI (`×`, `÷`, `−`, `√`, `π`) são normalizados para seus equivalentes ASCII/nomes (`*`, `/`, `-`, `sqrt`, `pi`) já na tokenização — o parser nunca precisa conhecê-los. Erros são lançados como `CalcError`, uma classe própria que o componente distingue de falhas genéricas para exibir mensagens amigáveis.

## Synth Studio

O Synth Studio é um sintetizador subtrativo polifônico com sequenciador de bateria, construído inteiramente sobre a Web Audio API — sem samples: até os tambores são sintetizados em tempo real. Reúne dois osciladores, envelope ADSR, filtro lowpass com ressonância, delay com realimentação, limitador na saída, teclado de duas oitavas tocável por mouse ou teclado físico, sequenciador de 16 passos e um osciloscópio que desenha a forma de onda da saída.

### Funcionalidades

- Dois osciladores por voz com formas de onda senoide, quadrada, dente de serra e triangular; detune do oscilador 2 em ±100 cents e controle de mistura entre os dois.
- Envelope ADSR completo (ataque, decaimento, sustentação, liberação) aplicado ao ganho de cada voz.
- Filtro lowpass global com corte de 100 Hz a 12 kHz (slider em escala logarítmica) e ressonância (Q) de 0,1 a 20.
- Delay com tempo (até 0,8 s), realimentação (até 85%) e envio ajustáveis; volume master e limitador (`DynamicsCompressor`) para evitar clipping.
- Polifonia de até 16 vozes com roubo de voz (a mais antiga é encerrada com fade rápido quando o limite é atingido).
- Teclado visual de duas oitavas (C4–B5) com glissando: arrastar com o botão pressionado toca as teclas por onde o ponteiro passa.
- Teclado físico mapeado por código de tecla (`e.code`), independente de layout: A W S E D F T G Y H U J K O L P Ç cobrem C4 a E5; com guarda de repetição, liberação de todas as notas ao perder o foco e atalhos ativos somente com o app focado.
- Sequenciador de 16 passos × 4 trilhas — Bumbo, Caixa, Chimbal e Baixo — com BPM de 60 a 180, indicador do passo atual, padrão Demo pronto (four-on-the-floor com baixo sincopado em 124 BPM) e botão Limpar.
- Bateria sintetizada: bumbo por queda exponencial de pitch (150 → 40 Hz em senoide), caixa por ruído com bandpass em 1,8 kHz e chimbal por ruído com highpass em 7,5 kHz (buffer de ruído de 0,5 s gerado uma vez e reutilizado).
- Trilha de baixo dispara a própria voz do sintetizador em C2 (MIDI 36), com gate de 85% da duração do passo.
- Visualizador osciloscópio em canvas, alimentado por um `AnalyserNode` (FFT 2048), com cor de acento do tema, ciente de devicePixelRatio e responsivo via ResizeObserver.
- Ativação do áudio condicionada a gesto do usuário (exigência dos navegadores), com banner de aviso até a primeira interação e mensagem de erro se a Web Audio API não estiver disponível.
- Parâmetros aplicados ao grafo de áudio com `setTargetAtTime` (transições suaves, sem cliques) e liberação completa de recursos no fechamento da janela (`dispose`).

### Atalhos e comandos

| Atalho | Ação |
|---|---|
| `A W S E D F T G Y H U J K O L P Ç` | Toca as notas de C4 a E5 (mapa físico, vale para qualquer layout) |
| `Espaço` | Inicia / para o sequenciador |
| Arrastar no teclado visual | Glissando (toca as teclas sob o ponteiro) |

### Por dentro

O sequenciador usa o padrão de **lookahead scheduling** (popularizado por Chris Wilson em "A Tale of Two Clocks"): um `setInterval` de 25 ms acorda um scheduler que agenda, no relógio de alta precisão do `AudioContext`, todos os eventos que caem dentro da janela dos próximos 120 ms:

```ts
while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
  this.scheduleStep(this.currentStep, this.nextNoteTime)
  this.nextNoteTime += 60 / this.bpm / 4
  this.currentStep = (this.currentStep + 1) % NUM_STEPS
}
```

O timing musical fica imune ao jitter do timer de JavaScript: mesmo que o `setInterval` atrase, os eventos já foram agendados no clock de áudio. A UI é sincronizada de volta com `setTimeout`s calculados a partir de `(time - ctx.currentTime)`, para que o destaque do passo atual acenda no momento em que o som realmente toca — e todos esses timeouts são rastreados em um `Set` para cancelamento limpo no stop.

O grafo de áudio é montado uma única vez: vozes → barramento de vozes → filtro lowpass → master, com um envio paralelo do filtro para o delay (que realimenta a si mesmo) e um barramento separado para a bateria, que não passa pelo filtro nem pelo delay. Cada voz é efêmera — dois `OscillatorNode`, dois ganhos de mix e um ganho de envelope — e se autodestrói no `onended` do oscilador, desconectando todos os nós. Notas do sequenciador recebem `gateDur` e têm o release agendado deterministicamente no futuro, enquanto notas tocadas ao vivo dependem do `noteOff`; nos dois casos o decaimento usa `setTargetAtTime`/`exponentialRampToValueAtTime`, que produzem curvas naturais sem estalos.

## Fluid

Simulação de fluidos em tempo real, executada inteiramente na GPU via WebGL2. O usuário injeta "tinta" colorida arrastando o ponteiro sobre a tela e observa o fluido se misturar, formar redemoinhos e se dissipar segundo a dinâmica de Navier-Stokes. É um playground visual: não há objetivo, apenas interação direta com o solver.

### Funcionalidades

- Injeção de fluido por arrasto do ponteiro (mouse, toque ou caneta, com pointer capture e suporte a múltiplos ponteiros simultâneos).
- Matiz da tinta avança automaticamente: cada novo arrasto desloca o tom em 0,11 no círculo HSV, e o tom continua deslizando gradualmente conforme a distância arrastada.
- Splats automáticos suaves quando o app fica ocioso por mais de 3 segundos (intervalo aleatório de 2,4 s a 4,2 s entre eles).
- Splash inicial de 4 splats ao abrir e botão "Splash" que dispara 5 splats aleatórios coloridos.
- Botão "Reset" que limpa todos os buffers (velocidade, tinta, pressão, divergência e curl).
- Quatro sliders de parâmetros ao vivo: dissipação da tinta (0,9–1), dissipação da velocidade (0,9–1), intensidade da vorticidade (0–50) e raio do splat (0,05–1).
- Contador de FPS no canto superior direito, atualizado a cada 500 ms.
- Dica de uso sobreposta até a primeira interação.
- Pausa automática do loop quando a aba fica oculta (`visibilitychange`).
- Redimensionamento com debounce de 150 ms via `ResizeObserver`; medidas degeneradas (janela minimizada, menos de 40 px) são ignoradas para preservar a cena. DPR limitado a 2.
- Tratamento de erros: detecção de falta de WebGL2/float textures (`FluidUnsupportedError`), perda de contexto WebGL com tela de erro e botão "Tentar novamente" que recria a simulação do zero.

### Atalhos e controles

| Entrada | Ação |
|---|---|
| Arrastar no canvas | Injeta tinta e velocidade no fluido |
| `R` | Limpa a cena (Reset) |
| `S` | Dispara 5 splats aleatórios (Splash) |

### Por dentro

A engine (`simulation.ts`) implementa o método "Stable Fluids" de Jos Stam em GLSL ES 3.00. Velocidade, tinta e pressão vivem em texturas half-float com double buffering (ping-pong FBOs): cada passe lê do buffer `read`, escreve no `write` e troca os dois com um `swap()`. A grade de velocidade roda em resolução baixa (base 160) enquanto a tinta usa resolução maior (base 512), o que mantém o custo do solver baixo sem sacrificar a nitidez visual. Há fallback de formatos de textura (`RG16F → RGBA16F`, `R16F → RG16F → RGBA16F`) validado com `checkFramebufferStatus` antes do uso.

Cada frame executa, nesta ordem: advecção semi-lagrangiana da velocidade, advecção da tinta, vorticity confinement (recupera os pequenos redemoinhos que a advecção dissipa, controlado pelo slider de vorticidade), cálculo da divergência com condições de contorno de não-deslizamento, decaimento da pressão anterior (fator 0,8), 20 iterações de Jacobi para resolver a equação de Poisson da pressão, subtração do gradiente de pressão (projetando o campo de volta para divergência zero) e, por fim, o passe de display, que adiciona um ruído de hash de ±0,5/255 para evitar banding no gradiente.

Dois detalhes tornam a simulação estável em qualquer máquina: o `dt` é limitado a 1/30 s e a dissipação é aplicada como `Math.pow(dissipation, dt * 60)`, ou seja, independente do frame rate. No redimensionamento, o conteúdo dos buffers antigos é copiado para os novos via shader de cópia, então a cena não é perdida ao mudar o tamanho da janela.

## Fractal

Explorador interativo dos conjuntos de Mandelbrot e Julia, renderizados por fragment shader em WebGL. Permite navegar com pan e zoom profundo (até o limite de precisão do float32), ajustar a constante de Julia em tempo real, trocar paletas de cor e capturar a vista atual como PNG.

### Funcionalidades

- Dois modos: Mandelbrot e Julia, cada um com sua câmera inicial própria (a troca de modo reposiciona a vista).
- Pan por arrasto (com pointer capture e cursor `grab`/`grabbing`).
- Zoom ancorado no cursor pela roda do mouse (fator exponencial `exp(deltaY * 0.0012)`) e zoom por duplo clique (fator 0,35).
- Limites de zoom: `span` mínimo de 1e-5 (limite de precisão do float32 no shader, com aviso "limite de precisão" no HUD) e máximo de 16.
- Slider de iterações máximas (100 a 1000, passo 10, padrão 250).
- Três paletas de cores (Cosmos, Fogo, Oceano) com pré-visualização em gradiente CSS na toolbar.
- Modo Julia: sliders para as partes real e imaginária da constante `c` (−1,5 a 1,5) e opção "Seguir mouse", que mapeia a posição do ponteiro no plano complexo diretamente para `c`.
- HUD com centro da vista (notação complexa), fator de zoom (com notação científica acima de 1000×), iterações e a constante `c` no modo Julia.
- Captura: salva o PNG no VFS em `/home/user/imagens` com nome incremental (`fractal-1.png`, `fractal-2.png`, ...) e dispara o download no navegador, com toast de confirmação por 4 segundos.
- Render sob demanda: o quadro só é redesenhado quando câmera ou parâmetros mudam (não há loop contínuo de animação).
- Redimensionamento via `ResizeObserver` com DPR limitado a 2; tela de erro dedicada quando o WebGL não está disponível ou o contexto é perdido.

### Atalhos e controles

| Entrada | Ação |
|---|---|
| Arrastar | Move a vista (pan) |
| Roda do mouse | Zoom ancorado no cursor |
| Duplo clique | Aproxima no ponto clicado |
| `R` | Volta à vista inicial |
| `M` | Alterna Mandelbrot / Julia |
| `1` / `2` / `3` | Paletas Cosmos / Fogo / Oceano |
| `+` / `-` | Zoom no centro |
| Setas | Movem a vista em passos de 8% do span |

### Por dentro

A renderização (`renderer.ts`) usa um único triângulo que cobre a tela inteira (vértices `(-1,-1), (3,-1), (-1,3)`) e um fragment shader que itera `z = z² + c` por pixel. O mesmo shader atende os dois modos: em Mandelbrot, `z` parte de 0 e `c` é o ponto do plano; em Julia, `z` parte do ponto e `c` é o uniform da constante. A coloração usa escape-time suave — `nu = n + 1 − log2(log|z|)` — com bailout alto (raio 256, ou seja, `|z|² > 65536`), o que elimina as bandas discretas e produz um gradiente contínuo. Como o GLSL ES 1.00 exige limite de loop constante, o laço tem teto fixo de 1000 iterações com `break` em `u_maxIter`.

As cores vêm de paletas de cosseno no estilo Iñigo Quilez: `cor(t) = a + b·cos(2π(c·t + d))`, com os quatro coeficientes `vec3` enviados como uniforms. O mesmo polinômio é avaliado em TypeScript (`palettes.ts`) para pré-computar o gradiente CSS exibido nos botões da toolbar — a prévia e o shader compartilham exatamente a mesma definição. O contexto WebGL é criado com `preserveDrawingBuffer: true` para que `toDataURL` funcione na captura; antes de ler o buffer, o componente força um re-render síncrono para garantir o quadro atual.

A câmera é descrita por centro (`cx`, `cy`) e `span` (extensão vertical da vista no plano complexo); a escala passada ao shader é `span / canvas.height`, em unidades do plano por pixel físico. O zoom ancorado converte o cursor para coordenadas do plano e reposiciona o centro de modo que o ponto sob o cursor permaneça fixo durante a aproximação.

## Tetris

Implementação completa de Tetris com as mecânicas modernas do guideline: randomizador 7-bag, sistema de rotação SRS com wall kicks, lock delay com limite de resets, ghost piece, hold, DAS/ARR no teclado e recorde persistente.

### Funcionalidades

- Tabuleiro de 10×20 colunas visíveis mais 2 linhas ocultas no topo para o spawn.
- Sete peças (I, O, T, S, Z, J, L) sorteadas por 7-bag: um saco com as sete peças é embaralhado (Fisher-Yates) e consumido por inteiro antes do próximo, garantindo distribuição uniforme.
- Rotação SRS com tabelas de wall kick separadas para a peça I e para J/L/S/T/Z; a peça O não rotaciona.
- Ghost piece translúcida mostrando onde a peça vai pousar.
- Hold (reserva) com trava de uso único por peça, indicada visualmente no painel.
- Fila de "Próximas" com prévia das 3 peças seguintes.
- Gravidade por nível: `1000 ms × 0,85^(nível−1)`, com piso de 80 ms; o nível sobe a cada 10 linhas.
- Descida suave (soft drop) a 45 ms por célula com +1 ponto por célula; queda instantânea (hard drop) com +2 pontos por célula.
- Pontuação por linhas: 100/300/500/800 × nível para 1/2/3/4 linhas.
- Lock delay de 500 ms com no máximo 15 resets por movimento/rotação; o contador de resets zera quando a peça desce para uma altura inédita.
- Animação de flash branco de 150 ms nas linhas completas antes de removê-las.
- DAS de 170 ms e ARR de 50 ms para repetição horizontal no teclado.
- Recorde salvo em `localStorage` (`fableos-tetris-highscore`), com selo "Novo recorde!" na tela de fim de jogo.
- Pausa automática ao perder o foco da janela ou quando a aba fica oculta; aviso "Clique para jogar" quando o app está sem foco.
- Overlays de estado: tela inicial com logotipo colorido, pausa e fim de jogo.
- Painéis laterais: Reserva, Próximas, Placar (pontos, recorde, nível, linhas e barra de progresso até o próximo nível) e tabela de Controles.
- Canvas responsivo: o tamanho da célula é recalculado conforme a área disponível, com suporte a DPR.

### Atalhos e controles

| Tecla | Ação |
|---|---|
| `←` `→` | Mover (com auto-repetição DAS/ARR) |
| `↓` | Descida suave |
| `Espaço` | Queda instantânea |
| `↑` / `X` | Girar no sentido horário |
| `Z` | Girar no sentido anti-horário |
| `C` | Reservar peça (hold) |
| `P` / `Esc` | Pausar / retomar |
| `R` | Reiniciar a partida |
| `Enter` | Começar (na tela inicial ou após fim de jogo) |

### Por dentro

A lógica do jogo (`game.ts`) é totalmente pura — sem DOM, sem timers próprios. A classe `TetrisGame` expõe `update(dt)` e métodos de comando (`moveLeft`, `rotate`, `hardDrop`, ...), e mantém uma máquina de estados com as fases `idle`, `playing`, `paused`, `clearing` e `gameover`. As formas das peças são tabelas estáticas com os quatro estados de rotação SRS, e os wall kicks são as tabelas oficiais já convertidas para coordenadas de tela (eixo y para baixo). A rotação testa os cinco offsets de kick em ordem e aceita o primeiro sem colisão:

```ts
const kicks = table[`${from}>${to}`] ?? [[0, 0]]
for (const [dx, dy] of kicks) {
  const candidate = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy }
  if (!this.collides(candidate)) { this.piece = candidate; return true }
}
```

O componente (`index.tsx`) roda um loop `requestAnimationFrame` com passo fixo de 1000/120 ms e acumulador: a entrada (DAS/ARR) e o `game.update` avançam sempre em incrementos determinísticos, independentemente do frame rate, com teto de 250 ms por quadro para evitar a espiral da morte após uma pausa longa. Para não re-renderizar o React a cada frame, o estado da UI só é atualizado quando uma chave-resumo (fase, pontos, linhas, hold, próximas, recorde) muda — o tabuleiro em si é desenhado direto no canvas, fora do ciclo do React.

A renderização (`render.ts`) é feita com primitivas pequenas: cada célula recebe um gradiente vertical (clareado no topo, escurecido na base), uma faixa de brilho e borda escura; a ghost piece é uma silhueta com 14% de opacidade e contorno; e as miniaturas dos painéis laterais calculam o bounding box da peça para centralizá-la no canvas pequeno.

## Monitor

Dashboard de desempenho em tempo real do FableOS. Mede o FPS real do navegador, exibe uso de memória (heap JavaScript real quando disponível), apresenta uma carga de CPU simulada correlacionada ao desempenho medido e agrega informações de sessão, janelas abertas e armazenamento.

### Funcionalidades

- Cartão de FPS com valor atual, mínimo e máximo dos últimos 30 segundos e gráfico de tendência.
- Cartão de CPU com gauge da média e barras por núcleo (quantidade vinda de `navigator.hardwareConcurrency`, limitada a 1–16); a carga é simulada, inversamente correlacionada ao FPS real, e o cartão deixa isso explícito.
- Cartão de memória: usa `performance.memory` (heap JS real, apenas Chromium) com valores em bytes; quando indisponível, cai para um passeio aleatório estimado e exibe o selo "estimado".
- Cartão de sistema: tempo de sessão, navegador e versão (parse do user agent), resolução de tela com DPR, plataforma (via `userAgentData` com fallback para `navigator.platform`) e idioma.
- Cartão de janelas: lista todas as janelas abertas ordenadas por z-index, marca as minimizadas e a própria janela do Monitor, e oferece botão "Focar" para trazer qualquer outra ao primeiro plano.
- Cartão de armazenamento: número de arquivos, pastas e bytes do VFS, mais o uso do `localStorage` restrito às chaves `fableos-*` contra a cota típica de 5 MB, com barra de progresso; reage automaticamente a mudanças no VFS feitas por outros apps.
- Botão Pausar/Retomar que congela toda a coleta.
- Coleta interrompida automaticamente quando a aba fica oculta (`visibilitychange`) e retomada ao voltar.
- Grade responsiva de cartões (`auto-fit, minmax(270px, 1fr)`).

### Atalhos e controles

| Tecla | Ação |
|---|---|
| `P` ou `Espaço` | Pausar / retomar a coleta |

### Por dentro

A medição de FPS é real, não estimada: um callback `requestAnimationFrame` mede o intervalo entre quadros consecutivos e alimenta uma média móvel exponencial (`ema += (instant − ema) × 0.08`). Deltas anômalos (acima de 500 ms, típicos de aba em segundo plano) são descartados e o valor instantâneo é limitado a 240 fps. Sobre esse sinal rodam dois relógios independentes: um tick de 250 ms abastece os históricos dos gráficos (capacidade de 120 amostras, ou seja, 30 segundos) e um tick de 1 s atualiza os textos — assim os números não "tremem" a cada frame, mas as curvas continuam fluidas.

A CPU de um navegador não é mensurável diretamente, então o Monitor a deriva do FPS: a pressão é `clamp(1 − fps/72, 0.04, 0.97)`, cada núcleo recebe um viés aleatório fixo (0,5–1,15) definido na montagem, e os valores convergem para o alvo com suavização de 0,22 por tick. O resultado se comporta como uma carga plausível que de fato sobe quando o sistema engasga. A memória segue a mesma filosofia de "real primeiro": `readRealMemory()` lê `performance.memory` com verificação defensiva de tipos e, só na ausência da API, ativa o passeio aleatório (26–82%, com atração para 52%).

Os gráficos (`charts.tsx`) são desenhados à mão em canvas 2D: linha com `lineJoin: 'round'`, preenchimento em gradiente translúcido abaixo da curva, linhas-guia em 25/50/75% e ponto no valor mais recente. O traçado é ancorado à direita — com menos amostras que a capacidade, a curva "nasce" da borda direita e cresce para a esquerda. O gauge circular é SVG puro, animado via `stroke-dasharray` com transição de 0,6 s, e acessível (`role="img"` com `aria-label` contendo o percentual).

## Settings

Painel de configurações do FableOS (título de janela "Ajustes"), dividido em três seções: Aparência, Wallpaper e Sistema. Todas as mudanças são aplicadas imediatamente, sem botão de salvar, e persistem via stores do sistema.

### Funcionalidades

- Navegação lateral com três seções, ícones SVG próprios e indicador de seção ativa; o título da janela é atualizado dinamicamente ("Ajustes — Aparência" etc.).
- **Aparência**: paleta de cores de destaque predefinidas (`ACCENT_PRESETS` do themeStore), seletor de cor totalmente personalizada via `<input type="color">` e pré-visualização ao vivo — uma janela em miniatura mostrando como a cor afeta barra de título, barra de progresso, botões e toggle.
- **Wallpaper**: grade de wallpapers disponíveis (`WALLPAPERS` do themeStore) com prévia em gradiente CSS, marcação do ativo e troca imediata; nota informando que os wallpapers reais são renderizados ao vivo em WebGL.
- **Sistema**: cartão "Sobre o sistema" (versão FableOS 1.0, modelo Claude Fable 5, navegador e versão, resolução de tela, tamanho da janela do navegador atualizado em tempo real via listener de `resize`, núcleos lógicos e idioma) e cartão do VFS (arquivos, pastas e espaço usado, reativo à versão do VFS).
- **Zona de perigo**: restauração de fábrica com modal de confirmação; a ação apaga todas as chaves `fableos-*` do `localStorage` (arquivos do VFS, tema, wallpaper e dados de apps) e recarrega a página.
- Modal de confirmação acessível: `role="dialog"`, `aria-modal`, foco inicial no botão Cancelar, fechamento por Esc ou clique no backdrop.
- Acessibilidade nos controles: `aria-pressed` nos swatches e wallpapers, `aria-current` na navegação, `aria-label` descritivos.

### Atalhos e controles

| Tecla | Ação |
|---|---|
| `1` / `2` / `3` | Alterna entre Aparência, Wallpaper e Sistema |
| `Esc` | Fecha o modal de restauração de fábrica |

Os atalhos numéricos são ignorados quando o foco está em um campo de entrada ou enquanto o modal está aberto.

### Por dentro

O app é um orquestrador fino: cada seção é um componente isolado (`AppearanceSection`, `WallpaperSection`, `SystemSection`) que conversa diretamente com os stores Zustand do sistema (`themeStore`, `vfs`, `windowStore`). Como a cor de destaque é propagada pelo sistema como a custom property CSS `--accent`, a pré-visualização da seção Aparência reflete a mudança no mesmo frame em que o swatch é clicado — não há estado intermediário nem etapa de confirmação.

A restauração de fábrica (`helpers.ts`) é deliberadamente simples e segura: coleta primeiro todas as chaves com prefixo `fableos-` (evitando mutar o `localStorage` durante a iteração por índice), remove uma a uma e chama `location.reload()`. Se o `localStorage` estiver inacessível, a função apenas reinicia. O parse de navegador testa os user agents na ordem correta (Edge e Opera antes de Chrome, Chrome antes de Safari), já que os UAs derivados de Chromium contêm o token `Chrome/`.

## About

Tela "Sobre" do FableOS: apresenta o sistema, lista todos os aplicativos instalados (com abertura em um clique), destaca os pontos técnicos do projeto e resume os atalhos e gestos globais do desktop. É a porta de entrada para quem abre o sistema pela primeira vez.

### Funcionalidades

- Hero com o logotipo "F" em gradiente, título com gradient text, selo "versão 1.0", descrição do projeto e badges de stack (React 19, TypeScript, WebGL + Web Audio).
- Grade de aplicativos gerada dinamicamente a partir do registro do sistema (`APP_META`), excluindo o próprio About; cada cartão mostra ícone com tonalidade própria do app (via `color-mix` com o `tint` do registro), nome e descrição, e abre o aplicativo ao ser clicado (`useWindows.getState().openApp`).
- Seção "Por dentro do sistema" com seis cartões técnicos: window manager próprio, VFS persistente, fluidos Navier-Stokes em GPU, síntese de áudio com Web Audio API, fractais em shader e zero dependências de UI.
- Tabela "Atalhos e gestos" com as sete interações globais do desktop (maximizar por duplo clique na barra de título, mover, redimensionar em 8 direções, menu de contexto, abrir app, minimizar/restaurar pela barra de tarefas, navegação por Tab/Enter na própria grade).
- Entrada animada em cascata: cada seção sobe com `slide-up` e atrasos escalonados (0, 120, 220 e 320 ms), com divisores em fade-in.
- Layout responsivo por container queries (`@container`): a grade de apps e os cartões técnicos vão de 1 a 3 colunas conforme a largura da janela, não da tela.
- Tratamento defensivo: estado vazio quando não há apps registrados e falha silenciosa se um app não puder ser aberto.

### Atalhos e controles

O About não define atalhos próprios — os cartões de aplicativo são botões nativos, navegáveis por `Tab` e acionáveis por `Enter`. A tabela de atalhos exibida pelo app documenta os gestos globais do FableOS, não comandos locais.

### Por dentro

O componente é quase todo conteúdo estático declarado como dados (`TECH_CARDS`, `SHORTCUTS`, `HERO_BADGES`) e renderizado por blocos pequenos e reutilizáveis (`Section`, `SectionTitle`, `InfoCard`-like `AppCard`). A decisão de engenharia mais relevante é que a lista de aplicativos não é duplicada: ela vem do mesmo registro `APP_META` que alimenta o desktop e a barra de tarefas, então qualquer app novo registrado no sistema aparece automaticamente no About, com ícone, descrição e cor de identidade corretos.

A responsividade usa container queries do Tailwind (`@md:grid-cols-2 @3xl:grid-cols-3`), o que faz o layout responder ao tamanho da janela do FableOS em que o app está rodando — comportamento essencial em um ambiente de janelas livres, onde a viewport do navegador não diz nada sobre o espaço real disponível. As animações de entrada são CSS puro com `animation-delay` por seção e `animationFillMode: 'backwards'`, evitando o flash do conteúdo antes do início da animação.
