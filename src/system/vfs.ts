import { create } from 'zustand'

export interface VfsFile {
  type: 'file'
  content: string
  mtime: number
}

export interface VfsDir {
  type: 'dir'
  children: Record<string, VfsNode>
  mtime: number
}

export type VfsNode = VfsFile | VfsDir

const STORAGE_KEY = 'fableos-vfs-v1'

export function normalizePath(path: string): string {
  const parts = path.split('/').filter(p => p !== '' && p !== '.')
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

export function joinPath(base: string, rel: string): string {
  if (rel.startsWith('/')) return normalizePath(rel)
  return normalizePath(base + '/' + rel)
}

export function parentPath(path: string): string {
  const n = normalizePath(path)
  const idx = n.lastIndexOf('/')
  return idx <= 0 ? '/' : n.slice(0, idx)
}

export function baseName(path: string): string {
  const n = normalizePath(path)
  return n === '/' ? '/' : n.slice(n.lastIndexOf('/') + 1)
}

function makeDir(children: Record<string, VfsNode> = {}): VfsDir {
  return { type: 'dir', children, mtime: Date.now() }
}

function makeFile(content: string): VfsFile {
  return { type: 'file', content, mtime: Date.now() }
}

function seedRoot(): VfsDir {
  return makeDir({
    home: makeDir({
      user: makeDir({
        documentos: makeDir({
          'bem-vindo.txt': makeFile(
            'Bem-vindo ao FableOS!\n\n' +
              'Este sistema operacional roda inteiramente no seu navegador.\n' +
              'Foi construído do zero em React + TypeScript pelo Claude Fable 5.\n\n' +
              'Algumas coisas para experimentar:\n' +
              '  - Abra o Terminal e digite "help" (depois "neofetch")\n' +
              '  - Desenhe algo no Paint e salve em /home/user/imagens\n' +
              '  - Toque um beat no Synth Studio\n' +
              '  - Brinque com a simulação de fluidos (arraste o mouse!)\n' +
              '  - Explore o conjunto de Mandelbrot no app Fractais\n' +
              '  - Mude o wallpaper e a cor de destaque em Ajustes\n\n' +
              'Todos os arquivos que você criar ficam salvos no navegador.\n',
          ),
          'sobre.md': makeFile(
            '# FableOS\n\n' +
              'Um sistema operacional de navegador, construído como demonstração\n' +
              'de capacidade do modelo **Claude Fable 5**.\n\n' +
              '## Arquitetura\n\n' +
              '- Window manager próprio (drag, resize, snap, z-order)\n' +
              '- Sistema de arquivos virtual persistido em localStorage\n' +
              '- 12 aplicativos, incluindo simulações em GPU (WebGL)\n' +
              '- Áudio sintetizado em tempo real (Web Audio API)\n' +
              '- Zero dependências além de React, Zustand e Tailwind\n',
          ),
        }),
        imagens: makeDir({}),
        musicas: makeDir({}),
        projetos: makeDir({
          'hello.js': makeFile(
            "// Experimente abrir este arquivo no editor de Código\nfunction saudacao(nome) {\n  return `Olá, ${nome}! Bem-vindo ao FableOS.`\n}\n\nconsole.log(saudacao('mundo'))\n",
          ),
          'notas.md': makeFile(
            '# Notas\n\n- [x] Inventar um OS no navegador\n- [x] Fazer ele ser bonito\n- [ ] Dominar o mundo\n',
          ),
        }),
      }),
    }),
  })
}

function loadRoot(): VfsDir {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as VfsDir
      if (parsed && parsed.type === 'dir') return parsed
    }
  } catch {
    // estado corrompido: recomeça do seed
  }
  return seedRoot()
}

interface VfsState {
  root: VfsDir
  version: number
}

/**
 * Para reagir a mudanças no filesystem, componentes devem assinar `version`:
 *   const version = useVfs(s => s.version)
 * e então chamar as funções utilitárias (list, readFile...) normalmente.
 */
export const useVfs = create<VfsState>()(() => ({
  root: loadRoot(),
  version: 0,
}))

function commit(): void {
  const root = useVfs.getState().root
  useVfs.setState(s => ({ root: { ...root }, version: s.version + 1 }))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root))
  } catch {
    // quota excedida: mantém apenas em memória
  }
}

function getNodeFrom(root: VfsDir, path: string): VfsNode | null {
  const n = normalizePath(path)
  if (n === '/') return root
  let cur: VfsNode = root
  for (const part of n.slice(1).split('/')) {
    if (cur.type !== 'dir') return null
    const next: VfsNode | undefined = cur.children[part]
    if (!next) return null
    cur = next
  }
  return cur
}

export function getNode(path: string): VfsNode | null {
  return getNodeFrom(useVfs.getState().root, path)
}

export function exists(path: string): boolean {
  return getNode(path) !== null
}

export function isDir(path: string): boolean {
  return getNode(path)?.type === 'dir'
}

export interface VfsEntry {
  name: string
  node: VfsNode
}

export function list(path: string): VfsEntry[] {
  const node = getNode(path)
  if (!node || node.type !== 'dir') {
    throw new Error(`Não é um diretório: ${normalizePath(path)}`)
  }
  return Object.entries(node.children)
    .map(([name, child]) => ({ name, node: child }))
    .sort((a, b) => {
      if (a.node.type !== b.node.type) return a.node.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, 'pt-BR')
    })
}

export function readFile(path: string): string {
  const node = getNode(path)
  if (!node) throw new Error(`Arquivo não encontrado: ${normalizePath(path)}`)
  if (node.type !== 'file') throw new Error(`É um diretório: ${normalizePath(path)}`)
  return node.content
}

function ensureDir(path: string): VfsDir {
  const n = normalizePath(path)
  const root = useVfs.getState().root
  if (n === '/') return root
  let cur: VfsDir = root
  for (const part of n.slice(1).split('/')) {
    const next: VfsNode | undefined = cur.children[part]
    if (!next) {
      const created = makeDir({})
      cur.children[part] = created
      cur = created
    } else if (next.type === 'dir') {
      cur = next
    } else {
      throw new Error(`Já existe um arquivo em: ${part}`)
    }
  }
  return cur
}

export function mkdir(path: string): void {
  ensureDir(path)
  commit()
}

export function writeFile(path: string, content: string): void {
  const n = normalizePath(path)
  if (n === '/') throw new Error('Caminho inválido')
  const parent = ensureDir(parentPath(n))
  const name = baseName(n)
  const existing: VfsNode | undefined = parent.children[name]
  if (existing && existing.type === 'dir') {
    throw new Error(`É um diretório: ${n}`)
  }
  parent.children[name] = makeFile(content)
  commit()
}

export function remove(path: string): void {
  const n = normalizePath(path)
  if (n === '/') throw new Error('Não é possível remover a raiz')
  const parent = getNode(parentPath(n))
  const name = baseName(n)
  if (!parent || parent.type !== 'dir' || !(name in parent.children)) {
    throw new Error(`Não encontrado: ${n}`)
  }
  delete parent.children[name]
  commit()
}

export function rename(from: string, to: string): void {
  const nFrom = normalizePath(from)
  const nTo = normalizePath(to)
  if (nFrom === '/' || nTo === '/') throw new Error('Caminho inválido')
  if (nTo === nFrom) return
  if (nTo.startsWith(nFrom + '/')) {
    throw new Error('Não é possível mover um diretório para dentro dele mesmo')
  }
  const node = getNode(nFrom)
  if (!node) throw new Error(`Não encontrado: ${nFrom}`)
  if (exists(nTo)) throw new Error(`Já existe: ${nTo}`)
  const fromParent = getNode(parentPath(nFrom))
  if (!fromParent || fromParent.type !== 'dir') throw new Error(`Não encontrado: ${nFrom}`)
  const toParent = ensureDir(parentPath(nTo))
  delete fromParent.children[baseName(nFrom)]
  toParent.children[baseName(nTo)] = node
  commit()
}

export interface VfsStats {
  files: number
  dirs: number
  bytes: number
}

export function stats(): VfsStats {
  const acc: VfsStats = { files: 0, dirs: 0, bytes: 0 }
  const walk = (node: VfsNode): void => {
    if (node.type === 'file') {
      acc.files += 1
      acc.bytes += node.content.length
    } else {
      acc.dirs += 1
      for (const child of Object.values(node.children)) walk(child)
    }
  }
  walk(useVfs.getState().root)
  return acc
}

export function resetVfs(): void {
  useVfs.setState({ root: seedRoot(), version: useVfs.getState().version + 1 })
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignora
  }
}
