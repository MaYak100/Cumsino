/** Сумма денег: $ — полноценный символ, но другим шрифтом (Rubik вместо крупного Dela) и с зазором до числа,
 *  чтобы не сливаться с цифрами. Размер, цвет и шрифт числа берутся у родителя. */
export function Money({ v }: { v: number }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ fontFamily: "'Rubik', sans-serif", fontWeight: 600, marginRight: '0.12em' }}>$</span>
      <span className="tnum">{v}</span>
    </span>
  )
}
