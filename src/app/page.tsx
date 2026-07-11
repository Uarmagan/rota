// PROTOTYPE — the home route currently hosts three throwaway UI variants
// (?variant=A|B|C, see src/app/_prototype/). The real M5 UI replaces all of it.

import { SearchPrototype } from './_prototype/search-prototype'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string | string[] }>
}) {
  const { variant } = await searchParams
  const key = variant === 'B' || variant === 'C' ? variant : 'A'
  return <SearchPrototype variant={key} />
}
