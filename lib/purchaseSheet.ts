import ExcelJS from 'exceljs'
import type { PurchaseRequest, PurchaseRequestItem, PurchaseStatusHistory } from '@/types/database'

const CURRENCY_FORMAT = '"$"#,##0.00'
const QUANTITY_FORMAT = '#,##0'
const NAVY = 'FF00205B'
const GOLD = 'FFB58500'
const LIGHT = 'FFEEF1F6'

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

function personName(p: { display_name: string | null; email: string | null } | null | undefined): string {
  return p?.display_name || p?.email || 'Unknown'
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }) + ' ET'
}

function approvalSummary(request: PurchaseRequest, history: PurchaseStatusHistory[]): string {
  if (!request.reviewed_at || !request.reviewer) return 'Not yet reviewed'
  const approved = history.some((h) => h.to_status === 'Approved')
  const rejected = history.some((h) => h.to_status === 'Rejected')
  const verb = approved ? 'Approved' : rejected ? 'Rejected' : 'Reviewed'
  return `${verb} by ${personName(request.reviewer)} on ${formatDateTime(request.reviewed_at)}`
}

// Builds a real .xlsx from a purchase request and its line items. Only fields that exist in the
// purchasing schema are included (no part number or urgency column exists, so none is invented).
// Generated on demand and returned to the caller; nothing is stored.
export async function buildPurchaseSheet(
  request: PurchaseRequest,
  items: PurchaseRequestItem[],
  history: PurchaseStatusHistory[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Bobcat Racing Dashboard'
  wb.created = new Date()
  const ws = wb.addWorksheet('Purchase Request', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  })

  ws.columns = [
    { key: 'item', width: 46 },
    { key: 'qty', width: 10 },
    { key: 'unit', width: 15 },
    { key: 'total', width: 15 },
    { key: 'link', width: 52 },
    { key: 'notes', width: 40 },
  ]

  // Title
  ws.mergeCells('A1:F1')
  const title = ws.getCell('A1')
  title.value = 'Bobcat Racing — Purchase Request'
  title.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30

  // Request details: label in A, value merged across B:F
  const details: [string, string][] = [
    ['Request ID', request.id],
    ['Title', request.title],
    ['Subsystem', request.subsystem?.name ?? request.subsystem_id],
    ['Requested by', personName(request.requester)],
    ['Requested on', formatDateTime(request.created_at)],
    ['Vendor', request.vendor ?? ''],
    ['Status', request.status],
    ['Approval', approvalSummary(request, history)],
    ['Description', request.description ?? ''],
  ]
  let row = 3
  for (const [label, value] of details) {
    const labelCell = ws.getCell(`A${row}`)
    labelCell.value = label
    labelCell.font = { bold: true, color: { argb: NAVY } }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    labelCell.alignment = { vertical: 'top' }
    ws.mergeCells(`B${row}:F${row}`)
    const valueCell = ws.getCell(`B${row}`)
    valueCell.value = value
    valueCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
    if (label === 'Description' || label === 'Title') {
      const lines = Math.max(1, Math.ceil(value.length / 110) + (value.split('\n').length - 1))
      ws.getRow(row).height = Math.min(15 * lines + 3, 200)
    }
    row++
  }

  // Line items table
  row += 1
  const headers = ['Item', 'Qty', 'Unit Price', 'Line Total', 'Product Link', 'Notes']
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: i === 1 || i === 2 || i === 3 ? 'right' : 'left' }
    cell.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
  })
  ws.getRow(row).height = 22
  row++

  const firstItemRow = row
  for (const item of items) {
    const r = ws.getRow(row)
    r.getCell(1).value = item.description
    r.getCell(2).value = item.quantity
    r.getCell(2).numFmt = QUANTITY_FORMAT
    if (item.unit_cost !== null) {
      r.getCell(3).value = Number(item.unit_cost)
      r.getCell(3).numFmt = CURRENCY_FORMAT
      r.getCell(4).value = { formula: `B${row}*C${row}`, result: Number(item.unit_cost) * item.quantity }
      r.getCell(4).numFmt = CURRENCY_FORMAT
    }
    if (item.link) {
      r.getCell(5).value = isHttpUrl(item.link) ? { text: item.link, hyperlink: item.link } : item.link
      r.getCell(5).font = { color: { argb: 'FF0563C1' }, underline: true }
    }
    r.getCell(6).value = item.notes ?? ''
    for (let c = 1; c <= 6; c++) {
      const cell = r.getCell(c)
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: c >= 2 && c <= 4 ? 'right' : 'left' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFD5DAE3' } } }
    }
    row++
  }
  const lastItemRow = row - 1

  // Total
  const total = items.reduce((sum, it) => sum + (it.unit_cost !== null ? Number(it.unit_cost) * it.quantity : 0), 0)
  const totalRow = ws.getRow(row)
  totalRow.getCell(3).value = 'Total'
  totalRow.getCell(3).font = { bold: true }
  totalRow.getCell(3).alignment = { horizontal: 'right' }
  totalRow.getCell(4).value =
    items.length > 0 ? { formula: `SUM(D${firstItemRow}:D${lastItemRow})`, result: total } : total
  totalRow.getCell(4).numFmt = CURRENCY_FORMAT
  totalRow.getCell(4).font = { bold: true }
  totalRow.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'double' } }
  if (items.some((it) => it.unit_cost === null)) {
    row++
    ws.getCell(`A${row}`).value = 'Total covers priced line items only; items without a unit price are not included.'
    ws.getCell(`A${row}`).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  }

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

export function purchaseSheetFileName(requestId: string): string {
  return `Purchase_Request_${requestId}.xlsx`
}
