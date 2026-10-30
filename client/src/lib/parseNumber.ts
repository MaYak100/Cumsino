/** Число из поля «кто ближе». Строго: пробелы-разделители тысяч убираются, запятая — десятичный разделитель
 *  (как и точка), но только один. «1.234.567», «12-3», «1e5», пусто → null (а не 1.234 у parseFloat). Бесконечность
 *  (400 цифр) — тоже null: сервер такой ответ не примет. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').replace(',', '.')
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
