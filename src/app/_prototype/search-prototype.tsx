'use client'

// PROTOTYPE — three wildly different search-UI variants on the home route,
// switchable via ?variant= and the floating bar (or ←/→ when the input isn't
// focused). Scripted fake data; the search state survives variant switches so
// the same moment can be compared across designs. Throwaway — do not build on.

import './prototype.css'
import { useFakeSearch } from './fake-search'
import { PrototypeSwitcher, type VariantKey } from './prototype-switcher'
import { VariantA } from './variant-a'
import { VariantB } from './variant-b'
import { VariantC } from './variant-c'

export function SearchPrototype({ variant }: { variant: VariantKey }) {
  const search = useFakeSearch()
  return (
    <>
      {variant === 'A' && <VariantA search={search} />}
      {variant === 'B' && <VariantB search={search} />}
      {variant === 'C' && <VariantC search={search} />}
      <PrototypeSwitcher current={variant} />
    </>
  )
}
