import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How the Rota demo handles searches and basic visit data.',
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 pt-20 pb-28 text-neutral-300 antialiased">
      <a className="text-xs text-neutral-500 hover:text-neutral-300" href="/">
        Back to Rota
      </a>
      <h1 className="mt-8 text-2xl font-medium text-neutral-100">Privacy</h1>
      <div className="mt-6 space-y-5 text-sm leading-7 text-neutral-400">
        <p>
          Rota sends natural-language searches to OpenAI to interpret them.
          Rota does not store your search text or create visitor profiles.
        </p>
        <p>
          OpenAI does not use API inputs or outputs to train its models by
          default. Its abuse-monitoring logs may include prompts and responses
          and are retained for up to 30 days, unless longer retention is
          required by law or for safety. Read the{' '}
          <a
            className="text-neutral-300 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-100"
            href="https://developers.openai.com/api/docs/guides/your-data"
          >
            OpenAI API data controls
          </a>
          .
        </p>
        <p>
          Vercel hosts the site and counts basic visits. On the Hobby plan,
          analytics have a one-month reporting window, though Vercel may retain
          data longer. Vercel may process request, device, approximate location,
          and network metadata under its{' '}
          <a
            className="text-neutral-300 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-100"
            href="https://vercel.com/legal/privacy-notice"
          >
            Vercel privacy notice
          </a>
          . Rota does not use advertising trackers.
        </p>
      </div>
    </main>
  )
}
