import { describe, expect, it } from 'vitest'
import { bomMatches, formatOrderDate, groupByPart, kindOf, normalizeBomLine, partKey, safeHttpUrl, seasonOptions, summarizeBom, type BomLine } from './bom'

let n = 0
function line(over: Partial<BomLine> = {}): BomLine {
  n += 1
  return {
    id: `id-${n}`,
    subsystem: 'Drivetrain',
    sub_assembly: 'Gearbox',
    season: '2024-25',
    ordered_on: '2025-01-10',
    item: 'Ball bearing',
    part_number: '60355K691',
    vendor: 'McMaster-Carr',
    unit_cost: 11.18,
    quantity: 4,
    total_cost: 44.72,
    link: 'https://www.mcmaster.com/60355K691/',
    original_link: null,
    record_type: 'Purchase list',
    members: 'CG',
    notes: null,
    source_files: 'order.xlsx',
    subsystem_basis: 'From file',
    review_flag: null,
    sort_order: n,
    ...over,
  }
}

describe('kindOf', () => {
  it('treats only a purchase list as a purchase; quotes and the three plan types are not spend', () => {
    expect(kindOf(line({ record_type: 'Purchase list' }))).toBe('purchase')
    expect(kindOf(line({ record_type: 'Quote' }))).toBe('quote')
    for (const t of ['Planned BOM', 'Team master BOM', 'CAD part list'] as const) expect(kindOf(line({ record_type: t }))).toBe('plan')
  })
})

describe('bomMatches', () => {
  const l = line({ item: 'Ball bearing 1/2" shaft', vendor: 'McMaster-Carr', notes: 'Need 4 PCS', sub_assembly: 'Chain Tensioner', members: 'Carter' })
  it('matches everything on an empty query', () => {
    expect(bomMatches(l, '')).toBe(true)
    expect(bomMatches(l, '   ')).toBe(true)
  })
  it('requires every word, in any field, case-insensitively', () => {
    expect(bomMatches(l, 'BEARING mcmaster')).toBe(true)
    expect(bomMatches(l, 'tensioner carter')).toBe(true)
    expect(bomMatches(l, 'bearing grainger')).toBe(false)
  })
  it('matches a part number', () => {
    expect(bomMatches(l, '60355k691')).toBe(true)
  })
  it('does not trip on null fields', () => {
    expect(bomMatches(line({ part_number: null, vendor: null, notes: null, sub_assembly: null, members: null }), 'ball')).toBe(true)
  })
})

describe('summarizeBom', () => {
  it('counts spend on purchase lists only, quotes separately, and ignores plans', () => {
    const s = summarizeBom([
      line({ total_cost: 100 }),
      line({ total_cost: 50.5, part_number: 'A' }),
      line({ record_type: 'Quote', total_cost: 900, part_number: 'B' }),
      line({ record_type: 'Planned BOM', total_cost: 5000, part_number: 'C' }),
      line({ total_cost: null, part_number: 'D' }),
    ])
    expect(s.purchaseTotal).toBe(150.5)
    expect(s.quoteTotal).toBe(900)
    expect(s.lines).toBe(5)
  })
  it('counts distinct parts and flagged lines', () => {
    const s = summarizeBom([line({ part_number: 'X' }), line({ part_number: 'x' }), line({ part_number: null, item: 'Zip tie' }), line({ part_number: null, item: 'zip tie ', review_flag: 'check me' })])
    expect(s.distinctParts).toBe(2)
    expect(s.needsReview).toBe(1)
  })
  it('does not accumulate float noise', () => {
    expect(summarizeBom([line({ total_cost: 0.1 }), line({ total_cost: 0.2, part_number: 'Z' })]).purchaseTotal).toBe(0.3)
  })
})

describe('partKey', () => {
  it('is case/space-insensitive on the part number and falls back to the item name', () => {
    expect(partKey({ part_number: ' ABC1 ', item: 'x' })).toBe(partKey({ part_number: 'abc1', item: 'y' }))
    expect(partKey({ part_number: null, item: 'Zip Tie' })).toBe(partKey({ part_number: '  ', item: ' zip tie' }))
    expect(partKey({ part_number: null, item: 'a' })).not.toBe(partKey({ part_number: 'a', item: 'a' }))
  })
})

describe('groupByPart', () => {
  it('collapses repeat orders of one part and totals only purchased units', () => {
    const parts = groupByPart([
      line({ part_number: '98541A134', item: 'Snap ring', ordered_on: '2024-09-09', quantity: 2, unit_cost: 4.71 }),
      line({ part_number: '98541A134', item: 'Snap ring', ordered_on: '2024-09-12', quantity: 2, unit_cost: 4.71 }),
      line({ part_number: '98541A134', item: 'Snap ring', record_type: 'Quote', ordered_on: '2025-06-01', quantity: 10, unit_cost: 9 }),
    ])
    expect(parts).toHaveLength(1)
    expect(parts[0].lineCount).toBe(3)
    expect(parts[0].orderedQuantity).toBe(4)
    expect(parts[0].kinds.sort()).toEqual(['purchase', 'quote'])
  })
  it('reports the most recent PURCHASE cost, not a newer quote', () => {
    const [p] = groupByPart([
      line({ part_number: 'P1', ordered_on: '2024-01-01', unit_cost: 5 }),
      line({ part_number: 'P1', ordered_on: '2025-01-01', unit_cost: 6 }),
      line({ part_number: 'P1', ordered_on: '2026-01-01', unit_cost: 99, record_type: 'Quote' }),
    ])
    expect(p.latestUnitCost).toBe(6)
  })
  it('falls back to a quote cost when nothing was purchased, and to null with no cost at all', () => {
    expect(groupByPart([line({ part_number: 'Q', record_type: 'Quote', unit_cost: 12 })])[0].latestUnitCost).toBe(12)
    expect(groupByPart([line({ part_number: 'N', unit_cost: null })])[0].latestUnitCost).toBeNull()
  })
  it('unions subsystems, vendors and seasons, with Undated first in season order', () => {
    const [p] = groupByPart([
      line({ part_number: 'U', subsystem: 'Drivetrain', vendor: 'Amazon', season: '2025-26' }),
      line({ part_number: 'U', subsystem: 'Suspension', vendor: 'McMaster-Carr', season: '2023-24' }),
      line({ part_number: 'U', subsystem: 'Drivetrain', vendor: null, season: 'Undated' }),
    ])
    expect(p.subsystems).toEqual(['Drivetrain', 'Suspension'])
    expect(p.vendors).toEqual(['Amazon', 'McMaster-Carr'])
    expect(p.seasons).toEqual(['Undated', '2023-24', '2025-26'])
  })
  it('groups unnumbered lines by item name and flags a part when any line is flagged', () => {
    const parts = groupByPart([
      line({ part_number: null, item: 'Zip tie' }),
      line({ part_number: null, item: 'zip tie', review_flag: 'duplicate?' }),
      line({ part_number: null, item: 'Washer' }),
    ])
    expect(parts.map((p) => p.item)).toEqual(['Washer', 'zip tie'].sort((a, b) => a.localeCompare(b)))
    expect(parts.find((p) => p.lineCount === 2)?.flagged).toBe(true)
  })
})

describe('safeHttpUrl', () => {
  it('lets http(s) through and refuses anything else', () => {
    expect(safeHttpUrl('https://www.mcmaster.com/1/')).toBe('https://www.mcmaster.com/1/')
    expect(safeHttpUrl('http://x.com')).toBe('http://x.com')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,hi')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})

describe('formatOrderDate', () => {
  it('shows the calendar date as stored, never a day early', () => {
    expect(formatOrderDate('2026-03-04')).toBe('Mar 4, 2026')
    expect(formatOrderDate('2025-01-01')).toBe('Jan 1, 2025')
    expect(formatOrderDate('2026-03-04T00:00:00+00:00')).toBe('Mar 4, 2026')
  })
  it('shows a dash for blank or malformed values', () => {
    expect(formatOrderDate(null)).toBe('—')
    expect(formatOrderDate('')).toBe('—')
    expect(formatOrderDate('March')).toBe('—')
  })
})

describe('seasonOptions', () => {
  it('lists seasons newest first with Undated last', () => {
    expect(seasonOptions([{ season: '2023-24' }, { season: 'Undated' }, { season: '2025-26' }, { season: '2023-24' }, { season: '2024-25' }])).toEqual(['2025-26', '2024-25', '2023-24', 'Undated'])
  })
})

describe('normalizeBomLine', () => {
  it('turns Postgres numeric strings into numbers and keeps blanks null', () => {
    const raw = { ...line(), unit_cost: '11.18' as unknown as number, total_cost: null, quantity: '4' as unknown as number }
    const out = normalizeBomLine(raw)
    expect(out.unit_cost).toBe(11.18)
    expect(out.quantity).toBe(4)
    expect(out.total_cost).toBeNull()
  })
})
