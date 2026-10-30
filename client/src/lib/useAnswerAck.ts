import { useEffect } from 'react'

const ACK_MS = 2500

/** Ответ отправлен, а сервер его не засчитал (hasAnswered / player_answered не пришёл) — например, хекс кончился,
 *  пока ответ летел, или число не прошло проверку. Через ACK_MS снимаем локальный выбор, чтобы экран не говорил
 *  «Ответ принят» про ответ, которого у сервера нет. */
export function useAnswerAck(pending: boolean, confirmed: boolean, onLost: () => void) {
  useEffect(() => {
    if (!pending || confirmed) return
    const t = setTimeout(onLost, ACK_MS)
    return () => clearTimeout(t)
  }, [pending, confirmed])
}
