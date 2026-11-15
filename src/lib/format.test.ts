import { describe, expect, it } from 'vitest'
import { formatDistanceM } from './format'

describe('formatDistanceM', () => {
  it('rounds to whole meters under a kilometer', () => {
    expect(formatDistanceM(0)).toBe('0 m')
    expect(formatDistanceM(349.4)).toBe('349 m')
    expect(formatDistanceM(999.9)).toBe('1000 m')
  })

  it('shows one decimal kilometer from a kilometer up', () => {
    expect(formatDistanceM(1000)).toBe('1.0 km')
    expect(formatDistanceM(15499)).toBe('15.5 km')
  })
})
