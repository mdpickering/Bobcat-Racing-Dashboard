import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPurchaseRequestById, listPurchaseRequestItems, listPurchaseStatusHistory } from '@/lib/supabase/queries/purchasing'
import { buildPurchaseSheet, purchaseSheetFileName } from '@/lib/purchaseSheet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Generates the purchase sheet on demand. Everything is read with the caller's own session, so
// row-level security decides what they can see (any approved user can view purchasing records);
// a request the caller cannot see is a plain 404. Nothing is stored anywhere.
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

    const [items, history] = await Promise.all([
      listPurchaseRequestItems(supabase, purchaseRequest.id),
      listPurchaseStatusHistory(supabase, purchaseRequest.id),
    ])
    const file = await buildPurchaseSheet(purchaseRequest, items, history)

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
