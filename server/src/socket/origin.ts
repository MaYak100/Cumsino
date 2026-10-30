/** Откуда пускаем браузеры: CLIENT_ORIGIN (на Render — адрес GitHub Pages), локально — любой localhost. */
export const CLIENT_ORIGIN: string | RegExp = process.env.CLIENT_ORIGIN ?? /^http:\/\/localhost(:\d+)?$/

/** Origin из браузера должен совпадать с CLIENT_ORIGIN. cors действует только на polling — WebSocket-апгрейд
 *  проверяем сами (allowRequest). Без Origin (не браузер) — пропускаем: такой клиент подделает его и так. */
export function originAllowed(origin: string | undefined, allowed: string | RegExp = CLIENT_ORIGIN): boolean {
  if (!origin) return true
  return typeof allowed === 'string' ? origin === allowed : allowed.test(origin)
}
