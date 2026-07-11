'use client'

// PROTOTYPE — floating variant switcher. Not part of any design being judged.

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export type VariantKey = 'A' | 'B' | 'C'
export const VARIANTS: readonly VariantKey[] = ['A', 'B', 'C']
export const VARIANT_NAMES: Record<VariantKey, string> = {
  A: 'Palette',
  B: 'Editorial',
  C: 'Ledger',
}

export function PrototypeSwitcher({ current }: { current: VariantKey }) {
  const router = useRouter()
  const go = (dir: number) => {
    const next =
      VARIANTS[(VARIANTS.indexOf(current) + dir + VARIANTS.length) % VARIANTS.length]
    router.replace(`/?variant=${next}`)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900/95 px-2 py-1.5 font-sans text-sm text-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
      <button
        type="button"
        onClick={() => go(-1)}
        className="rounded-full px-2.5 py-1 hover:bg-white/10"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="min-w-36 px-1 text-center text-xs">
        <span className="font-bold">{current}</span>
        <span className="text-neutral-400"> — {VARIANT_NAMES[current]}</span>
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="rounded-full px-2.5 py-1 hover:bg-white/10"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  )
}
