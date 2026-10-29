import { describe, it, expect } from 'vitest'
import { joinTopic, splitTopic } from '../topic'

describe('тема: субъект и аспект', () => {
  it('склейка через перенос строки; без аспекта — один субъект', () => {
    expect(joinTopic('Lion', 'способности')).toBe('Lion\nспособности')
    expect(joinTopic('Heart of Tarrasque')).toBe('Heart of Tarrasque')
    expect(joinTopic('Heart of Tarrasque', '')).toBe('Heart of Tarrasque')
  })

  it('разбор — обратно', () => {
    expect(splitTopic('Герои\nубийства')).toEqual({ subject: 'Герои', aspect: 'убийства' })
    expect(splitTopic('выбрудок и Rocinante')).toEqual({ subject: 'выбрудок и Rocinante' })
    expect(splitTopic(undefined)).toEqual({ subject: '' })
  })
})
