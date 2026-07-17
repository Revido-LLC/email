import { Link, createFileRoute } from '@tanstack/react-router'
import { Button, Card, CardContent, Input, Label, Sparkle, Textarea } from '@revido/ui'
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Sparkles } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { capture } from '@/lib/analytics'
import { useMe, useSubmitLead } from '@/lib/hooks'

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
  const { t } = useTranslation()
  const { data: me } = useMe()
  const submitLead = useSubmitLead()
  const [sent, setSent] = React.useState(false)
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    company: '',
    automate: '',
  })

  // Prefill name/email from the session, company from the email domain — without
  // clobbering anything the visitor already typed.
  React.useEffect(() => {
    if (!me) return
    setForm((f) => ({
      ...f,
      name: f.name || me.name,
      email: f.email || me.email,
      company: f.company || companyFromEmail(me.email),
    }))
  }, [me])

  const set =
    (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10 sm:px-6">
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">
              <ArrowLeft className="size-3.5" /> {t('talk.back')}
            </Link>
          </Button>
        </div>

        <header className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
            <Sparkles className="size-6" />
          </div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1 text-xs font-medium text-primary">
            <Sparkle className="text-primary" /> {t('talk.tag')}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('talk.title')}</h1>
          <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
            {t('talk.subtitle')}
          </p>
        </header>

        <Card className="shadow-soft">
          <CardContent className="p-6">
            {sent ? (
              <ThankYou name={form.name} />
            ) : (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  submitLead.mutate(form, {
                    onSuccess: () => {
                      // Content-free: the fact of a submit, never the field values.
                      capture('lead_submitted')
                      setSent(true)
                    },
                  })
                }}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('talk.form.name')} htmlFor="name">
                    <Input
                      id="name"
                      value={form.name}
                      onChange={set('name')}
                      placeholder={t('talk.form.namePlaceholder')}
                    />
                  </Field>
                  <Field label={t('talk.form.email')} htmlFor="email">
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder={t('talk.form.emailPlaceholder')}
                    />
                  </Field>
                </div>
                <Field label={t('talk.form.company')} htmlFor="company">
                  <Input
                    id="company"
                    value={form.company}
                    onChange={set('company')}
                    placeholder={t('talk.form.companyPlaceholder')}
                  />
                </Field>
                <Field label={t('talk.form.automate')} htmlFor="automate">
                  <Textarea
                    id="automate"
                    value={form.automate}
                    onChange={set('automate')}
                    className="min-h-28"
                    placeholder={t('talk.form.automatePlaceholder')}
                  />
                </Field>
                <Button type="submit" size="lg" className="w-full">
                  {t('talk.form.submit')} <ArrowRight className="size-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {t('talk.form.disclaimer')}
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <footer className="mt-auto pt-10 text-center">
          <p className="text-sm font-medium">{t('talk.footer.title')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('talk.footer.subtitle')}</p>
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
  const { t } = useTranslation()
  const first = name.split(' ')[0] || 'there'
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
        <Check className="size-7" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold">{t('talk.thankYou.title', { name: first })}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {t('talk.thankYou.message')}
        </p>
      </div>
      <Button asChild size="lg" className="mt-1">
        <a href="#">
          <CalendarCheck className="size-4" /> {t('talk.thankYou.book')}
        </a>
      </Button>
      <p className="text-2xs text-muted-foreground/70">{t('talk.thankYou.footer')}</p>
    </div>
  )
}
