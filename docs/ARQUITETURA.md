# Arquitetura do FableOS

Documentação do núcleo do FableOS: um sistema operacional de navegador construído com React 19, TypeScript, Tailwind CSS v4 e zustand. Este documento cobre o window manager, o sistema de arquivos virtual, os temas, o wallpaper em WebGL, o registry de aplicativos e o fluxo de boot. Os aplicativos em si (`src/apps/*`) não são o foco aqui — apenas o contrato que os liga ao núcleo.

**Dependências de runtime:** `react`, `react-dom` e `zustand`. Nada além disso. Build via Vite 6 com `@tailwindcss/vite`.

---

## 1. Visão geral

O núcleo vive em dois diretórios:

| Diretório | Responsabilidade |
|---|---|
| `src/system/` | Estado global (stores zustand), metadados de apps, registry lazy, tipos compartilhados |
| `src/components/` | Shell visual: boot, desktop, janelas, taskbar, menu iniciar, wallpaper |

### Árvore de componentes

```
main.tsx
└── App ─────────────── booted? ── não ──► BootScreen
    └── Desktop (após boot)
        ├── Wallpaper        (canvas WebGL em tela cheia, atrás de tudo)
        ├── DesktopIcons     (grade de ícones, duplo clique abre app)
        ├── Window × N       (uma por entrada em useWindows.windows)
        │   └── <Suspense> ── APP_COMPONENTS[appId]  (chunk lazy)
        ├── ContextMenu      (clique direito no desktop, condicional)
        ├── StartMenu        (condicional, estado local do Desktop)
        └── Taskbar          (botão iniciar, lista de janelas, relógio)
```

### Fluxo de estado

```
                 ┌─────────────────────────────────────────────┐
                 │              src/system/                    │
                 │                                             │
  Taskbar ──────►│  windowStore (useWindows)                   │◄────── Window
  StartMenu ────►│    windows[], focusedId, openApp/close/...  │◄────── apps (setTitle)
  DesktopIcons ─►│                                             │
                 │  themeStore (useTheme)                      │◄────── Settings (app)
  Desktop ◄──────│    accent, wallpaper      → localStorage    │
  Wallpaper ◄────│                                             │
                 │  vfs (useVfs + funções puras)               │◄────── Terminal, Files,
  apps ◄─────────│    root, version          → localStorage    │        Editor, Paint...
                 │                                             │
                 │  apps.ts (APP_META)   registry.tsx (lazy)   │
                 └─────────────────────────────────────────────┘
```

Três stores zustand independentes, sem middleware:

| Store | Arquivo | Estado | Persistência |
|---|---|---|---|
| `useWindows` | `windowStore.ts` | janelas abertas e foco | nenhuma (sessão) |
| `useTheme` | `themeStore.ts` | accent e wallpaper | `localStorage` (`fableos-theme-v1`) |
| `useVfs` | `vfs.ts` | árvore de arquivos e `version` | `localStorage` (`fableos-vfs-v1`) |

Componentes que precisam reagir assinam via hook (`useWindows(s => ...)`); handlers imperativos usam `useWindows.getState()` diretamente, evitando re-renderizações desnecessárias e closures obsoletas.

---

## 2. Window manager

Implementado em dois arquivos: `src/system/windowStore.ts` (estado e operações) e `src/components/Window.tsx` (chrome da janela, drag e resize).

### 2.1 Modelo de dados

```ts
// src/system/types.ts
export interface WindowState extends Bounds {  // Bounds = { x, y, width, height }
  id: string          // "win-1", "win-2", ...
  appId: string
  title: string
  zIndex: number
  minimized: boolean
  maximized: boolean
  payload?: unknown   // dado opaco entregue ao app
  prevBounds?: Bounds // geometria antes de maximizar
}
```

### 2.2 Ciclo de vida

| Operação | Comportamento |
|---|---|
| `openApp(appId, options?)` | Valida o app em `APP_META` (lança `App desconhecido: <id>` se não existir), gera id sequencial, calcula posição/tamanho iniciais, adiciona ao array e foca. Retorna o id da janela. |
| `focus(id)` | Atribui `zIndex = ++zCounter`, força `minimized: false` (focar restaura) e define `focusedId`. |
| `minimize(id)` | `minimized: true`; a janela continua montada (classe `hidden` no DOM), preservando todo o estado do app. Se era a focada, `focusedId` vira `null`. |
| `toggleMaximize(id)` | Ver §2.5. |
| `setBounds(id, bounds)` | Merge parcial de `Bounds`; usado por drag e resize. |
| `setTitle(id, title)` | Permite ao app renomear sua própria janela. |
| `close(id)` | Remove do array — o React desmonta o componente e o estado do app é perdido. |

### 2.3 Z-order com contador monotônico

Não há reordenação de array. Dois contadores em escopo de módulo:

```ts
let zCounter = 10   // z-index, incrementado a cada foco/abertura/maximização
let idCounter = 0   // ids de janela
```

Toda operação que traz uma janela para frente faz `zIndex: ++zCounter`. O array `windows` mantém a ordem de abertura (estável para a Taskbar); a sobreposição visual é resolvida exclusivamente pelo CSS `z-index`. Camadas do shell ficam acima de qualquer janela: taskbar em `z-[9000]`, menu de contexto em `z-[9400]`, menu iniciar em `z-[9500]`.

### 2.4 Posicionamento em cascata

`openApp` desloca cada nova janela 28 px para baixo e para a direita, reiniciando o ciclo a cada 7 janelas, e nunca deixa a janela nascer fora da área útil (viewport menos os 48 px da taskbar, `TASKBAR_HEIGHT`):

```ts
const offset = (get().windows.length % 7) * 28
const x = Math.max(8, Math.min(90 + offset, vw - width - 8))
const y = Math.max(8, Math.min(48 + offset, vh - height - 8))
```

O tamanho inicial é `defaultSize` do app, limitado ao viewport com folga de 24 px.

### 2.5 Maximizar / restaurar com `prevBounds`

Ao maximizar, a geometria atual é salva em `prevBounds`; ao restaurar, ela é reaplicada (com fallback `{ x: 90, y: 48, width: 800, height: 500 }` se ausente). Ambas as transições incrementam o z-counter. A janela maximizada não usa `prevBounds` para renderizar — `Window.tsx` aplica estilo absoluto:

```ts
{ left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR_HEIGHT}px)` }
```

Duplo clique na barra de título também alterna maximização.

### 2.6 Drag por pointer events

O drag não usa bibliotecas nem HTML drag-and-drop. No `pointerdown` da barra de título (apenas botão esquerdo, ignorado se maximizada), os listeners `pointermove`/`pointerup` são registrados em `window` — assim o arraste continua mesmo que o cursor saia da janela. A posição é calculada por delta sobre a origem capturada no início, com clamp que garante que ao menos 120 px da janela permaneçam visíveis na horizontal e que a barra de título nunca saia da tela:

```ts
x: Math.min(Math.max(nx, -win.width + 120), window.innerWidth - 120),
y: Math.min(Math.max(ny, 0), window.innerHeight - TASKBAR_HEIGHT - 36),
```

Os botões da barra de título fazem `stopPropagation` no `pointerdown` para não iniciarem drag. Qualquer `pointerdown` na janela chama `focus(id)`.

### 2.7 Resize em 8 direções

Oito handles invisíveis posicionados nas bordas e cantos (`n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`), cada um com o cursor CSS correspondente (`cursor-n-resize` etc.). São renderizados somente quando a janela não está maximizada. A lógica compõe as direções:

- `e`/`s`: apenas crescem `width`/`height` a partir do delta;
- `w`/`n`: recalculam a dimensão e deslocam `x`/`y` para manter a borda oposta fixa (`b.x = orig.x + (orig.width - w2)`), com `y` limitado a `>= 0`.

O mínimo vem de `minSize` do `AppMeta` (fallback `320 × 240`). Cantos combinam dois eixos porque a checagem é `dir.includes('e')` etc.

### 2.8 Conteúdo da janela

O corpo renderiza o componente lazy do app dentro de `<Suspense>` com um spinner como fallback (ver §6), passando o contrato `AppProps`:

```tsx
<Suspense fallback={<Spinner />}>
  {Comp ? <Comp windowId={win.id} payload={win.payload} /> : <Spinner />}
</Suspense>
```

---

## 3. Sistema de arquivos virtual (`src/system/vfs.ts`)

VFS em memória, em árvore, persistido em `localStorage` como JSON único sob a chave `fableos-vfs-v1`.

### 3.1 Modelo de dados

```ts
export interface VfsFile { type: 'file'; content: string; mtime: number }
export interface VfsDir  { type: 'dir';  children: Record<string, VfsNode>; mtime: number }
export type VfsNode = VfsFile | VfsDir
```

Arquivos são sempre texto (`string`). Diretórios mapeiam nome → nó. `mtime` é registrado na criação do nó.

### 3.2 Normalização de paths

Paths são sempre absolutos após normalização. `normalizePath` divide por `/`, descarta segmentos vazios e `.`, resolve `..` com pop (sem nunca subir acima da raiz) e remonta com `/` inicial:

```ts
normalizePath('/home/user/../user/./docs//x') // → '/home/user/docs/x'
```

Helpers derivados: `joinPath(base, rel)` (relativo resolve contra a base; absoluto ignora a base), `parentPath(path)` e `baseName(path)`.

### 3.3 API

Funções puras exportadas do módulo (não métodos do store). Erros são `Error` lançados com mensagens em português.

| Função | Assinatura | Comportamento / erros |
|---|---|---|
| `normalizePath` | `(path: string) => string` | Normaliza para path absoluto canônico. Nunca lança. |
| `joinPath` | `(base: string, rel: string) => string` | Resolve `rel` contra `base`; `rel` absoluto prevalece. |
| `parentPath` | `(path: string) => string` | Diretório pai; pai de `/` é `/`. |
| `baseName` | `(path: string) => string` | Último segmento; `/` retorna `/`. |
| `getNode` | `(path: string) => VfsNode \| null` | Caminha a árvore; `null` se não existir ou se um segmento intermediário for arquivo. |
| `exists` | `(path: string) => boolean` | `getNode(path) !== null`. |
| `isDir` | `(path: string) => boolean` | Verdadeiro apenas para diretórios existentes. |
| `list` | `(path: string) => VfsEntry[]` | Entradas ordenadas: diretórios antes de arquivos, depois `localeCompare` pt-BR. Lança `Não é um diretório` se o path não for um diretório existente. |
| `readFile` | `(path: string) => string` | Lança `Arquivo não encontrado` ou `É um diretório`. |
| `mkdir` | `(path: string) => void` | Semântica `mkdir -p`: cria todos os intermediários. Lança `Já existe um arquivo em: <seg>` se um segmento colidir com arquivo. |
| `writeFile` | `(path: string, content: string) => void` | Cria ou sobrescreve; cria diretórios pais automaticamente. Lança `Caminho inválido` para `/` e `É um diretório` se o destino for diretório. |
| `remove` | `(path: string) => void` | Remove arquivo ou diretório (recursivo por consequência). Lança `Não é possível remover a raiz` e `Não encontrado`. |
| `rename` | `(from: string, to: string) => void` | Move/renomeia qualquer nó; cria pais do destino. No-op se `from === to`. Lança em: raiz como origem/destino, mover diretório para dentro de si mesmo, origem inexistente, destino já existente. |
| `stats` | `() => VfsStats` | Percorre a árvore inteira; retorna `{ files, dirs, bytes }` (bytes = soma de `content.length`). |
| `resetVfs` | `() => void` | Restaura o seed, incrementa `version` e remove a chave do `localStorage`. |

### 3.4 Persistência e seed

Na carga do módulo, `loadRoot()` tenta `JSON.parse` do `localStorage`; se ausente, corrompido ou com formato inválido (`type !== 'dir'`), cai no `seedRoot()`. O seed cria:

```
/home/user/
├── documentos/   bem-vindo.txt, sobre.md
├── imagens/      (vazio)
├── musicas/      (vazio)
└── projetos/     hello.js, notas.md
```

Toda mutação termina em `commit()`, que serializa a árvore inteira de volta ao `localStorage`. Estouro de quota é silenciosamente ignorado — o sistema continua funcionando só em memória.

### 3.5 Reatividade via `version`

As funções de mutação alteram a árvore **in place** (mutação direta de `children`); `commit()` então publica no store uma nova referência rasa da raiz e incrementa um contador:

```ts
useVfs.setState(s => ({ root: { ...root }, version: s.version + 1 }))
```

Componentes não assinam a árvore — assinam o contador e releem o que precisam com as funções puras:

```ts
const version = useVfs(s => s.version)  // re-renderiza a cada mutação
const entries = list(currentPath)        // leitura imperativa, sempre fresca
```

Esse desenho troca granularidade por simplicidade: qualquer mutação re-renderiza todos os assinantes, o que é barato na escala do FableOS e elimina toda a complexidade de invalidação por subárvore.

---

## 4. Temas (`src/system/themeStore.ts`)

Store mínimo com dois campos: `accent` (cor hex) e `wallpaper` (id de shader). Defaults: `#7c6cff` e `aurora`.

- **Accent via CSS variable.** O `Desktop` aplica a cor no root do documento a cada mudança:

  ```ts
  document.documentElement.style.setProperty('--accent', accent)
  ```

  Todo o shell consome `var(--accent)` em classes Tailwind arbitrárias (`bg-[var(--accent)]`, `border-t-[var(--accent)]`...), além do `::selection` em `index.css` (que também define o fallback `--accent: #7c6cff` em `:root`). O wallpaper WebGL recebe a mesma cor como uniform (§5). Há 8 presets em `ACCENT_PRESETS`.

- **Wallpapers.** `WALLPAPERS` define 4 entradas (`aurora`, `nebula`, `gridwave`, `dusk`), cada uma com `name` e um `preview` em CSS gradient usado pelas miniaturas do app Ajustes — o render real é o shader.

- **Persistência.** Cada setter grava o objeto `{ accent, wallpaper }` inteiro em `localStorage` (`fableos-theme-v1`). A leitura inicial é feita uma única vez na carga do módulo, com try/catch para estado corrompido e defaults como fallback.

---

## 5. Wallpaper WebGL (`src/components/Wallpaper.tsx`)

Um único `<canvas>` absoluto cobrindo o desktop, com WebGL 1 (`antialias: false, depth: false`).

### 5.1 Pipeline

- **Fullscreen triangle.** Em vez de um quad de dois triângulos, um único triângulo superdimensionado cobre a tela — `(-1,-1), (3,-1), (-1,3)` — desenhado com `drawArrays(TRIANGLES, 0, 3)`. O vertex shader apenas repassa `a_pos`; todo o trabalho é do fragment shader.
- **Uniforms por frame:** `u_res` (resolução), `u_time` (segundos desde a montagem), `u_mode` (int do wallpaper ativo) e `u_accent` (accent convertido de hex para `vec3` por `hexToRgb`).
- **Troca de wallpaper/accent sem recriar contexto.** Os valores chegam ao loop de render via `useRef` (`modeRef`, `accentRef`), atualizados por efeitos separados. O efeito que cria o contexto GL roda uma única vez (`[]`); trocar o tema só muda o valor dos uniforms no frame seguinte. Os 4 modos vivem no mesmo fragment shader, selecionados por `if/else` sobre `u_mode`.
- **Resolução.** O canvas segue `clientWidth/Height × devicePixelRatio`, com DPR limitado a 1,5 para conter custo de fill-rate; a checagem de resize é feita a cada frame.
- **Pós-processamento comum:** vinheta radial `col *= 1.0 - dot(d, d) * 0.5` aplicada a todos os modos.

### 5.2 Técnicas de shader

Três blocos compartilhados pelos quatro modos:

- `hash(vec2)` — pseudo-aleatório clássico `fract(sin(dot(p, ...)) * 43758.54...)`; também gera os campos de estrelas (uma célula de grade acende se `hash > 0.9965`, com cintilação senoidal por célula).
- `noise(vec2)` — value noise: hash nos 4 cantos da célula, interpolação bilinear com suavização cúbica `u = f*f*(3-2f)`.
- `fbm(vec2)` — fractal Brownian motion com 5 oitavas, lacunaridade 2,03 e ganho 0,5.

### 5.3 Os quatro modos

| Modo | `u_mode` | Construção |
|---|---|---|
| `aurora` | 0 | Céu em gradiente vertical + estrelas; duas bandas de aurora cuja altura é uma onda senoidal perturbada por fbm, recortadas com `smoothstep` sobre a distância vertical; cor mescla verde com o accent modulada por uma segunda fbm de textura. |
| `nebula` | 1 | Domain warping: `q = (fbm(p+t), fbm(p+offset))` alimenta `f = fbm(p + 2.2q)`; paleta roxa misturada com o accent, realces `pow(f, 3.0)` e campo de estrelas mais denso. |
| `gridwave` | 2 | Cena synthwave dividida no horizonte (y = 0,42). Abaixo: chão em perspectiva fake (`z = 0.16/py`), linhas do grid com `pow(abs(sin(...)), 24.0)` rolando com o tempo, coloridas pelo accent. Acima: sol com listras horizontais (`sin(uv.y * 140)`), gradiente de céu, glow e estrelas. |
| `dusk` | 3 | Gradiente vertical de três paradas (laranja → rosa/accent → azul-escuro), três blobs de luz com queda exponencial `exp(-d * 9.0)` orbitando lentamente, e grain de filme `(noise(uv*320) - 0.5) * 0.025`. |

### 5.4 Pausa e fallback

- **`visibilitychange`:** com a aba oculta, o `requestAnimationFrame` é cancelado e o loop para (`running = false`); ao voltar, retoma. Zero GPU em background.
- **Fallback:** se a obtenção do contexto, a compilação de qualquer shader ou o link do programa falharem, o componente seta `failed` e renderiza um `<div>` com CSS gradient estático no lugar do canvas.
- **Cleanup:** ao desmontar, cancela o rAF, remove o listener e libera o contexto via extensão `WEBGL_lose_context`.

---

## 6. Registry e code-splitting (`src/system/registry.tsx`)

Os metadados dos apps (`apps.ts`) são separados do código dos apps (`registry.tsx`) de propósito: o shell (taskbar, menu iniciar, ícones) precisa de nome, ícone e tamanhos sem carregar uma linha de código de app.

```ts
export const APP_COMPONENTS: Record<string, LazyApp> = {
  terminal: lazy(() => import('../apps/terminal')),
  files:    lazy(() => import('../apps/files')),
  // ... 12 apps no total
}
```

Cada `import()` dinâmico vira um chunk separado no build do Vite. O download só acontece na primeira abertura do app; aberturas seguintes reutilizam o módulo. O `<Suspense>` fica **dentro de cada `Window`** (não global), então o chrome da janela — título, botões, bordas — aparece imediatamente com um spinner no corpo, e o carregamento de um app nunca bloqueia outro.

`AppMeta` (em `apps.ts`) descreve cada app: `id`, `name`, `description`, `icon` (emoji), `tint`, `defaultSize`, `minSize` e `desktop` (se aparece como ícone no desktop). `getAppMeta(id)` é a busca usada pelo store e pelo shell.

---

## 7. Boot e primeira execução

`main.tsx` é mínimo: `createRoot(...).render(<App />)`, sem `StrictMode`.

`App.tsx` controla duas coisas:

1. **Boot.** Enquanto `booted === false`, renderiza `BootScreen` — logo, gradiente e barra de progresso animada só com CSS (`@keyframes boot-fill`, 2 s, com paradas irregulares para parecer carga real). Aos 2100 ms inicia o fade-out (transição de opacidade de 500 ms) e aos 2500 ms chama `onDone`, que troca para o `Desktop`. Os timers são limpos no cleanup do efeito.

2. **Primeira execução.** Após o boot, um efeito verifica a flag `fableos-welcomed` no `localStorage`. Se ausente, grava `'1'` e abre o app `about` como boas-vindas. Um `useRef` (`welcomed`) impede execução dupla do efeito na mesma sessão; a flag persistida impede a reabertura em visitas futuras. (O app Ajustes pode limpar o estado do sistema, e o reset do VFS está disponível via `resetVfs`.)

---

## 8. Decisões de design

- **Zero backend.** Todo o estado vive no navegador: VFS e tema em `localStorage`, janelas em memória. Não há rede, autenticação nem build server-side. Consequência direta: o "disco" é limitado pela quota do `localStorage`, e os erros de quota são absorvidos silenciosamente (o sistema degrada para memória).

- **Zero bibliotecas de UI.** Sem component library, sem ícones de terceiros (SVGs inline e emojis), sem biblioteca de drag/resize (pointer events crus), sem motor de animação (CSS `@keyframes` em `index.css`: `win-open`, `fade-in`, `slide-up`). As únicas dependências de runtime são React, ReactDOM e zustand.

- **Isolamento por app.** Cada app é um diretório autocontido em `src/apps/<id>/` com `index.tsx` como entry do chunk. Apps não importam uns aos outros; comunicam-se apenas através dos módulos de `src/system/` (abrir outro app com payload via `openApp`, ler/escrever no VFS, mudar o tema). O núcleo, por sua vez, não conhece nenhum app além dos metadados declarados em `APP_META`.

- **Contrato `AppProps`.** A interface entre window manager e app é mínima e unidirecional:

  ```ts
  export interface AppProps {
    windowId: string   // identidade da janela que hospeda o app
    payload?: unknown  // dado opaco de quem abriu (ex.: { path } para o editor)
  }
  ```

  O `payload` é `unknown` de propósito — o núcleo o transporta sem interpretar; quem valida é o app de destino (o app Arquivos, por exemplo, abre o Editor com `openApp('editor', { payload: { path } })`). No sentido inverso, o app usa o `windowId` para operar sobre a própria janela via store — na prática, `setTitle` (Terminal mostra o cwd, Editor marca arquivo sujo com `•`, etc.).

- **Stores planos, mutações imperativas.** As stores zustand não usam middleware nem immer. O VFS aceita mutação in place com publicação explícita (`commit`) e reatividade por contador (`version`); o window store usa contadores de módulo para id e z-index. São escolhas deliberadas de simplicidade: menos abstração, comportamento fácil de auditar, e desempenho suficiente para a escala do sistema.

- **Shell por camadas de z-index fixas.** Janelas disputam `z-index` dinâmico (a partir de 10); o shell ocupa faixas reservadas altas (9000+), garantindo que taskbar e menus nunca fiquem atrás de uma janela sem precisar de lógica adicional.
