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
import { OAuthButtons } from '@/components/landing/oauth-buttons'
import { ProductMock } from '@/components/landing/product-mock'

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
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-soft">
        <Mail className="size-4" />
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">Revido Mail</span>
    </Link>
  )
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Wordmark />
        <OAuthButtons size="sm" className="hidden sm:flex" />
        <Button asChild variant="primary" size="sm" className="sm:hidden">
          <Link to="/onboarding">Get started</Link>
        </Button>
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
  return (
    <section className="relative overflow-hidden">
      {/* Warm decorative wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -right-24 top-12 size-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-80 rounded-full bg-ai/10 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:py-24">
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium shadow-soft">
            <Sparkle className="size-3.5" />
            AI-first email — free forever
          </div>

          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Your inbox,{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              handled.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            A free, AI-first email client that triages your inbox, drafts replies in your voice, and
            runs agents on the busywork — so you only see what needs you.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <OAuthButtons size="lg" stacked />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button asChild variant="ghost" size="sm">
                <Link to="/app">
                  See it live <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <span className="text-2xs">No signup needed to explore the demo</span>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <TrustPoint text="Free" />
            <TrustPoint text="Your mail never trains AI models" />
            <TrustPoint text="Delete everything anytime" />
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
  {
    icon: Mail,
    title: 'Connect your inbox',
    copy: 'Sign in with Google or Microsoft. One tap, read-only to start — nothing leaves your control.',
  },
  {
    icon: WandSparkles,
    title: 'We read & triage',
    copy: 'In about 30 seconds, every thread is summarized, sorted, and scored — the noise falls away.',
  },
  {
    icon: Bot,
    title: 'Agents handle the rest',
    copy: 'Draft replies, chase no-answers, file receipts, bundle newsletters — you just approve.',
  },
] as const

function HowItWorks() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading eyebrow="How it works" title="From chaos to calm in about a minute." />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="font-display text-2xl font-semibold text-muted-foreground/40">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.copy}</p>
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
  title: string
  copy: string
}[] = [
  {
    token: 'to-reply',
    icon: ScanText,
    title: 'Smart triage',
    copy: 'Every thread gets a one-line TL;DR, a category, and a priority score. Open your inbox already sorted.',
  },
  {
    token: 'awaiting-reply',
    icon: PenLine,
    title: 'Replies in your voice',
    copy: 'Drafts that actually sound like you — tone, phrasing, and sign-off learned from your sent mail.',
  },
  {
    token: 'newsletters',
    icon: Bot,
    title: 'Inbox agents',
    copy: 'Set-and-forget agents unsubscribe, chase no-replies, file invoices, and bundle the noise.',
  },
  {
    token: 'calendar',
    icon: MessagesSquare,
    title: 'Chat with your inbox',
    copy: 'Ask “what did I promise Priya?” or “find that $48k proposal.” Answers, with the receipts.',
  },
  {
    token: 'personal',
    icon: BellRing,
    title: 'Proactive reminders',
    copy: 'It remembers the promises you made and the replies you’re still waiting on — before they slip.',
  },
  {
    token: 'receipts',
    icon: ShieldCheck,
    title: 'Privacy-first',
    copy: 'Encrypted per user, zero-retention AI, open source. Your mail is yours — always.',
  },
]

function FeatureCard({
  token,
  icon: Icon,
  title,
  copy,
}: {
  token: CategoryToken
  icon: typeof Mail
  title: string
  copy: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-pop">
      <Sparkle className="absolute right-5 top-5 opacity-70" />
      <span
        className={cn(
          'mb-4 flex size-11 items-center justify-center rounded-2xl [&_svg]:size-5',
          CATEGORY_CLASSES[token].chip,
        )}
      >
        <Icon />
      </span>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{copy}</p>
    </div>
  )
}

function Features() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="What you get"
          title="A calmer inbox, powered by agents."
          subtitle="Consumer-warm on the surface, pro-tool fast underneath — every AI touch is marked with a sparkle."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- Privacy */

const PRIVACY_POINTS = [
  {
    icon: Lock,
    title: 'Per-user encryption at rest',
    copy: 'Every mailbox is encrypted with its own key. Even we can’t browse your inbox.',
  },
  {
    icon: Sparkles,
    title: 'Zero-retention AI',
    copy: 'Models summarize and draft in the moment, then forget. Your mail never trains anything.',
  },
  {
    icon: Code2,
    title: 'Open source',
    copy: 'Don’t trust us — read the code. The whole client is out in the open.',
  },
  {
    icon: Trash2,
    title: 'Delete everything, anytime',
    copy: 'One button, provable purge. Disconnect and your data is gone for good.',
  },
] as const

function Privacy() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-accent/10 to-card p-6 shadow-soft sm:p-12">
          <div className="mx-auto max-w-2xl text-center">
            <AiTag label="Privacy" />
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Nobody reads your email.
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Not us. Not our models. Not anyone. Trust is the whole product.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {PRIVACY_POINTS.map((point) => (
              <div
                key={point.title}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card/70 p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cat-receipts/12 text-cat-receipts">
                  <point.icon className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{point.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">{point.copy}</p>
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
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div className="max-w-md">
            <Wordmark />
            <p className="mt-3 text-sm text-muted-foreground">
              Built by <span className="font-medium text-foreground">Revido</span> — we build custom
              AI tools for companies. Revido Mail is a taste of what bespoke agents feel like.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Button asChild variant="primary">
              <Link to="/talk">
                Talk to Revido <ArrowRight className="size-4" />
              </Link>
            </Button>
            <span className="text-2xs text-muted-foreground/70">revido.co</span>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border/60 pt-6 text-2xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Revido · mail.revido.co</span>
          <span className="flex items-center gap-1.5">
            <Sparkle className="size-3" />
            Every AI action is marked, logged, and reversible.
          </span>
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
      <div className="mb-3 text-2xs font-semibold uppercase tracking-widest text-primary">
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-lg text-muted-foreground">{subtitle}</p>}
    </div>
  )
}
