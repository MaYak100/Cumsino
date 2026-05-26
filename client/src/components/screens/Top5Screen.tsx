import { useState } from 'react'
import {
  DndContext, closestCenter,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useGameStore } from '../../store/gameStore'
import { Timer } from '../ui/Timer'

function SortableItem({ id, index }: { id: string; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      {...attributes}
      {...listeners}
      className={`
        flex items-center gap-3 p-3 rounded-xl border cursor-grab active:cursor-grabbing select-none
        ${isDragging ? 'border-yellow-400 bg-[#2a4a2a] shadow-lg z-50 opacity-90' : 'border-[#3a6a3a] bg-[#1a3a1a]'}
      `}
    >
      <span className="w-7 h-7 rounded-full bg-[#2a4a2a] border border-[#3a6a3a] flex items-center justify-center text-sm font-mono text-yellow-400">
        {index + 1}
      </span>
      <span className="text-sm text-white">{id}</span>
      <span className="ml-auto text-gray-600">⠿</span>
    </div>
  )
}

export function Top5Screen() {
  const gameState = useGameStore(s => s.gameState)!
  const myId = useGameStore(s => s.myId)
  const answeredIds = useGameStore(s => s.answeredIds)
  const submitAnswer = useGameStore(s => s.submitAnswer)

  const initialItems = gameState.currentQuestion?.items ?? []
  const [items, setItems] = useState<string[]>(initialItems)

  const myAnswered = myId ? answeredIds.has(myId) : false
  const sensors = useSensors(useSensor(PointerSensor))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems(prev => arrayMove(
      prev,
      prev.indexOf(active.id as string),
      prev.indexOf(over.id as string)
    ))
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Timer seconds={gameState.phaseTimeLeft} />

      <div className="w-full max-w-md mt-4">
        <div className="text-xs uppercase tracking-widest text-gray-400 text-center mb-2">📊 ТОП 5</div>
        <div className="text-center text-white mb-6 leading-relaxed">
          {gameState.currentQuestion?.text}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 mb-6">
              {items.map((item, idx) => (
                <SortableItem key={item} id={item} index={idx} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <button
          onClick={() => submitAnswer(items)}
          disabled={myAnswered}
          className="w-full py-3 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-bold rounded-xl disabled:opacity-40"
        >
          {myAnswered ? '✓ Ответ принят' : 'ПОДТВЕРДИТЬ ПОРЯДОК'}
        </button>
      </div>
    </div>
  )
}
