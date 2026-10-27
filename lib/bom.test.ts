import { describe, expect, it } from 'vitest'
import { attachCosts, bomMatches, canSeeBomCosts, flagSeverity, formatOrderDate, groupByPart, kindOf, needsCheck, normalizeBomLine, partKey, safeHttpUrl, seasonOptions, summarizeBom, type BomLine } from './bom'

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
    review_status: 'open',
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    sort_order: n,
    ...over,
  }
}

const CHECK = 'Similar plates are on the 2024-05-28 Metals Depot quote. Confirm which vendor was ordered'

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
    const s = summarizeBom([line({ part_number: 'X' }), line({ part_number: 'x' }), line({ part_number: null, item: 'Zip tie' }), line({ part_number: null, item: 'zip tie ', review_flag: CHECK })])
    expect(s.distinctParts).toBe(2)
    expect(s.needsReview).toBe(1)
  })
  it('only counts real open questions as needing a check, not housekeeping notes or reviewed lines', () => {
    const s = summarizeBom([
      line({ review_flag: CHECK }),
      line({ review_flag: CHECK, review_status: 'checked' }),
      line({ review_flag: CHECK, review_status: 'ignored' }),
      line({ review_flag: 'Date from file name' }),
      line({ review_flag: 'Link: Built from part # (original was a category/search page)' }),
    ])
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
      line({ part_number: null, item: 'zip tie', review_flag: CHECK }),
      line({ part_number: null, item: 'Washer' }),
    ])
    expect(parts.map((p) => p.item)).toEqual(['Washer', 'zip tie'].sort((a, b) => a.localeCompare(b)))
    expect(parts.find((p) => p.lineCount === 2)?.flagged).toBe(true)
  })
})

describe('flagSeverity', () => {
  it('has no severity without a flag', () => {
    expect(flagSeverity(null)).toBeNull()
    expect(flagSeverity('')).toBeNull()
    expect(flagSeverity('   ')).toBeNull()
  })
  it.each([
    'Same part/qty/price also ordered on 2025-02-18: reorder or repeated entry?',
    'Similar plates are on the 2024-05-28 Metals Depot quote and the compiled 23-24 sheet. Confirm which vendor was ordered',
    'Prices match the 2024-05-28 Metals Depot quote; a cheaper Yarde quote (2024-09-17) covers similar plates. Confirm which was ordered',
    'Compiled 24-25 sheet lists 1.25" tube and QA1 rod ends for the same A-arms. Confirm which set is on the car',
    'Link goes to part 6677K86 but sheet says 6677K55; check which is right',
    'Vendor listed as McMaster-Carr but link goes to Grainger',
    'Date from file name; No subassembly given; assign a subsystem',
    'Could be drivetrain or steering shaft',
    'File name year (23) conflicts with quote date (2024)',
  ])('treats a real question as a check: %s', (flag) => {
    expect(flagSeverity(flag)).toBe('check')
  })
  it.each([
    'Link: Built from part # (original was a category/search page)',
    'Link: Missing',
    'Quote only: no record it was ordered; Link: Missing',
    'Undated source: season unknown',
    'Date from file name',
    'Date from file name; year assumed 2026',
    'Date in May-Aug: season assigned by Aug 1 cutoff',
    'Quote status PENDING: no record it was paid; Link: Vendor home page only',
    'Subassembly in file: Hardware',
    'No price in source',
    'Exact date from 24-25_Purchase_Orders_Compiled.xlsx',
  ])('treats housekeeping as a quiet note: %s', (flag) => {
    expect(flagSeverity(flag)).toBe('note')
  })
})

describe('needsCheck', () => {
  it('is true only for an open line with a real question', () => {
    expect(needsCheck(line({ review_flag: CHECK }))).toBe(true)
    expect(needsCheck(line({ review_flag: CHECK, review_status: 'checked' }))).toBe(false)
    expect(needsCheck(line({ review_flag: 'Date from file name' }))).toBe(false)
    expect(needsCheck(line())).toBe(false)
  })
})

describe('attachCosts', () => {
  it('sets prices from the costs table, as numbers', () => {
    const a = line({ unit_cost: null, total_cost: null })
    const [out] = attachCosts([a], [{ line_id: a.id, unit_cost: '11.18', total_cost: 44.72 }])
    expect(out.unit_cost).toBe(11.18)
    expect(out.total_cost).toBe(44.72)
  })
  it('leaves a line without a cost row priceless, even if it carried a price before', () => {
    const a = line({ unit_cost: 99, total_cost: 99 })
    const [out] = attachCosts([a], [])
    expect(out.unit_cost).toBeNull()
    expect(out.total_cost).toBeNull()
  })
  it('keeps a missing half of a cost row null rather than 0', () => {
    const a = line()
    const [out] = attachCosts([a], [{ line_id: a.id, unit_cost: null, total_cost: 5 }])
    expect(out.unit_cost).toBeNull()
    expect(out.total_cost).toBe(5)
  })
})

describe('canSeeBomCosts', () => {
  it('allows Business members and cto/admin only', () => {
    expect(canSeeBomCosts({ isBusinessMember: true, isCtoOrAdmin: false })).toBe(true)
    expect(canSeeBomCosts({ isBusinessMember: false, isCtoOrAdmin: true })).toBe(true)
    expect(canSeeBomCosts({ isBusinessMember: false, isCtoOrAdmin: false })).toBe(false)
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
