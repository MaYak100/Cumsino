// shared/src/topic.ts
// Тема вопроса (Question.displayTopic) — две строки через перенос: субъект (герой, предмет, ник, «Герои») и аспект
// строчными («способности», «убийства»). Аспекта может не быть («Heart of Tarrasque»). Сервер склеивает тему в одном
// месте (server/src/game/questions/picker.ts), клиент показывает субъект крупно, аспект мельче.

export const TOPIC_SEP = '\n'

export function joinTopic(subject: string, aspect?: string | null): string {
  return aspect ? `${subject}${TOPIC_SEP}${aspect}` : subject
}

export function splitTopic(topic: string | null | undefined): { subject: string; aspect?: string } {
  const t = topic ?? ''
  const i = t.indexOf(TOPIC_SEP)
  return i < 0 ? { subject: t } : { subject: t.slice(0, i), aspect: t.slice(i + TOPIC_SEP.length) }
}
