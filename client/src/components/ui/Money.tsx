/** Сумма денег: знак $ — как на ценнике, мелкий, другим начертанием, поднят к верху цифр и отделён зазором,
 *  чтобы не сливаться с числом, набранным тем же крупным шрифтом. Шрифт, цвет и размер числа берутся у родителя. */
export function Money({ v }: { v: number }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span
        aria-hidden
        style={{
          fontFamily: "'Rubik', sans-serif",
          fontWeight: 700,
          fontSize: '0.64em',
          verticalAlign: '0.5em',
          lineHeight: 0,
          marginRight: '0.14em',
          opacity: 0.72,
        }}
      >
        $
      </span>
      <span className="tnum">{v}</span>
    </span>
  )
}
