import type { KeyboardEvent } from 'react'

/** Кликабельный div (зона ставки, квиток, стопка фишек) — ещё и кнопка для клавиатуры: Tab, Enter / пробел. */
export function pressable(onPress: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      onPress()
    },
  }
}

/** Горячие клавиши не срабатывают с модификаторами (Ctrl+C — не смок), на автоповторе и при наборе в поле. */
export function ignoreHotkey(e: globalThis.KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return true
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
