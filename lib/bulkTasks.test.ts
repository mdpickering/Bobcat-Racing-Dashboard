import { describe, expect, it } from 'vitest'
import { matchName, parseBulkTasks, parseSize, summarizeBulk, titleKey, type BulkCategory, type BulkSubsystem } from './bulkTasks'
import { COMPETITION_CHECKLIST, COMPETITION_CHECKLIST_TEXT } from './competitionChecklist'

const subsystems: BulkSubsystem[] = [
  { id: 'fabrication', name: 'Fabrication & Vehicle Integration' },
  { id: 'shielding-safety', name: 'Shielding & Cockpit Safety' },
  { id: 'pedals-driver-controls', name: 'Pedal Box & Driver Controls' },
  { id: 'sae-deliverables', name: 'SAE Deliverables & Costing' },
  { id: 'front-suspension', name: 'Front Suspension & Steering' },
  { id: 'rear-suspension-brakes', name: 'Rear Suspension & Rear Brakes' },
  { id: 'general', name: 'General' },
]
const categories: BulkCategory[] = [
  { id: 'c-tow', name: 'Safety Mounts & Tow Points', subsystem_id: 'fabrication' },
  { id: 'c-mounts', name: 'Component Mounts & Brackets', subsystem_id: 'fabrication' },
  { id: 'c-tabs', name: 'Double-Shear Tabs & Internal Sleeves', subsystem_id: 'fabrication' },
  { id: 'c-fire', name: 'Driver Firewall & Underbody Belly Pan', subsystem_id: 'shielding-safety' },
  { id: 'c-thr', name: 'Throttle Pedal & Cable Pull', subsystem_id: 'pedals-driver-controls' },
  { id: 'c-rcss', name: 'Roll Cage Spec Sheet (RCSS)', subsystem_id: 'sae-deliverables' },
]
const base = { subsystems, categories, allowedSubsystemIds: new Set(subsystems.map((s) => s.id)), existing: new Set<string>() }

describe('matchName', () => {
  it('matches exactly, ignoring case and punctuation', () => {
    expect(matchName('fabrication & vehicle integration', subsystems).match?.id).toBe('fabrication')
    expect(matchName('Fabrication and Vehicle Integration', subsystems).match?.id).toBe('fabrication')
  })
  it('accepts a short start or an unambiguous fragment', () => {
    expect(matchName('Fabrication', subsystems).match?.id).toBe('fabrication')
    expect(matchName('Cockpit', subsystems).match?.id).toBe('shielding-safety')
  })
  it('refuses an ambiguous fragment and says so', () => {
    const r = matchName('Suspension', subsystems)
    expect(r.match).toBeNull()
    expect(r.ambiguous).toBe(true)
  })
  it('finds nothing for nonsense or blank', () => {
    expect(matchName('Brakes Lab', subsystems).match).toBeNull()
    expect(matchName('  ', subsystems)).toEqual({ match: null, ambiguous: false })
  })
})

describe('parseSize', () => {
  it('accepts the three sizes in friendly spellings, and blank as "not on the board"', () => {
    expect(parseSize('quick')).toEqual({ size: 'quick', ok: true })
    expect(parseSize(' Short ')).toEqual({ size: 'short', ok: true })
    expect(parseSize('half day')).toEqual({ size: 'half_day', ok: true })
    expect(parseSize('Half-Day')).toEqual({ size: 'half_day', ok: true })
    expect(parseSize('')).toEqual({ size: null, ok: true })
  })
  it('refuses anything else', () => {
    expect(parseSize('huge').ok).toBe(false)
  })
})

describe('parseBulkTasks', () => {
  it('resolves subsystem, category, size and description', () => {
    const [r] = parseBulkTasks('Fabrication | Tow Points | Make the front tow hitch | short | Between the rails. | ok to include a pipe', base)
    expect(r.status).toBe('ok')
    expect(r.subsystemId).toBe('fabrication')
    expect(r.categoryId).toBe('c-tow')
    expect(r.size).toBe('short')
    expect(r.title).toBe('Make the front tow hitch')
    expect(r.description).toBe('Between the rails. | ok to include a pipe')
  })
  it('lets category and size be blank', () => {
    const [r] = parseBulkTasks('General | | Sweep the shop | |', base)
    expect(r.status).toBe('ok')
    expect(r.categoryId).toBeNull()
    expect(r.size).toBeNull()
  })
  it('skips blank lines and # comments, and numbers lines from 1', () => {
    const rows = parseBulkTasks('# a comment\n\nGeneral | | One | quick\n   \nGeneral | | Two | quick', base)
    expect(rows.map((r) => r.line)).toEqual([3, 5])
  })
  it('reports a clear error for each kind of mistake', () => {
    const rows = parseBulkTasks(
      ['just a title', 'Nowhere | | Title | quick', 'Fabrication | Wrong cat | Title | quick', 'Fabrication | | Title | huge', 'Fabrication | | | quick', 'Suspension | | Title | quick'].join('\n'),
      base
    )
    expect(rows.map((r) => r.status)).toEqual(['error', 'error', 'error', 'error', 'error', 'error'])
    expect(rows[0].message).toMatch(/Write it as/)
    expect(rows[1].message).toMatch(/No subsystem/)
    expect(rows[2].message).toMatch(/no category/)
    expect(rows[3].message).toMatch(/Size must be/)
    expect(rows[4].message).toMatch(/no title/)
    expect(rows[5].message).toMatch(/more than one subsystem/)
  })
  it('refuses a subsystem the person does not lead', () => {
    const [r] = parseBulkTasks('Fabrication | | Title | quick', { ...base, allowedSubsystemIds: new Set(['general']) })
    expect(r.status).toBe('error')
    expect(r.message).toMatch(/you lead/)
  })
  it('marks a title that already exists in the same subsystem as a duplicate, case-insensitively', () => {
    const existing = new Set([titleKey('fabrication', 'make the front tow hitch')])
    const [r] = parseBulkTasks('Fabrication | | Make  the Front Tow Hitch | short', { ...base, existing })
    expect(r.status).toBe('duplicate')
  })
  it('allows the same title in a different subsystem', () => {
    const existing = new Set([titleKey('fabrication', 'Weigh it')])
    const [r] = parseBulkTasks('General | | Weigh it | quick', { ...base, existing })
    expect(r.status).toBe('ok')
  })
  it('catches the same title twice in one paste', () => {
    const rows = parseBulkTasks('General | | Sweep | quick\nGeneral | | sweep | quick', base)
    expect(rows.map((r) => r.status)).toEqual(['ok', 'duplicate'])
  })
  it('summarizes the counts', () => {
    const rows = parseBulkTasks('General | | A | quick\nGeneral | | A | quick\nbad', base)
    expect(summarizeBulk(rows)).toEqual({ ok: 1, duplicate: 1, error: 1 })
  })
})

describe('competition checklist', () => {
  const rows = parseBulkTasks(COMPETITION_CHECKLIST_TEXT, base)
  it('has 22 tasks and every one parses cleanly against the real subsystem and category names', () => {
    expect(COMPETITION_CHECKLIST).toHaveLength(22)
    expect(rows).toHaveLength(22)
    expect(rows.filter((r) => r.status !== 'ok').map((r) => `${r.line}: ${r.message}`)).toEqual([])
  })
  it('puts every task on the pick-up board with a size', () => {
    expect(rows.every((r) => r.size !== null)).toBe(true)
  })
  it('gives every task a description with a rule reference', () => {
    expect(rows.every((r) => (r.description ?? '').length > 20)).toBe(true)
  })
  it('has no duplicate titles', () => {
    expect(new Set(rows.map((r) => r.title.toLowerCase())).size).toBe(22)
  })
})
