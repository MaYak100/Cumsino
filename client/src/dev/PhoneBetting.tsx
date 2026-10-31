import { useBetting } from '../lib/useBetting'
import { CompactBetting } from '../components/screens/CompactBetting'
import { C } from '../theme'

/** /mocks: ставки «как на телефоне» в любом окне — CompactBetting в рамке 390 px (в игре его выбирает ширина экрана,
 *  useCompactBetting). */
export function PhoneBetting() {
  const bet = useBetting()
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        position: 'relative', width: 390, height: '100%', pointerEvents: 'auto',
        borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}`, background: C.bg,
      }}>
        <CompactBetting bet={bet} />
      </div>
    </div>
  )
}
