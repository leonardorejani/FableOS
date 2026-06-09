export interface BrowserInfo {
  name: string
  version: string
}

interface BrowserRule {
  name: string
  regex: RegExp
}

const BROWSER_RULES: BrowserRule[] = [
  { name: 'Edge', regex: /Edg\/([\d.]+)/ },
  { name: 'Opera', regex: /OPR\/([\d.]+)/ },
  { name: 'Samsung Internet', regex: /SamsungBrowser\/([\d.]+)/ },
  { name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
  { name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
  { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
]

export function parseBrowser(userAgent: string): BrowserInfo {
  for (const rule of BROWSER_RULES) {
    const match = userAgent.match(rule.regex)
    if (match && match[1]) {
      const major = match[1].split('.')[0] ?? match[1]
      return { name: rule.name, version: major }
    }
  }
  return { name: 'Desconhecido', version: '' }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = -1
  do {
    value /= 1024
    unitIndex += 1
  } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(1).replace('.', ',')} ${units[unitIndex]}`
}

/**
 * Remove todas as chaves do localStorage que pertencem ao FableOS
 * (prefixo "fableos-") e recarrega a página para reiniciar o sistema.
 */
export function factoryReset(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith('fableos-')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // sem acesso ao localStorage: apenas reinicia
  }
  location.reload()
}
