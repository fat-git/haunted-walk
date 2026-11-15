import { describe, expect, it } from 'vitest'
import { withBase } from './url'

describe('withBase', () => {
  it('joins a rooted path onto the deployed subpath', () => {
    expect(withBase('/tours/new-orleans/tour.json', '/haunted-walk/')).toBe(
      '/haunted-walk/tours/new-orleans/tour.json',
    )
  })

  it('adds a leading slash to a relative path', () => {
    expect(withBase('tours/new-orleans/tour.json', '/haunted-walk/')).toBe(
      '/haunted-walk/tours/new-orleans/tour.json',
    )
  })

  it('does not double the slash when the base has no trailing slash', () => {
    expect(withBase('/manifest.webmanifest', '/haunted-walk')).toBe(
      '/haunted-walk/manifest.webmanifest',
    )
  })

  it('leaves root-relative paths alone when the base is the domain root', () => {
    expect(withBase('/tours/tour.json', '/')).toBe('/tours/tour.json')
  })
})
