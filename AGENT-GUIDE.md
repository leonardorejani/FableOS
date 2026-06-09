# FableOS — Guia para agentes construtores

Você está construindo UM aplicativo do FableOS, um sistema operacional que roda no navegador.
O núcleo (window manager, VFS, temas, taskbar) JÁ EXISTE e funciona. Não toque nele.

## Projeto

- Raiz: `C:\Users\Usuario\desktop\fable-os`
- Stack: React 19 + TypeScript (strict) + Tailwind CSS v4 + Zustand 5. Vite.
- **PROIBIDO instalar dependências novas.** Use apenas: `react`, `zustand` e as APIs nativas do navegador (Canvas, WebGL, Web Audio, localStorage).
- TypeScript strict com `noUnusedLocals` e `noUnusedParameters` ligados. Sem `any`.

## Contrato do app

- Seu app vive em `src/apps/<id>/` e SOMENTE lá. Pode criar múltiplos arquivos dentro da sua pasta (ex: `engine.ts`, `helpers.ts`), mas o entry é sempre `src/apps/<id>/index.tsx`.
- `index.tsx` DEVE ter `export default` de um componente funcional React que recebe `AppProps`:

```tsx
import type { AppProps } from '../../system/types'

export default function MeuApp({ windowId, payload }: AppProps) { ... }
```

- `AppProps = { windowId: string; payload?: unknown }`. Se não usar um prop, prefixe com `_` (ex: `_props`).
- O componente é renderizado dentro da área de conteúdo de uma janela **redimensionável**. O root do seu JSX deve preencher tudo: `className="flex h-full w-full flex-col ..."`. Trate overflow internamente. NUNCA assuma tamanho fixo — use medidas relativas, `ResizeObserver` para canvas.
- Cleanup obrigatório no unmount: timers, requestAnimationFrame, AudioContext, contexto WebGL, event listeners globais.
- Eventos de teclado: adicione listeners em elementos do seu app (com `tabIndex={0}` + focus), ou em `window` SOMENTE enquanto montado, e nunca capture teclas se o seu app não estiver com foco visível (cheque `document.activeElement` contido no seu root ref quando fizer sentido).

## APIs do sistema (leia os arquivos para detalhes)

### `src/system/windowStore.ts`
```ts
useWindows  // zustand store
useWindows.getState().openApp(appId: string, options?: { payload?: unknown; title?: string }): string
useWindows.getState().setTitle(windowId, title)
useWindows.getState().close(windowId)
// estado: windows: WindowState[], focusedId: string | null
```

### `src/system/vfs.ts` — sistema de arquivos virtual (persiste em localStorage)
```ts
// funções soltas (importe o que precisar):
normalizePath(p), joinPath(base, rel), parentPath(p), baseName(p)
getNode(path): VfsNode | null      // VfsNode = VfsFile {type:'file',content,mtime} | VfsDir {type:'dir',children,mtime}
exists(path), isDir(path)
list(path): { name, node }[]        // lança Error se não for dir
readFile(path): string              // lança Error se não existir
writeFile(path, content)            // cria diretórios pais automaticamente
mkdir(path)                         // recursivo
remove(path)                        // lança Error se não existir
rename(from, to)                    // move/renomeia
stats(): { files, dirs, bytes }
// hook de reatividade: const version = useVfs(s => s.version)  → re-renderiza a cada mutação
```
Home do usuário: `/home/user` (contém documentos/, imagens/, musicas/, projetos/).
Erros das funções do VFS são `Error` com mensagem amigável em pt-BR — capture com try/catch e mostre ao usuário.

### `src/system/themeStore.ts`
```ts
useTheme  // { accent: string (hex), wallpaper: string, setAccent(hex), setWallpaper(id) }
WALLPAPERS: { id, name, preview }[]   // preview = CSS gradient para cards
ACCENT_PRESETS: string[]              // hexes sugeridos
```

### `src/system/apps.ts`
```ts
APP_META: AppMeta[]  // id, name, description, icon (emoji), tint (hex), defaultSize, minSize
getAppMeta(id)
```

## Linguagem visual (siga à risca)

- Tema escuro glassmorphism. Fundo de painéis: `bg-white/5`, bordas `border border-white/10`, raio `rounded-lg`/`rounded-xl`.
- Cor de destaque dinâmica: use `var(--accent)` (ex: `bg-[var(--accent)]`, `text-[var(--accent)]`, `border-[var(--accent)]`, `accent-[var(--accent)]` em inputs range). NÃO hardcode roxo.
- Texto: `text-white/90` primário, `text-white/60` secundário, `text-white/35` terciário.
- Botões: `rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs` (primário: `bg-[var(--accent)] hover:opacity-90 text-white`).
- Toolbar de app: barra superior `flex h-10 items-center gap-2 border-b border-white/10 px-2`.
- Tipografia: textos `text-xs`/`text-sm`. Monospace: `font-mono`.
- UI inteira em **português brasileiro** (com acentuação correta).
- Sem emojis na UI interna do app, exceto onde especificado.

## Regras finais

- NÃO modifique nenhum arquivo fora de `src/apps/<seu-id>/`.
- NÃO rode `npm install`, `npm run dev` nem builds completos.
- Valide com: `cd C:\Users\Usuario\desktop\fable-os && npx tsc --noEmit` — corrija TODOS os erros dentro da SUA pasta; ignore erros de outras pastas `src/apps/*` (outros agentes estão trabalhando nelas em paralelo).
- Sem `console.log` de debug no código final.
- Capriche: este app é uma demonstração de capacidade máxima. Funcionalidade completa, detalhes de UX (estados vazios, hover, foco, atalhos), e robustez (try/catch em I/O, guards em APIs de navegador).
