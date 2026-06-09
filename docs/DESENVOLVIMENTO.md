# FableOS — Guia do desenvolvedor

O FableOS é um sistema operacional que roda inteiramente no navegador: window manager próprio, sistema de arquivos virtual persistente, temas dinâmicos e 12 aplicativos. Stack: **React 19 + TypeScript (strict) + Tailwind CSS v4 + Zustand 5**, empacotado com Vite. Não há backend — todo o estado vive no navegador.

Regra de ouro do projeto: **nenhuma dependência além de `react`, `react-dom` e `zustand`**. Toda a UI é React + Tailwind; gráficos, áudio e jogos usam apenas APIs nativas (Canvas, WebGL, Web Audio, localStorage).

---

## 1. Pré-requisitos e execução

- Node.js 18+ (recomendado 20+) e npm.
- Navegador moderno (Chrome, Edge, Firefox ou Safari recentes).

```bash
npm install        # instala as dependências
npm run dev        # servidor de desenvolvimento em http://localhost:5180
npm run build      # typecheck (tsc --noEmit) + build de produção em dist/
npm run preview    # serve o build de produção localmente
npm run typecheck  # apenas verificação de tipos (tsc --noEmit)
```

A porta `5180` é fixada em `vite.config.ts` (`server: { port: 5180 }`). O script `build` roda o typecheck antes do `vite build` — código com erro de tipo não builda.

---

## 2. Estrutura de pastas

```
fable-os/
├── AGENT-GUIDE.md          # Contrato seguido pelos agentes que construíram os apps (ver seção 8)
├── index.html              # Entry HTML do Vite
├── vite.config.ts          # Plugins react + tailwindcss; porta 5180
├── tsconfig.json           # strict, noUnusedLocals, noUnusedParameters
└── src/
    ├── main.tsx            # Bootstrap do React
    ├── App.tsx             # Boot screen → Desktop; abre o app "Sobre" na primeira visita
    ├── index.css           # Tailwind + estilos globais (animações, --accent)
    ├── system/             # Núcleo do sistema operacional
    │   ├── types.ts        # AppProps, Bounds, WindowState
    │   ├── apps.ts         # APP_META: metadados de todos os apps (ícone, tamanho, etc.)
    │   ├── registry.tsx    # APP_COMPONENTS: mapa id → componente lazy
    │   ├── windowStore.ts  # Store Zustand do window manager
    │   ├── vfs.ts          # Sistema de arquivos virtual (persiste em localStorage)
    │   └── themeStore.ts   # Cor de destaque e wallpaper
    ├── components/         # Shell do sistema (não são apps)
    │   ├── BootScreen.tsx, Desktop.tsx, DesktopIcons.tsx,
    │   ├── StartMenu.tsx, Taskbar.tsx, Wallpaper.tsx
    │   └── Window.tsx      # Moldura de janela: drag, resize em 8 direções, maximizar
    └── apps/               # Um diretório por aplicativo
        ├── about/          # Exemplo mínimo: um único index.tsx
        ├── terminal/       # Apps maiores dividem em módulos (interpreter.ts, ...)
        ├── files/, editor/, paint/, calculator/, synth/,
        └── fluid/, fractal/, tetris/, monitor/, settings/
```

Convenção central: **cada app vive exclusivamente em `src/apps/<id>/`**, com entry obrigatório `index.tsx`. Pode haver quantos arquivos auxiliares quiser dentro da pasta (`engine.ts`, `helpers.ts`, subcomponentes), mas nada fora dela.

---

## 3. Tutorial: criando um novo aplicativo

Suponha um app `notas` (bloco de notas rápido). São três passos.

### 3.1 Registrar os metadados em `src/system/apps.ts`

Adicione uma entrada ao array `APP_META`:

```ts
{
  id: 'notas',
  name: 'Notas',
  description: 'Anotações rápidas',
  icon: '🗒️',                                  // emoji usado como ícone
  tint: '#fbbf24',                              // cor do ícone (hex)
  defaultSize: { width: 520, height: 420 },
  minSize: { width: 360, height: 260 },
  desktop: true,                                // exibe ícone no desktop
}
```

Com isso o app já aparece no menu Iniciar e, se `desktop: true`, ganha ícone no desktop (`DesktopIcons.tsx` filtra por essa flag). Nenhuma outra mudança no shell é necessária.

### 3.2 Criar `src/apps/notas/index.tsx`

O entry deve ter `export default` de um componente funcional que recebe `AppProps`:

```tsx
import { useState } from 'react'
import type { AppProps } from '../../system/types'
import { readFile, writeFile } from '../../system/vfs'

const PATH = '/home/user/documentos/notas.txt'

export default function NotasApp(_props: AppProps) {
  const [text, setText] = useState(() => {
    try { return readFile(PATH) } catch { return '' }
  })

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-white/10 px-2">
        <button
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
          onClick={() => writeFile(PATH, text)}
        >
          Salvar
        </button>
      </div>
      <textarea
        className="flex-1 resize-none bg-transparent p-3 font-mono text-sm text-white/90 outline-none"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Escreva suas notas..."
      />
    </div>
  )
}
```

Pontos de atenção:

- `AppProps = { windowId: string; payload?: unknown }`. Props não usadas devem ser prefixadas com `_` (o tsconfig liga `noUnusedParameters`).
- O componente é renderizado na área de conteúdo de uma janela **redimensionável**. O root deve preencher tudo (`h-full w-full`) e tratar overflow internamente. Nunca assuma tamanho fixo — para canvas, use `ResizeObserver`.
- `payload` permite que outro app abra o seu com dados (ex.: o app Arquivos abre o editor passando um caminho).

### 3.3 Registrar o componente em `src/system/registry.tsx`

Adicione a entrada lazy ao mapa `APP_COMPONENTS`:

```ts
export const APP_COMPONENTS: Record<string, LazyApp> = {
  // ...apps existentes
  notas: lazy(() => import('../apps/notas')),
}
```

O code splitting é automático: cada app vira um chunk separado, carregado na primeira abertura da janela.

### 3.4 Validar

```bash
npm run typecheck   # zero erros
npm run dev         # duplo clique no ícone "Notas" no desktop
```

---

## 4. APIs do sistema disponíveis para apps

### 4.1 `src/system/windowStore.ts` — window manager

Store Zustand. Fora de render, use `useWindows.getState()`; em componentes, use o hook com seletor.

```ts
useWindows.getState().openApp(appId: string, options?: { payload?: unknown; title?: string }): string  // retorna windowId
useWindows.getState().close(windowId: string): void
useWindows.getState().focus(windowId: string): void
useWindows.getState().minimize(windowId: string): void
useWindows.getState().toggleMaximize(windowId: string): void
useWindows.getState().setBounds(windowId: string, bounds: Partial<Bounds>): void
useWindows.getState().setTitle(windowId: string, title: string): void
// Estado: windows: WindowState[], focusedId: string | null
// Constante: TASKBAR_HEIGHT = 48
```

Uso típico em um app: `setTitle(windowId, 'Notas — notas.txt')` para refletir o documento aberto.

### 4.2 `src/system/vfs.ts` — sistema de arquivos virtual

Funções soltas (importe o que precisar). Persistência automática em localStorage.

```ts
// Caminhos
normalizePath(p: string): string
joinPath(base: string, rel: string): string
parentPath(p: string): string
baseName(p: string): string

// Leitura
getNode(path: string): VfsNode | null      // VfsFile { type:'file', content, mtime } | VfsDir { type:'dir', children, mtime }
exists(path: string): boolean
isDir(path: string): boolean
list(path: string): { name: string; node: VfsNode }[]   // lança Error se não for diretório
readFile(path: string): string                           // lança Error se não existir
stats(): { files: number; dirs: number; bytes: number }

// Escrita
writeFile(path: string, content: string): void   // cria diretórios pais automaticamente
mkdir(path: string): void                         // recursivo
remove(path: string): void                        // lança Error se não existir
rename(from: string, to: string): void            // move/renomeia
resetVfs(): void                                  // restaura o seed inicial

// Reatividade: re-renderiza a cada mutação do filesystem
const version = useVfs(s => s.version)
```

Home do usuário: `/home/user` (contém `documentos/`, `imagens/`, `musicas/`, `projetos/`). As funções de escrita e leitura lançam `Error` com mensagem amigável em pt-BR — capture com `try/catch` e exiba ao usuário.

### 4.3 `src/system/themeStore.ts` — tema

```ts
useTheme  // { accent: string (hex), wallpaper: string, setAccent(hex), setWallpaper(id) }
WALLPAPERS: { id: string; name: string; preview: string }[]  // preview = gradiente CSS para cards
ACCENT_PRESETS: string[]                                      // hexes sugeridos
```

A cor de destaque é exposta globalmente como a variável CSS `--accent` — na prática, apps não precisam ler o store, basta usar `var(--accent)` no Tailwind.

### 4.4 `src/system/apps.ts` — metadados

```ts
APP_META: AppMeta[]                       // id, name, description, icon, tint, defaultSize, minSize, desktop
getAppMeta(id: string): AppMeta | undefined
```

---

## 5. Convenções

| Tema | Regra |
|---|---|
| TypeScript | Modo `strict` com `noUnusedLocals` e `noUnusedParameters`. Sem `any`. |
| Dependências | Proibido instalar pacotes novos. Apenas React, Zustand e APIs nativas do navegador. |
| Isolamento | Apps não modificam arquivos fora de `src/apps/<id>/` (exceto os dois registros: `apps.ts` e `registry.tsx`). |
| Cleanup | Obrigatório no unmount: timers, `requestAnimationFrame`, `AudioContext`, contexto WebGL, listeners globais. |
| Teclado | Listeners em elementos do próprio app (`tabIndex={0}` + focus), ou em `window` somente enquanto montado. Nunca capturar teclas sem o app estar com foco visível. |
| Idioma | Toda a UI em português brasileiro, com acentuação correta. Sem emojis na UI interna dos apps. |
| Debug | Sem `console.log` no código final. |

### Linguagem visual (glassmorphism escuro)

- Painéis: `bg-white/5`, bordas `border border-white/10`, raio `rounded-lg`/`rounded-xl`.
- Cor de destaque dinâmica: sempre `var(--accent)` (`bg-[var(--accent)]`, `text-[var(--accent)]`, etc.). Nunca hardcode a cor roxa.
- Texto: `text-white/90` primário, `text-white/60` secundário, `text-white/35` terciário. Tamanhos `text-xs`/`text-sm`; monospace com `font-mono`.
- Botões: `rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs`; primário `bg-[var(--accent)] hover:opacity-90 text-white`.
- Toolbar de app: `flex h-10 items-center gap-2 border-b border-white/10 px-2`.

O app `src/apps/about/` é a referência mínima de estilo e estrutura.

---

## 6. Persistência (localStorage)

Todo o estado persistente usa o prefixo `fableos-`:

| Chave | Conteúdo | Definida em |
|---|---|---|
| `fableos-vfs-v1` | Árvore completa do sistema de arquivos virtual (JSON) | `src/system/vfs.ts` |
| `fableos-theme-v1` | `{ accent, wallpaper }` | `src/system/themeStore.ts` |
| `fableos-welcomed` | Flag de primeira visita (abre o app "Sobre" uma única vez) | `src/App.tsx` |
| `fableos-tetris-highscore` | Recorde do Tetris | `src/apps/tetris/index.tsx` |

Como resetar:

- **Pela UI**: Ajustes → restauração de fábrica. A função `factoryReset()` (`src/apps/settings/helpers.ts`) remove todas as chaves com prefixo `fableos-` e recarrega a página.
- **Pelo DevTools**: `Object.keys(localStorage).filter(k => k.startsWith('fableos-')).forEach(k => localStorage.removeItem(k))` e recarregue.
- **Apenas o VFS**: a função `resetVfs()` de `src/system/vfs.ts` restaura o conteúdo inicial (seed) sem afetar tema e recordes.

Se um app novo precisar persistir algo próprio, siga o padrão: chave com prefixo `fableos-`, escrita dentro de `try/catch` (quota pode estourar) e leitura tolerante a JSON corrompido.

---

## 7. Bastidores: construído por agentes de IA em paralelo

Uma curiosidade de engenharia: o FableOS foi construído por agentes de IA trabalhando em paralelo. O núcleo (window manager, VFS, temas, taskbar, shell) foi escrito à mão primeiro; em seguida, **12 agentes construíram os 12 aplicativos simultaneamente**, um app por agente, seguido de uma rodada de revisão adversarial.

O arquivo **`AGENT-GUIDE.md`** na raiz do repositório é o contrato que cada agente recebeu: define o isolamento por pasta (`src/apps/<id>/` e nada mais), o formato do entry (`export default` + `AppProps`), as APIs do sistema disponíveis, a linguagem visual e as regras de validação (`npx tsc --noEmit`, ignorando erros das pastas dos outros agentes, já que todos trabalhavam ao mesmo tempo).

É por isso que a arquitetura é tão rígida quanto a isolamento e contrato de interface: ela foi desenhada para que doze implementações independentes pudessem ser integradas sem conflito de merge e sem que um app quebrasse outro. Para o desenvolvimento humano, vale a mesma disciplina — e o `AGENT-GUIDE.md` continua sendo leitura recomendada antes de criar um app novo.
