import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { AppProps } from '../../system/types'
import { useWindows } from '../../system/windowStore'
import {
  useVfs,
  list,
  mkdir,
  writeFile,
  remove,
  rename,
  exists,
  isDir,
  getNode,
  joinPath,
  parentPath,
  normalizePath,
  baseName,
} from '../../system/vfs'
import type { VfsEntry } from '../../system/vfs'
import {
  HOME_PATH,
  SHORTCUTS,
  breadcrumbSegments,
  errorMessage,
  formatBytes,
  formatCount,
  iconForEntry,
  initialPathFromPayload,
  nodeBytes,
  validateName,
} from './helpers'
import { Icon } from './icons'
import type { IconName } from './icons'

type EditMode = 'new-folder' | 'new-file' | 'rename'

interface EditingState {
  mode: EditMode
  /** Nome original do item sendo renomeado (null nas criações). */
  target: string | null
}

interface NameInputProps {
  initial: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

function NameInput({ initial, onConfirm, onCancel }: NameInputProps) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') onConfirm(value)
        else if (e.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      placeholder="nome…"
      spellCheck={false}
      className="w-full rounded border border-[var(--accent)] bg-black/50 px-1 py-0.5 text-center text-xs text-white outline-none placeholder:text-white/30"
    />
  )
}

interface ToolButtonProps {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
}

function ToolButton({ icon, label, onClick, disabled }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/75 transition-colors hover:bg-white/15 hover:text-white disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon name={icon} />
    </button>
  )
}

export default function FilesApp({ windowId, payload }: AppProps) {
  const version = useVfs(s => s.version)
  const setTitle = useWindows(s => s.setTitle)

  const [path, setPath] = useState<string>(() => {
    const fromPayload = initialPathFromPayload(payload)
    return fromPayload && isDir(fromPayload) ? fromPayload : HOME_PATH
  })
  const [history, setHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // ----- Dados do diretório atual (reativos ao VFS) -----

  const entries = useMemo<VfsEntry[]>(() => {
    try {
      return list(path)
    } catch {
      return []
    }
  }, [path, version])

  const dirInfo = useMemo(() => {
    const node = getNode(path)
    return {
      count: entries.length,
      fileCount: entries.filter(e => e.node.type === 'file').length,
      bytes: node ? nodeBytes(node) : 0,
    }
  }, [entries, path, version])

  const selectedEntry = useMemo(
    () => (selected ? (entries.find(e => e.name === selected) ?? null) : null),
    [entries, selected],
  )

  const deleteEntry = useMemo(
    () => (confirmDelete ? (entries.find(e => e.name === confirmDelete) ?? null) : null),
    [entries, confirmDelete],
  )

  // ----- Navegação -----

  const navigate = useCallback(
    (to: string) => {
      const target = normalizePath(to)
      if (target === path) return
      setHistory(h => [...h, path])
      setPath(target)
      setSelected(null)
      setEditing(null)
      setConfirmDelete(null)
    },
    [path],
  )

  const goBack = useCallback(() => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(history.slice(0, -1))
    setPath(prev)
    setSelected(null)
    setEditing(null)
    setConfirmDelete(null)
  }, [history])

  const goUp = useCallback(() => {
    if (path !== '/') navigate(parentPath(path))
  }, [path, navigate])

  const openEntry = useCallback(
    (entry: VfsEntry) => {
      const full = joinPath(path, entry.name)
      if (entry.node.type === 'dir') {
        navigate(full)
        return
      }
      try {
        useWindows.getState().openApp('editor', { payload: { path: full } })
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [path, navigate],
  )

  // Se o diretório atual deixar de existir (ex.: removido por outro app),
  // sobe até o ancestral existente mais próximo.
  useEffect(() => {
    if (isDir(path)) return
    let p = path
    while (p !== '/' && !isDir(p)) p = parentPath(p)
    setPath(p)
    setSelected(null)
    setEditing(null)
    setConfirmDelete(null)
  }, [version, path])

  useEffect(() => {
    setTitle(windowId, `Arquivos — ${path === '/' ? 'Raiz' : baseName(path)}`)
  }, [windowId, path, setTitle])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 })
  }, [path])

  // ----- Ações (criar / renomear / excluir) -----

  const refocus = useCallback(() => {
    containerRef.current?.focus()
  }, [])

  const cancelEdit = useCallback(() => {
    setEditing(null)
    refocus()
  }, [refocus])

  const confirmEdit = useCallback(
    (rawName: string) => {
      if (!editing) return
      const name = rawName.trim()
      if (!name || (editing.mode === 'rename' && name === editing.target)) {
        cancelEdit()
        return
      }
      const invalid = validateName(name)
      if (invalid) {
        setError(invalid)
        return
      }
      try {
        const full = joinPath(path, name)
        if (editing.mode === 'rename') {
          if (!editing.target) throw new Error('Nenhum item selecionado para renomear.')
          rename(joinPath(path, editing.target), full)
        } else {
          if (exists(full)) throw new Error(`Já existe um item chamado “${name}” aqui.`)
          if (editing.mode === 'new-folder') mkdir(full)
          else writeFile(full, '')
        }
        setEditing(null)
        setSelected(name)
        refocus()
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [editing, path, cancelEdit, refocus],
  )

  const startCreate = useCallback((mode: 'new-folder' | 'new-file') => {
    setConfirmDelete(null)
    setEditing({ mode, target: null })
  }, [])

  const startRename = useCallback(() => {
    if (!selected) return
    setConfirmDelete(null)
    setEditing({ mode: 'rename', target: selected })
  }, [selected])

  const askDelete = useCallback(() => {
    if (!selected) return
    setEditing(null)
    setConfirmDelete(selected)
  }, [selected])

  const cancelDelete = useCallback(() => {
    setConfirmDelete(null)
    refocus()
  }, [refocus])

  const doDelete = useCallback(() => {
    if (!confirmDelete) return
    try {
      remove(joinPath(path, confirmDelete))
      setSelected(s => (s === confirmDelete ? null : s))
    } catch (err) {
      setError(errorMessage(err))
    }
    setConfirmDelete(null)
    refocus()
  }, [confirmDelete, path, refocus])

  // ----- Teclado -----

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editing || confirmDelete) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT') return
      const onButton = target.tagName === 'BUTTON' || target.closest('button') !== null

      switch (e.key) {
        case 'Delete':
          if (selected) {
            e.preventDefault()
            askDelete()
          }
          break
        case 'F2':
          if (selected) {
            e.preventDefault()
            startRename()
          }
          break
        case 'Enter':
          if (!onButton && selectedEntry) {
            e.preventDefault()
            openEntry(selectedEntry)
          }
          break
        case 'Backspace':
          e.preventDefault()
          goUp()
          break
        case 'Escape':
          setSelected(null)
          break
        case 'ArrowRight':
        case 'ArrowLeft': {
          if (entries.length === 0) break
          e.preventDefault()
          const idx = entries.findIndex(en => en.name === selected)
          const delta = e.key === 'ArrowRight' ? 1 : -1
          const next =
            idx === -1
              ? delta === 1
                ? 0
                : entries.length - 1
              : Math.min(entries.length - 1, Math.max(0, idx + delta))
          setSelected(entries[next].name)
          break
        }
        case 'Home':
          if (entries.length > 0) {
            e.preventDefault()
            setSelected(entries[0].name)
          }
          break
        case 'End':
          if (entries.length > 0) {
            e.preventDefault()
            setSelected(entries[entries.length - 1].name)
          }
          break
      }
    },
    [
      editing,
      confirmDelete,
      selected,
      selectedEntry,
      entries,
      askDelete,
      startRename,
      openEntry,
      goUp,
    ],
  )

  // ----- Render -----

  const crumbs = breadcrumbSegments(path)
  const isCreating = editing !== null && editing.mode !== 'rename'

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative flex h-full w-full flex-col text-white/90 outline-none"
    >
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-2">
        <ToolButton icon="back" label="Voltar" onClick={goBack} disabled={history.length === 0} />
        <ToolButton icon="up" label="Acima" onClick={goUp} disabled={path === '/'} />
        <div className="h-4 w-px shrink-0 bg-white/10" />
        <div className="flex h-7 min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg border border-white/10 bg-white/5 px-2 whitespace-nowrap [scrollbar-width:none]">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
                {i > 0 && <Icon name="chevron" className="h-3 w-3 text-white/25" />}
                <button
                  type="button"
                  onClick={() => navigate(crumb.path)}
                  className={`rounded px-1 py-0.5 text-xs transition-colors ${
                    last
                      ? 'font-medium text-white/90'
                      : 'text-white/55 hover:bg-white/10 hover:text-white/90'
                  }`}
                >
                  {crumb.label}
                </button>
              </span>
            )
          })}
        </div>
        <div className="h-4 w-px shrink-0 bg-white/10" />
        <ToolButton icon="folder-plus" label="Nova pasta" onClick={() => startCreate('new-folder')} />
        <ToolButton icon="file-plus" label="Novo arquivo" onClick={() => startCreate('new-file')} />
        <ToolButton icon="rename" label="Renomear (F2)" onClick={startRename} disabled={!selected} />
        <ToolButton icon="trash" label="Excluir (Delete)" onClick={askDelete} disabled={!selected} />
      </div>

      {/* Corpo: sidebar + conteúdo */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/10 p-2">
          <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-wider text-white/35 uppercase">
            Locais
          </p>
          {SHORTCUTS.map(shortcut => {
            const active = path === shortcut.path
            return (
              <button
                key={shortcut.path}
                type="button"
                onClick={() => navigate(shortcut.path)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                  active
                    ? 'bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] text-white'
                    : 'text-white/65 hover:bg-white/5 hover:text-white/90'
                }`}
              >
                <Icon
                  name={shortcut.icon}
                  className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-[var(--accent)]' : 'text-white/40'}`}
                />
                <span className="truncate">{shortcut.label}</span>
              </button>
            )
          })}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {error && (
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-xs text-red-200">
              <span className="min-w-0 flex-1 break-words">{error}</span>
              <button
                type="button"
                title="Descartar"
                aria-label="Descartar aviso"
                onClick={() => setError(null)}
                className="rounded p-0.5 text-red-200/70 transition-colors hover:bg-white/10 hover:text-red-100"
              >
                <Icon name="close" className="h-3 w-3" />
              </button>
            </div>
          )}

          {entries.length === 0 && !isCreating ? (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 text-center select-none"
              onClick={() => setSelected(null)}
            >
              <span className="text-4xl opacity-35">📁</span>
              <p className="text-sm text-white/50">Pasta vazia</p>
              <p className="text-xs text-white/30">
                Use os botões da barra acima para criar um arquivo ou uma pasta
              </p>
            </div>
          ) : (
            <div
              ref={gridRef}
              className="min-h-0 flex-1 overflow-y-auto"
              onClick={() => setSelected(null)}
            >
              <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] content-start gap-1 p-3">
                {entries.map(entry => {
                  const isSelected = selected === entry.name
                  const isRenaming = editing?.mode === 'rename' && editing.target === entry.name
                  return (
                    <div
                      key={entry.name}
                      role="button"
                      title={entry.name}
                      onClick={e => {
                        e.stopPropagation()
                        setSelected(entry.name)
                      }}
                      onDoubleClick={() => openEntry(entry)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg px-1.5 py-3 text-center transition-colors select-none ${
                        isSelected
                          ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] ring-1 ring-[var(--accent)]'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="text-3xl leading-none drop-shadow">
                        {iconForEntry(entry.name, entry.node.type === 'dir')}
                      </span>
                      {isRenaming ? (
                        <NameInput
                          initial={entry.name}
                          onConfirm={confirmEdit}
                          onCancel={cancelEdit}
                        />
                      ) : (
                        <span className="line-clamp-2 w-full text-xs break-words text-white/80">
                          {entry.name}
                        </span>
                      )}
                    </div>
                  )
                })}

                {isCreating && (
                  <div className="flex flex-col items-center gap-1.5 rounded-lg bg-white/5 px-1.5 py-3 text-center ring-1 ring-[var(--accent)]/60">
                    <span className="text-3xl leading-none opacity-70 drop-shadow">
                      {editing?.mode === 'new-folder' ? '📁' : '📃'}
                    </span>
                    <NameInput initial="" onConfirm={confirmEdit} onCancel={cancelEdit} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Barra de status */}
          <div className="flex h-7 shrink-0 items-center gap-2 border-t border-white/10 px-3 text-[11px] text-white/45">
            <span className="truncate">
              {formatCount(dirInfo.count, 'item', 'itens')} ·{' '}
              {formatCount(dirInfo.fileCount, 'arquivo', 'arquivos')} ·{' '}
              {formatBytes(dirInfo.bytes)}
            </span>
            {selectedEntry && (
              <span className="ml-auto truncate text-white/55">
                “{selectedEntry.name}”
                {selectedEntry.node.type === 'file' &&
                  ` · ${formatBytes(selectedEntry.node.content.length)}`}
              </span>
            )}
          </div>
        </main>
      </div>

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
          onClick={cancelDelete}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Escape') cancelDelete()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar exclusão"
            onClick={e => e.stopPropagation()}
            className="w-80 max-w-[90%] rounded-xl border border-white/10 bg-[#14161f]/95 p-4 shadow-2xl"
          >
            <p className="text-sm font-medium break-words text-white/90">
              Excluir {deleteEntry?.node.type === 'dir' ? 'a pasta' : 'o arquivo'} “{confirmDelete}
              ”?
            </p>
            <p className="mt-1 text-xs text-white/50">
              Esta ação não pode ser desfeita.
              {deleteEntry?.node.type === 'dir' && ' Todo o conteúdo será removido.'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15"
              >
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                onClick={doDelete}
                className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-500"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
