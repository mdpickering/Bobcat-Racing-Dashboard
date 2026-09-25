import ExcelJS from 'exceljs'
import { PURCHASE_TEMPLATE_BASE64 } from './templateData'
import { CELL_PADDING, displayUrl, excelDate, fitWidth, initials, textUnits, vendorName, wrappedLineCount } from './format'
import type { PurchaseRequest, PurchaseRequestItem } from '@/types/database'

export { EXPORTABLE_STATUSES, isExportableStatus, purchaseSheetFileName } from './format'

const LINE_HEIGHT = 15.75
const MAX_ROW_HEIGHT = 300
const QUANTITY_FORMAT = '#,##0'
const DATE_FORMAT = 'm/d/yyyy'

type Align = 'left' | 'center'

interface ColumnSpec {
  header: string
  // Template columns (A..J) take their look from the template's style row. `templateIndex` is that
  // column's position in the template; the Date column has none and borrows Member Responsible's look.
  templateIndex: number
  min: number
  max: number
  align: Align
  wrap: boolean
  numFmt?: string
}

// Column order and header text are exactly the business team's purchase sheet (plus Date at the end).
// `min` is each column's starting width (the plain template's header-fit widths); `max` keeps a very
// long name, note or URL from stretching the sheet.
const COLUMNS: ColumnSpec[] = [
  { header: 'Vendor', templateIndex: 0, min: 12, max: 26, align: 'left', wrap: true },
  { header: 'Item(s)', templateIndex: 1, min: 28.7, max: 55, align: 'left', wrap: true },
  { header: 'Part #', templateIndex: 2, min: 13.6, max: 26, align: 'center', wrap: true },
  { header: 'Unit Cost ($)', templateIndex: 3, min: 14.1, max: 18, align: 'center', wrap: false },
  { header: 'Quantity', templateIndex: 4, min: 9.3, max: 12, align: 'center', wrap: false, numFmt: QUANTITY_FORMAT },
  { header: 'Total Cost ($)', templateIndex: 5, min: 13.6, max: 18, align: 'center', wrap: false },
  { header: 'Web Link', templateIndex: 6, min: 21.4, max: 50, align: 'center', wrap: false },
  { header: 'Subassembly', templateIndex: 7, min: 13.1, max: 28, align: 'center', wrap: true },
  { header: 'Notes', templateIndex: 8, min: 9, max: 50, align: 'left', wrap: true },
  { header: 'Member Responsible', templateIndex: 9, min: 20.9, max: 24, align: 'center', wrap: true },
  { header: 'Date', templateIndex: 9, min: 10.6, max: 14, align: 'center', wrap: false, numFmt: DATE_FORMAT },
]

const money = (n: number) => Math.round(n * 100) / 100

async function loadTemplate(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(PURCHASE_TEMPLATE_BASE64, 'base64') as unknown as ArrayBuffer)
  return wb
}

interface RowValues {
  cells: (string | number | Date | null)[]
  url: string | null
  unit: number | null
  qty: number
}

function rowFor(request: PurchaseRequest, item: PurchaseRequestItem): RowValues {
  const unit = item.unit_cost === null || item.unit_cost === undefined ? null : Number(item.unit_cost)
  return {
    unit,
    qty: item.quantity,
    url: item.link?.trim() || null,
    cells: [
      vendorName(request.vendor, item.link),
      item.description,
      item.part_number ?? '',
      unit,
      item.quantity,
      null, // Total Cost: a formula, set below
      item.link ? displayUrl(item.link) : '',
      item.subassembly?.trim() || request.subsystem?.name || '',
      item.notes ?? '',
      initials(request.requester?.display_name, request.requester?.email),
      excelDate(request.created_at),
    ],
  }
}

// Fills the business team's purchase sheet (the template, loaded fresh every time — the template itself is
// never modified) with one row per line item, then sizes the columns and rows to the content.
export async function buildPurchaseSheet(request: PurchaseRequest, items: PurchaseRequestItem[]): Promise<Buffer> {
  const wb = await loadTemplate()
  const ws = wb.worksheets[0]

  // the template's style row, captured before it is overwritten
  const sampleStyles = COLUMNS.map((c) => JSON.parse(JSON.stringify(ws.getRow(2).getCell(c.templateIndex + 1).style)) as Partial<ExcelJS.Style>)
  const headerStyle = JSON.parse(JSON.stringify(ws.getCell('A1').style)) as Partial<ExcelJS.Style>
  const currencyFormat = ws.getRow(2).getCell(6).numFmt

  const rows = items.map((item) => rowFor(request, item))

  // header row
  COLUMNS.forEach((col, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = col.header
    cell.style = headerStyle
  })

  // body rows
  rows.forEach((row, r) => {
    const rowNumber = r + 2
    COLUMNS.forEach((col, i) => {
      const cell = ws.getCell(rowNumber, i + 1)
      const value = row.cells[i]

      if (col.header === 'Total Cost ($)') {
        if (row.unit !== null) cell.value = { formula: `D${rowNumber}*E${rowNumber}`, result: money(row.unit * row.qty) }
      } else if (col.header === 'Web Link' && row.url) {
        cell.value = { text: String(value), hyperlink: row.url }
      } else if (value !== null && value !== '') {
        cell.value = value
      }

      const numFmt = col.header === 'Unit Cost ($)' || col.header === 'Total Cost ($)' ? currencyFormat : col.numFmt
      cell.style = {
        ...sampleStyles[i],
        ...(numFmt ? { numFmt } : {}),
        alignment: { horizontal: col.align, vertical: 'middle', wrapText: col.wrap },
      }
    })
  })

  // column widths: start at the column's minimum, grow to the content, never past the maximum
  const widths = COLUMNS.map((col, i) => {
    const shown = rows.map((row) => {
      const v = row.cells[i]
      if (v === null || v instanceof Date) return ''
      return typeof v === 'number' ? v.toFixed(2) : String(v)
    })
    const headerUnits = textUnits(col.header, true) + CELL_PADDING
    if (col.header === 'Date' || col.header === 'Quantity') return Math.max(col.min, headerUnits)
    return fitWidth(shown, col.min, col.max, headerUnits)
  })
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = Math.round(w * 100) / 100
  })

  // row heights: one line, or as many as the wrapped text needs
  rows.forEach((row, r) => {
    let lines = 1
    COLUMNS.forEach((col, i) => {
      const v = row.cells[i]
      if (!col.wrap || typeof v !== 'string' || v === '') return
      lines = Math.max(lines, wrappedLineCount(v, widths[i]))
    })
    ws.getRow(r + 2).height = Math.min(LINE_HEIGHT * lines, MAX_ROW_HEIGHT)
  })
  ws.getRow(1).height = LINE_HEIGHT

  wb.creator = 'Bobcat Racing Dashboard'
  wb.lastModifiedBy = 'Bobcat Racing Dashboard'
  wb.title = `Purchase request ${request.title}`
  wb.description = `Purchase request ${request.id}`
  wb.created = new Date()
  wb.modified = new Date()

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}
