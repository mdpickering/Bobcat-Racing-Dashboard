import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPurchaseRequestById, listPurchaseRequestItems } from '@/lib/supabase/queries/purchasing'
import { buildPurchaseSheet, isExportableStatus, purchaseSheetFileName } from '@/lib/purchaseSheet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Generates the purchase sheet on demand from the business team's template. Everything is read with
// the caller's own session, so row-level security decides what they can see (any approved user can
// view purchasing records); a request the caller cannot see is a plain 404. Only an approved
// request (or one further along) can be exported. Nothing is stored anywhere.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  try {
    const purchaseRequest = await getPurchaseRequestById(supabase, params.id)
    if (!purchaseRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!isExportableStatus(purchaseRequest.status)) {
      return NextResponse.json({ error: `The purchase sheet is available once a request is approved (this one is ${purchaseRequest.status}).` }, { status: 409 })
    }

    const items = await listPurchaseRequestItems(supabase, purchaseRequest.id)
    const file = await buildPurchaseSheet(purchaseRequest, items)

    return new NextResponse(new Uint8Array(file), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${purchaseSheetFileName(purchaseRequest.id)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Could not generate the purchase sheet' }, { status: 500 })
  }
}
