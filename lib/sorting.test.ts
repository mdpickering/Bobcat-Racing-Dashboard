import { describe, expect, it } from 'vitest'
import { GENERAL_SUBSYSTEM_ID, encodeMove, isGeneralSubsystem, moveOptions, moveToPatch, parseMove, sortingMatches, type SortingCategory, type SortingSubsystem } from './sorting'

const categories: SortingCategory[] = [
  { id: 'c1', name: 'Gearbox', subsystem_id: 'drivetrain' },
  { id: 'c2', name: 'Chain', subsystem_id: 'drivetrain' },
  { id: 'c3', name: 'Knuckles', subsystem_id: 'suspension' },
]
const subsystems: SortingSubsystem[] = [
  { id: 'suspension', name: 'Suspension' },
  { id: 'drivetrain', name: 'Drivetrain' },
  { id: 'general', name: 'General' },
  { id: 'brakes', name: 'Brakes' },
]

describe('General subsystem', () => {
  it('is the one team-wide id', () => {
    expect(GENERAL_SUBSYSTEM_ID).toBe('general')
    expect(isGeneralSubsystem('general')).toBe(true)
    expect(isGeneralSubsystem('drivetrain')).toBe(false)
    expect(isGeneralSubsystem(null)).toBe(false)
  })
})

describe('encodeMove / parseMove', () => {
  it('round-trips both kinds', () => {
    expect(parseMove(encodeMove({ kind: 'category', id: 'c1' }))).toEqual({ kind: 'category', id: 'c1' })
    expect(parseMove(encodeMove({ kind: 'subsystem', id: 'general' }))).toEqual({ kind: 'subsystem', id: 'general' })
  })
  it('keeps colons inside an id', () => {
    expect(parseMove('category:a:b')).toEqual({ kind: 'category', id: 'a:b' })
  })
  it('refuses anything else', () => {
    expect(parseMove('')).toBeNull()
    expect(parseMove('category:')).toBeNull()
    expect(parseMove('team:x')).toBeNull()
    expect(parseMove('nocolon')).toBeNull()
  })
})

describe('moveToPatch', () => {
  it('a category move changes only the category', () => {
    expect(moveToPatch({ kind: 'category', id: 'c1' })).toEqual({ category_id: 'c1' })
  })
  it('a subsystem move also clears the category, which belonged to the old subsystem', () => {
    expect(moveToPatch({ kind: 'subsystem', id: 'general' })).toEqual({ subsystem_id: 'general', category_id: null })
  })
})

describe('moveOptions', () => {
  it('offers only the categories of the task\'s own subsystem, alphabetically', () => {
    const o = moveOptions({ subsystem_id: 'drivetrain' }, categories, subsystems, false)
    expect(o.categories.map((c) => c.label)).toEqual(['Chain', 'Gearbox'])
  })
  it('offers no subsystem moves unless the person may make them', () => {
    expect(moveOptions({ subsystem_id: 'drivetrain' }, categories, subsystems, false).subsystems).toEqual([])
  })
  it('lists every other subsystem for cto/admin with General first and the current one left out', () => {
    const o = moveOptions({ subsystem_id: 'drivetrain' }, categories, subsystems, true)
    expect(o.subsystems.map((s) => s.label)).toEqual(['General', 'Brakes', 'Suspension'])
  })
  it('does not change the lists it was given', () => {
    const subs = [...subsystems]
    moveOptions({ subsystem_id: 'drivetrain' }, categories, subs, true)
    expect(subs).toEqual(subsystems)
  })
  it('has no category options for a subsystem that has none', () => {
    expect(moveOptions({ subsystem_id: 'brakes' }, categories, subsystems, false).categories).toEqual([])
  })
})

describe('sortingMatches', () => {
  const t = { title: 'Order shop towels', subsystem: { id: 'x', name: 'Drivetrain' }, primary_owner: { id: 'u', display_name: 'Carter', email: 'c@x.edu', avatar_url: null } }
  it('matches everything on an empty query', () => {
    expect(sortingMatches(t, '  ')).toBe(true)
  })
  it('needs every word, across title, subsystem and owner', () => {
    expect(sortingMatches(t, 'towels drivetrain')).toBe(true)
    expect(sortingMatches(t, 'CARTER shop')).toBe(true)
    expect(sortingMatches(t, 'towels brakes')).toBe(false)
  })
  it('copes with no owner or subsystem', () => {
    expect(sortingMatches({ title: 'x', subsystem: undefined, primary_owner: null }, 'x')).toBe(true)
  })
})
