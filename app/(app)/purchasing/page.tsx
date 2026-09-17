import ComingSoon from '@/components/layout/ComingSoon'
import { ShoppingCart } from 'lucide-react'

export default function PurchasingPage() {
  return (
    <ComingSoon
      icon={ShoppingCart}
      title="Purchasing"
      description="Multi-line purchase requests, vendor details, and approval workflow are built in the next application chunk."
    />
  )
}
