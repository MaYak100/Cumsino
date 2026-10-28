import { useGameStore, selectMe } from '../../store/gameStore'

/** «Кто ты» в лобби: назваться человеком из компании (для вопросов про друзей) или пропустить. */
export function WhoAreYou() {
  const gameState = useGameStore(s => s.gameState)!
  const me = useGameStore(selectMe)
  const identify = useGameStore(s => s.identify)
  const roster = gameState.friendRoster ?? []
  if (!roster.length || !me) return null

  const takenBy = new Map(gameState.players.filter(p => p.friendId !== undefined && p.id !== me.id)
    .map(p => [p.friendId!, p.name]))
  const known = gameState.players.filter(p => p.friendId !== undefined).length

  return (
    <div className="w-full max-w-sm mb-6">
      <div className="text-xs uppercase tracking-widest mb-2 text-center" style={{ color: '#c4c9d4' }}>
        Кто ты? <span className="normal-case tracking-normal">— для вопросов про компанию, можно пропустить</span>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {roster.map(f => {
          const mine = me.friendId === f.id
          const taken = takenBy.get(f.id)
          return (
            <button
              key={f.id}
              disabled={!!taken}
              onClick={() => identify(mine ? null : f.id)}
              title={taken ? `уже выбрал ${taken}` : undefined}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                mine ? 'border-yellow-400 bg-[#2a4a2a] text-yellow-400'
                  : taken ? 'border-[#2a4a2a] text-gray-600 cursor-not-allowed'
                    : 'border-[#3a6a3a] bg-[#1a3a1a] hover:border-yellow-600'}`}
              style={mine || taken ? undefined : { color: '#e5e7eb' }}
            >
              {f.name}
            </button>
          )
        })}
        {me.friendId !== undefined && (
          <button onClick={() => identify(null)} className="px-3 py-1.5 rounded-lg text-sm" style={{ color: '#c4c9d4' }}>
            не я ✕
          </button>
        )}
      </div>
      <div className="text-[11px] mt-2 text-center" style={{ color: '#c4c9d4' }}>
        {known >= 2 ? 'Вопросы про компанию включены' : `Вопросы про компанию — когда назовутся двое (сейчас ${known})`}
      </div>
    </div>
  )
}
