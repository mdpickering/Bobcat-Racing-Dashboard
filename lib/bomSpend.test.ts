import { describe, expect, it } from 'vitest'
import type { BomLine } from './bom'
import { spendIds } from './bom'
import { byVendor, bySeason, bySubsystem, groupSpend, largestPurchases, quoteSpend, seasonOrder, seasonSpan, spendLines, subsystemBySeason, summarizeSpend } from './bomSpend'

let n = 0
function line(over: Partial<BomLine> = {}): BomLine {
  n += 1
  return {
    id: `id-${n}`, subsystem: 'Drivetrain', sub_assembly: null, season: '2024-25', ordered_on: null, item: `Item ${n}`, part_number: null, vendor: 'McMaster-Carr',
    unit_cost: null, quantity: 1, total_cost: 10, link: null, original_link: null, record_type: 'Purchase list', members: null, notes: null, source_files: null,
    subsystem_basis: null, review_flag: null, review_status: 'open', review_note: null, reviewed_by: null, reviewed_at: null, sort_order: n, ...over,
  }
}

describe('spendLines / summarizeSpend', () => {
  const all = [
    line({ total_cost: 100 }),
    line({ total_cost: 50.5 }),
    line({ record_type: 'Quote', total_cost: 9000 }),
    line({ record_type: 'Planned BOM', total_cost: 5000 }),
    line({ record_type: 'CAD part list', total_cost: 200 }),
    line({ total_cost: null }),
  ]
  it('counts order-sheet lines and quotes, never plans or part lists', () => {
    expect(spendLines(all)).toHaveLength(3)
    expect(summarizeSpend(all).total).toBe(9150.5)
  })
  it('marks which counted lines came from a quote', () => {
    expect(spendLines(all).filter((l) => l.fromQuote)).toHaveLength(1)
  })
  it('says how many counted lines had no price, so the total is honest', () => {
    expect(summarizeSpend(all)).toEqual({ total: 9150.5, lines: 3, unpriced: 1 })
  })
  it('matches a quote against the whole BOM even when only one season is summed', () => {
    const order = line({ part_number: 'P1', vendor: 'V', season: '2024-25', total_cost: 100 })
    const quote = line({ record_type: 'Quote', part_number: 'P1', vendor: 'V', season: '2023-24', total_cost: 100 })
    const whole = [order, quote]
    const counted = spendIds(whole)
    expect(summarizeSpend([quote], counted).total).toBe(0)
    expect(spendLines(whole).filter((l) => l.season === '2023-24')).toHaveLength(0)
  })
  it('does not accumulate float noise', () => {
    expect(summarizeSpend([line({ total_cost: 0.1 }), line({ total_cost: 0.2 })]).total).toBe(0.3)
  })
  it('is zero with nothing', () => {
    expect(summarizeSpend([])).toEqual({ total: 0, lines: 0, unpriced: 0 })
  })
})

describe('quoteSpend', () => {
  it('reports the money that comes from quotes and the repeats it left out', () => {
    const q = quoteSpend([
      line({ part_number: 'R1', vendor: 'MD', total_cost: 10 }),
      line({ record_type: 'Quote', part_number: 'R1', vendor: 'MD', total_cost: 10 }),
      line({ record_type: 'Quote', part_number: 'R2', vendor: 'MD', total_cost: 40 }),
      line({ record_type: 'Quote', part_number: null, vendor: 'Alro', total_cost: 5.5 }),
    ])
    expect(q).toEqual({ lines: 2, total: 45.5, repeatedLines: 1, repeatedTotal: 10 })
  })
  it('is all zero with no quotes', () => {
    expect(quoteSpend([line()])).toEqual({ lines: 0, total: 0, repeatedLines: 0, repeatedTotal: 0 })
  })
})

describe('groupSpend', () => {
  const lines = spendLines([line({ subsystem: 'A', total_cost: 75 }), line({ subsystem: 'B', total_cost: 25 }), line({ subsystem: 'A', total_cost: 25 })])
  it('totals each group, biggest first, with its share of the whole', () => {
    const g = groupSpend(lines, (l) => l.subsystem)
    expect(g.map((x) => x.key)).toEqual(['A', 'B'])
    expect(g[0]).toMatchObject({ total: 100, lines: 2 })
    expect(g[0].share).toBeCloseTo(0.8)
    expect(g[1].share).toBeCloseTo(0.2)
  })
  it('shares add up to the whole', () => {
    expect(bySubsystem(lines).reduce((s, g) => s + g.share, 0)).toBeCloseTo(1)
  })
  it('has no shares when there is no spend', () => {
    expect(groupSpend([], (l) => l.subsystem)).toEqual([])
  })
})

describe('seasons', () => {
  it('orders oldest first with Undated last', () => {
    expect(['Undated', '2025-26', '2023-24', '2024-25'].sort(seasonOrder)).toEqual(['2023-24', '2024-25', '2025-26', 'Undated'])
  })
  it('groups spend by season in that order', () => {
    const ls = spendLines([line({ season: '2025-26', total_cost: 5 }), line({ season: 'Undated', total_cost: 1 }), line({ season: '2023-24', total_cost: 9 })])
    expect(bySeason(ls).map((g) => g.key)).toEqual(['2023-24', '2025-26', 'Undated'])
  })
  it('describes the span, ignoring Undated', () => {
    expect(seasonSpan(['2024-25', 'Undated', '2022-23', '2025-26'])).toBe('2022-23 to 2025-26')
    expect(seasonSpan(['2024-25'])).toBe('2024-25')
    expect(seasonSpan(['Undated'])).toBeNull()
    expect(seasonSpan([])).toBeNull()
  })
})

describe('byVendor', () => {
  const many = spendLines(Array.from({ length: 12 }, (_, i) => line({ vendor: `V${i}`, total_cost: 100 - i })))
  it('keeps the top vendors and folds the rest into one row that still adds up', () => {
    const v = byVendor(many, 10)
    expect(v).toHaveLength(11)
    expect(v[10].key).toBe('Other vendors (2)')
    expect(v.reduce((s, g) => s + g.total, 0)).toBeCloseTo(many.reduce((s, l) => s + l.total, 0))
  })
  it('shows everything when there are few vendors', () => {
    expect(byVendor(spendLines([line({ vendor: 'A' }), line({ vendor: 'B' })]), 10)).toHaveLength(2)
  })
  it('names a missing vendor plainly', () => {
    expect(byVendor(spendLines([line({ vendor: null })]))[0].key).toBe('No vendor listed')
  })
})

describe('subsystemBySeason', () => {
  const ls = spendLines([
    line({ subsystem: 'Drivetrain', season: '2024-25', total_cost: 100 }),
    line({ subsystem: 'Drivetrain', season: '2023-24', total_cost: 50 }),
    line({ subsystem: 'Brakes', season: '2024-25', total_cost: 30 }),
  ])
  it('gives each subsystem its spend per season, biggest subsystem first', () => {
    const m = subsystemBySeason(ls)
    expect(m.seasons).toEqual(['2023-24', '2024-25'])
    expect(m.rows.map((r) => r.subsystem)).toEqual(['Drivetrain', 'Brakes'])
    expect(m.rows[0]).toMatchObject({ total: 150, bySeason: { '2023-24': 50, '2024-25': 100 } })
  })
  it('totals each season', () => {
    expect(subsystemBySeason(ls).seasonTotals).toEqual({ '2023-24': 50, '2024-25': 130 })
  })
})

describe('largestPurchases', () => {
  it('returns the biggest lines first, limited', () => {
    const ls = spendLines([line({ total_cost: 5 }), line({ total_cost: 500 }), line({ total_cost: 50 })])
    expect(largestPurchases(ls, 2).map((l) => l.total)).toEqual([500, 50])
  })
})
