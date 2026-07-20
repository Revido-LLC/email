import { Link } from '@tanstack/react-router'
import { Button, Sparkle, cn } from '@revido/ui'
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { LanguageToggle } from '@/components/language-toggle'

export interface LegalSection {
  id: string
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export interface LegalPageCopy {
  eyebrow: string
  title: string
  introduction: string
  updated: string
  contents: string
  back: string
  promises: { value: string; label: string }[]
  sections: LegalSection[]
}

export function LegalPage({ copy }: { copy: LegalPageCopy }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass-thin sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <Mail className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">Revido Mail</span>
          </Link>
          <LanguageToggle compact />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Button asChild variant="ghost" size="sm" className="mb-8">
          <Link to="/">
            <ArrowLeft className="size-3.5" /> {copy.back}
          </Link>
        </Button>

        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-2xs font-semibold uppercase tracking-widest text-primary">
            <ShieldCheck className="size-4" />
            {copy.eyebrow}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{copy.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{copy.introduction}</p>
          <p className="mt-4 text-xs text-muted-foreground">{copy.updated}</p>
        </div>

        <div className="mt-10 grid overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:grid-cols-3">
          {copy.promises.map((promise, index) => (
            <div
              key={promise.label}
              className={cn('p-5', index > 0 && 'border-t border-border sm:border-l sm:border-t-0')}
            >
              <div className="text-xl font-semibold tracking-tight text-primary">
                {promise.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{promise.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-4">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
              {copy.contents}
            </div>
            <nav className="mt-3 flex flex-col gap-1 border-l border-border pl-3">
              {copy.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="min-w-0 max-w-3xl lg:col-span-3">
            {copy.sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className={cn('scroll-mt-28 py-8', index > 0 && 'border-t border-border')}
              >
                <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground">
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets && (
                    <ul className="space-y-2 pl-5">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="list-disc pl-1">
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <Sparkle className="size-3.5" />
          Revido Mail · email.revido.co
        </div>
      </footer>
    </div>
  )
}
