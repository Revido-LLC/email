import { pgTable, text } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { vector } from './columns'

/** The mapping surface drizzle exposes on a built column. */
interface MappedColumn {
  getSQLType(): string
  mapToDriverValue(value: number[]): string
  mapFromDriverValue(value: string): number[]
}

/** Build a real table so the custom-type's driver mapping fns are reachable. */
const table = pgTable('probe', {
  id: text('id'),
  embedding: vector('embedding', { dimensions: 3 }),
})
const col = table.embedding as unknown as MappedColumn

describe('vector custom type', () => {
  it('emits the pgvector SQL type with the configured dimensions', () => {
    expect(col.getSQLType()).toBe('vector(3)')
  })

  it('serializes a number[] to the textual pgvector literal', () => {
    expect(col.mapToDriverValue([1, 2, 3])).toBe('[1,2,3]')
    expect(col.mapToDriverValue([])).toBe('[]')
    expect(col.mapToDriverValue([0.25, -1.5])).toBe('[0.25,-1.5]')
  })

  it('parses the textual pgvector literal back to number[]', () => {
    expect(col.mapFromDriverValue('[1,2,3]')).toEqual([1, 2, 3])
    expect(col.mapFromDriverValue('[]')).toEqual([]) // empty vector, no NaN entries
    expect(col.mapFromDriverValue('[0.5,-2]')).toEqual([0.5, -2])
  })

  it('round-trips a vector through to/from driver', () => {
    const v = [0.1, 0.2, 0.3]
    expect(col.mapFromDriverValue(col.mapToDriverValue(v))).toEqual(v)
  })
})
