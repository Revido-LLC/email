import { Link, createFileRoute } from '@tanstack/react-router'
import { AiTag, Button, CATEGORY_CLASSES, Sparkle, cn, type CategoryToken } from '@revido/ui'
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  Code2,
  Lock,
  Mail,
  MessagesSquare,
  PenLine,
  ScanText,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Trans, useTranslation } from 'react-i18next'
import { OAuthButtons } from '@/components/landing/oauth-buttons'
import { LanguageToggle } from '@/components/language-toggle'
import { ProductMock } from '@/components/landing/product-mock'
import { capture } from '@/lib/analytics'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Privacy />
      </main>
      <Footer />
    </div>
  )
}

/* ---------------------------------------------------------------- Top bar */

function Wordmark() {
  const { t } = useTranslation()
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <Mail className="size-4" />
      </span>
      <span className="text-lg font-semibold tracking-tight">{t('common.brand')}</span>
    </Link>
  )
}

function TopBar() {
  const { t } = useTranslation()
  return (
    <header className="sticky top-0 z-40 glass-thin border-x-0 border-t-0">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-1">
          <LanguageToggle compact />
          <OAuthButtons size="sm" className="hidden sm:flex" />
          <Button asChild variant="primary" size="sm" className="sm:hidden">
            <Link to="/onboarding">{t('landing.topbar.getStarted')}</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

/* -------------------------------------------------------------------- Hero */

// Transform-only entrance: content stays fully visible even if the animation
// never runs (e.g. a background-tab load where rAF is throttled). Opacity is
// never gated on JS, so the hero is always readable.
const fadeUp = {
  initial: { y: 16 },
  animate: { y: 0 },
}

function Hero() {
  const { t } = useTranslation()
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-24">
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium shadow-soft">
            <Sparkle className="size-3.5" />
            {t('landing.hero.badge')}
          </div>

          <h1 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {t('landing.hero.titleLead')}
            <span className="text-accent">{t('landing.hero.titleAccent')}</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            {t('landing.hero.subtitle')}
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <OAuthButtons size="lg" stacked />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button asChild variant="ghost" size="sm">
                <Link to="/app" search={{ demo: true }}>
                  {t('landing.hero.seeItLive')} <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <span className="text-2xs">{t('landing.hero.noSignup')}</span>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <TrustPoint text={t('landing.hero.trust.free')} />
            <TrustPoint text={t('landing.hero.trust.noTraining')} />
            <TrustPoint text={t('landing.hero.trust.deleteAnytime')} />
          </div>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.12 }}
          className="lg:pl-6"
        >
          <ProductMock />
        </motion.div>
      </div>
    </section>
  )
}

function TrustPoint({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Check className="size-3.5 text-success" />
      {text}
    </span>
  )
}

/* ------------------------------------------------------------ How it works */

const STEPS = [
  { id: 'connect', icon: Mail },
  { id: 'read', icon: WandSparkles },
  { id: 'agents', icon: Bot },
] as const

function HowItWorks() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow={t('landing.howItWorks.eyebrow')}
          title={t('landing.howItWorks.title')}
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.id} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="text-lg font-semibold text-muted-foreground/40">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="text-lg font-semibold">
                {t(`landing.howItWorks.steps.${step.id}.title`)}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t(`landing.howItWorks.steps.${step.id}.copy`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Features */

const FEATURES: {
  token: CategoryToken
  icon: typeof Mail
  id: string
}[] = [
  { token: 'to-reply', icon: ScanText, id: 'triage' },
  { token: 'awaiting-reply', icon: PenLine, id: 'replies' },
  { token: 'newsletters', icon: Bot, id: 'agents' },
  { token: 'calendar', icon: MessagesSquare, id: 'chat' },
  { token: 'personal', icon: BellRing, id: 'reminders' },
  { token: 'receipts', icon: ShieldCheck, id: 'privacy' },
]

function FeatureCard({
  token,
  icon: Icon,
  id,
}: {
  token: CategoryToken
  icon: typeof Mail
  id: string
}) {
  const { t } = useTranslation()
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft transition-colors hover:border-border">
      <Sparkle className="absolute right-5 top-5 opacity-70" />
      <span
        className={cn(
          'mb-4 flex size-11 items-center justify-center rounded-2xl [&_svg]:size-5',
          CATEGORY_CLASSES[token].chip,
        )}
      >
        <Icon />
      </span>
      <h3 className="text-lg font-semibold">{t(`landing.features.items.${id}.title`)}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {t(`landing.features.items.${id}.copy`)}
      </p>
    </div>
  )
}

function Features() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow={t('landing.features.eyebrow')}
          title={t('landing.features.title')}
          subtitle={t('landing.features.subtitle')}
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.id} {...feature} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- Privacy */

const PRIVACY_POINTS = [
  { id: 'encryption', icon: Lock },
  { id: 'zeroRetention', icon: Sparkles },
  { id: 'openSource', icon: Code2 },
  { id: 'delete', icon: Trash2 },
] as const

function Privacy() {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-12">
          <div className="mx-auto max-w-2xl text-center">
            <AiTag label={t('landing.privacy.tag')} />
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('landing.privacy.title')}
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">{t('landing.privacy.subtitle')}</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {PRIVACY_POINTS.map((point) => (
              <div
                key={point.id}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card/70 p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cat-receipts/12 text-cat-receipts">
                  <point.icon className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    {t(`landing.privacy.points.${point.id}.title`)}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t(`landing.privacy.points.${point.id}.copy`)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ Footer */

function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="max-w-md">
            <Wordmark />
            <p className="mt-3 text-sm text-muted-foreground">
              <Trans
                i18nKey="landing.footer.about"
                components={{ strong: <span className="font-medium text-foreground" /> }}
              />
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button asChild variant="primary">
              <Link to="/talk" onClick={() => capture('landing_cta_clicked', { cta: 'talk' })}>
                {t('common.talkToRevido')} <ArrowRight className="size-4" />
              </Link>
            </Button>
            <span className="text-2xs text-muted-foreground/70">revido.co</span>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border/60 pt-6 text-2xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span>{t('landing.footer.copyright')}</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link to="/privacy" className="transition-colors hover:text-foreground">
              {t('landing.footer.privacy')}
            </Link>
            <Link to="/terms" className="transition-colors hover:text-foreground">
              {t('landing.footer.terms')}
            </Link>
            <span className="flex items-center gap-1.5">
              <Sparkle className="size-3" />
              {t('landing.footer.aiMarked')}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ------------------------------------------------------------------ Shared */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="max-w-2xl">
      <div className="mb-3 text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
        {eyebrow}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-3 text-lg text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
