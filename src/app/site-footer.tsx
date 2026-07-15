export function SiteFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#0b0b0f] via-[#0b0b0f]/95 to-transparent px-5 pt-8 pb-3 text-center text-[10px] leading-relaxed text-neutral-600">
      <span>
        Simulated flights and fares. Rota is a demonstration, not a booking
        service.
      </span>{' '}
      <a
        className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-500"
        href="/privacy"
      >
        Privacy
      </a>
    </footer>
  )
}
