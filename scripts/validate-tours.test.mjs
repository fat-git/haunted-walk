import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { validateStopImages } from './validate-tours.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = readFileSync(join(ROOT, 'scripts', '__fixtures__', 'stop-photo.png'))

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'haunted-walk-validate-'))
}

function writeImage(dir, rel, content = FIXTURE) {
  const dirPath = join(dir, 'images')
  mkdirSync(dirPath, { recursive: true })
  return writeFileSync(join(dirPath, rel), content)
}

function stopWith(src) {
  return { id: 'st-louis-cemetery-no-1', images: [{ src }] }
}

describe('validateStopImages (build-time filesystem rules)', () => {
  it('accepts a stop with no images', () => {
    const errors = []
    validateStopImages({ id: 's' }, tempDir(), errors)
    expect(errors).toEqual([])
  })

  it('accepts a stop whose images is undefined', () => {
    const errors = []
    validateStopImages({ id: 's' }, tempDir(), errors)
    expect(errors).toEqual([])
  })

  it('accepts a valid, in-limit image', () => {
    const dir = tempDir()
    writeImage(dir, 'stop-1.png')
    const errors = []
    validateStopImages(stopWith('images/stop-1.png'), dir, errors)
    expect(errors).toEqual([])
  })

  it('rejects a referenced image that does not exist', () => {
    const errors = []
    validateStopImages(stopWith('images/missing.png'), tempDir(), errors)
    expect(errors.some((error) => error.includes('does not exist'))).toBe(true)
  })

  it('rejects an image over 150 KB', () => {
    const dir = tempDir()
    const big = Buffer.alloc(150 * 1024 + 1)
    writeImage(dir, 'big.jpg', big)
    const errors = []
    validateStopImages(stopWith('images/big.jpg'), dir, errors)
    expect(errors.some((error) => error.includes('over the 150 KB limit'))).toBe(true)
  })

  it('accepts an image exactly at 150 KB', () => {
    const dir = tempDir()
    const atLimit = Buffer.alloc(150 * 1024)
    writeImage(dir, 'atlimit.jpg', atLimit)
    const errors = []
    validateStopImages(stopWith('images/atlimit.jpg'), dir, errors)
    expect(errors).toEqual([])
  })

  it('rejects a disallowed extension', () => {
    const dir = tempDir()
    writeImage(dir, 'stop.gif')
    const errors = []
    validateStopImages(stopWith('images/stop.gif'), dir, errors)
    expect(errors.some((error) => error.includes('must use one of'))).toBe(true)
  })

  it('rejects an absolute path', () => {
    const errors = []
    validateStopImages(stopWith('/etc/passwd'), tempDir(), errors)
    expect(
      errors.some((error) => error.includes('relative path inside the tour folder')),
    ).toBe(true)
  })

  it('rejects a traversing path', () => {
    const errors = []
    validateStopImages(stopWith('../../etc/passwd'), tempDir(), errors)
    expect(
      errors.some((error) => error.includes('relative path inside the tour folder')),
    ).toBe(true)
  })
})
