import type { CSSProperties } from 'react'
import { splitTopic } from '@cumsino/shared'
import { C, DISPLAY } from '../../theme'

/**
 * Тема вопроса — «субъект\nаспект» (shared/src/topic.ts): «Lion» + «способности», «Герои» + «убийства»,
 * «Heart of Tarrasque» без аспекта.
 */

/** На стикере (анонс, стол): субъект крупно шрифтом режимов, аспект под ним мельче, обычным шрифтом. */
export function TopicStack({ topic, size, aspectScale = 0.42 }: { topic?: string | null; size: string | number; aspectScale?: number }) {
  const { subject, aspect } = splitTopic(topic)
  const px = typeof size === 'number' ? `${size}px` : size
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: DISPLAY, fontSize: px, lineHeight: 1, textWrap: 'balance' } as CSSProperties}>
        {subject}
      </div>
      {aspect && (
        <div style={{
          fontSize: `calc(${px} * ${aspectScale})`, fontWeight: 700, lineHeight: 1.1,
          marginTop: `calc(${px} * 0.16)`, opacity: 0.72,
        }}>
          {aspect}
        </div>
      )}
    </div>
  )
}

/** В строку над вопросом: «Lion · способности» — одна строка, раскладка не прыгает. */
export function TopicInline({ topic }: { topic?: string | null }) {
  const { subject, aspect } = splitTopic(topic)
  return (
    <span className="min-w-0 truncate">
      <span style={{ color: C.fg, fontWeight: 600 }}>{subject}</span>
      {aspect && <span> · {aspect}</span>}
    </span>
  )
}
