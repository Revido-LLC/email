import { Link, createFileRoute } from '@tanstack/react-router'
import { USER } from '@revido/mock-data'
import { Button, Card, CardContent, Input, Label, Sparkle, Textarea } from '@revido/ui'
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Sparkles } from 'lucide-react'
import * as React from 'react'

export const Route = createFileRoute('/talk')({
  component: TalkScreen,
})

/** "brightfoundry.co" → "Brightfoundry" */
function companyFromEmail(email: string) {
  const domain = email.split('@')[1] ?? ''
  const stem = domain.split('.')[0] ?? ''
  if (!stem) return ''
  return stem.charAt(0).toUpperCase() + stem.slice(1)
}

function TalkScreen() {
  const [sent, setSent] = React.useState(false)
  const [form, setForm] = React.useState({
    name: USER.name,
    email: USER.email,
    company: companyFromEmail(USER.email),
    automate: '',
  })

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10 sm:px-6">
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">
              <ArrowLeft className="size-3.5" /> Back to Revido Mail
            </Link>
          </Button>
        </div>

        <header className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/30 via-accent/25 to-card shadow-soft">
            <Sparkles className="size-7 text-primary" />
          </div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1 text-xs font-medium text-primary">
            <Sparkle className="text-primary" /> Revido
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            We built this. We can build yours.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
            Revido Mail is one example of what we make. Tell us the busywork eating your team’s
            week, and we’ll build the AI tool that ends it.
          </p>
        </header>

        <Card className="shadow-pop">
          <CardContent className="p-6">
            {sent ? (
              <ThankYou name={form.name} />
            ) : (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  setSent(true)
                }}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="name">
                    <Input
                      id="name"
                      value={form.name}
                      onChange={set('name')}
                      placeholder="Your name"
                    />
                  </Field>
                  <Field label="Email" htmlFor="email">
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="you@company.com"
                    />
                  </Field>
                </div>
                <Field label="Company" htmlFor="company">
                  <Input
                    id="company"
                    value={form.company}
                    onChange={set('company')}
                    placeholder="Company"
                  />
                </Field>
                <Field label="What would you automate?" htmlFor="automate">
                  <Textarea
                    id="automate"
                    value={form.automate}
                    onChange={set('automate')}
                    className="min-h-28"
                    placeholder="e.g. Chase overdue invoices, triage support mail, draft proposals from a call…"
                  />
                </Field>
                <Button type="submit" size="lg" className="w-full">
                  Start the conversation <ArrowRight className="size-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  No pitch deck, no spam — a real reply from the people who build these.
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <footer className="mt-auto pt-10 text-center">
          <p className="text-sm font-medium">Built by Revido</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We build custom AI tools for companies.
          </p>
        </footer>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function ThankYou({ name }: { name: string }) {
  const first = name.split(' ')[0] || 'there'
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
        <Check className="size-7" />
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold">Thanks, {first}.</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          We’ll be in touch within one business day. Want to skip the wait? Grab a time and we’ll
          come prepared.
        </p>
      </div>
      <Button asChild size="lg" className="mt-1">
        <a href="#">
          <CalendarCheck className="size-4" /> Book a 20-minute call
        </a>
      </Button>
      <p className="text-2xs text-muted-foreground/70">
        Built by Revido · we build custom AI tools for companies
      </p>
    </div>
  )
}
