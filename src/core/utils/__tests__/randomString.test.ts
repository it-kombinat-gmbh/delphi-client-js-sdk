import { describe, expect, test } from 'vitest'

import { randomString } from '../index'

describe('randomString', () => {
    test('returns a string of the requested length', () => {
        expect(randomString(8)).toHaveLength(8)
        expect(randomString(16)).toHaveLength(16)
    })

    test('only contains alphanumeric characters', () => {
        const value = randomString(32)
        expect(value).toMatch(/^[A-Za-z0-9]+$/)
    })

    test('returns different values on subsequent calls', () => {
        const values = Array.from({ length: 20 }, () => randomString(16))
        expect(new Set(values).size).toBe(values.length)
    })

    test('handles length zero', () => {
        expect(randomString(0)).toBe('')
    })
})
