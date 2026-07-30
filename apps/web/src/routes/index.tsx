import { Link, createFileRoute } from '@tanstack/react-router'
import { Button, cn } from '@revido/ui'
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Inbox,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { motion } from 'motion/react'

export const Route = createFileRoute('/')({ component: LandingPage })

const fadeUp = { initial: { y: 14 }, animate: { y: 0 } }

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#111318]">
      <Header />
      <main>
        <Hero />
        <FeatureRail />
        <Workflow />
        <Trust />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Revido home">
      <span className="flex size-8 items-center justify-center rounded-lg bg-[#3157e8] text-white">
        <Mail className="size-4" strokeWidth={2.2} />
      </span>
      <span className="text-lg font-semibold tracking-tight">Revido</span>
    </Link>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e7e9ee] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8">
        <Brand />
        <nav className="ml-12 hidden items-center gap-8 text-sm font-medium text-[#4d5566] md:flex">
          <a href="#product" className="transition-colors hover:text-[#111318]">Product</a>
          <a href="#security" className="transition-colors hover:text-[#111318]">Security</a>
          <a href="#pricing" className="transition-colors hover:text-[#111318]">Pricing</a>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/onboarding"
            className="hidden px-2 py-2 text-sm font-medium text-[#4d5566] transition-colors hover:text-[#111318] sm:inline-flex"
          >
            Sign in
          </Link>
          <Button asChild size="sm" className="bg-[#3157e8] text-white hover:bg-[#2748c7]">
            <Link to="/onboarding">
              Start free
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="overflow-hidden border-b border-[#edf0f4]">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.84fr_1.16fr] lg:gap-14 lg:py-20">
        <motion.div variants={fadeUp} initial="initial" animate="animate" transition={{ duration: 0.45 }}>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-6xl lg:text-7xl">
            Your inbox, meetings, and follow-ups — handled.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#5d6678]">
            Revido turns email and meeting context into ready-to-review work. Draft replies,
            capture decisions, and keep every commitment moving.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 bg-[#3157e8] px-6 text-white hover:bg-[#2748c7]">
              <Link to="/onboarding">
                Start free for 7 days <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 border-[#aeb4c0] px-6">
              <Link to="/app" search={{ demo: true }}>
                <Play className="size-4" /> Try the live demo
              </Link>
            </Button>
          </div>
          <p className="mt-5 text-xs text-[#6a7282]">
            No card required · Gmail + Outlook · Your data is never used for training
          </p>
        </motion.div>
        <motion.div
          variants={fadeUp}
          initial="initial"
          animate="animate"
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          <TodayPreview />
        </motion.div>
      </div>
    </section>
  )
}

function TodayPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8dce5] bg-white shadow-[0_22px_70px_rgba(30,42,75,0.13)]">
      <div className="flex items-center justify-between border-b border-[#e7e9ee] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-[#3157e8] text-white">
            <Mail className="size-3.5" />
          </span>
          <span className="text-sm font-semibold">Today</span>
        </div>
        <span className="text-xs text-[#727b8c]">Everything that needs you</span>
      </div>
      <div className="grid min-h-[490px] lg:grid-cols-[1fr_220px]">
        <div className="space-y-3 border-r border-[#e7e9ee] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d94c4c]">
            <span className="size-1.5 rounded-full bg-[#ef5d5d]" /> Urgent
          </div>
          <PreviewBlock icon={Inbox} title="Partnership agreement — feedback requested">
            Priya needs your feedback today. Revido connected the latest agreement and your
            prior meeting.
          </PreviewBlock>
          <PreviewBlock icon={CalendarDays} title="Partnership sync · 45 min" success>
            <div className="space-y-1.5">
              <PreviewCheck text="Pilot starts in June" />
              <PreviewCheck text="Security review due May 28" />
              <PreviewCheck text="Next sync scheduled" />
            </div>
          </PreviewBlock>
          <div className="rounded-lg border border-[#dfe3eb] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-[#3157e8]" /> Drafted reply
              </span>
              <span className="text-[11px] text-[#747d8e]">Professional</span>
            </div>
            <p className="text-xs leading-5 text-[#4f5869]">
              Hi Priya, thanks for the update. I reviewed the latest agreement and added a few
              comments. Once we confirm the pilot scope, we’re ready to move forward.
            </p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-md bg-[#3157e8] px-3 py-1.5 text-[11px] font-semibold text-white">
                Review & send
              </span>
              <span className="rounded-md border border-[#d8dce5] px-3 py-1.5 text-[11px] font-medium">
                Edit draft
              </span>
            </div>
          </div>
        </div>
        <aside className="space-y-3 bg-[#fafbfc] p-4">
          <div className="text-xs font-semibold">Sources</div>
          {[
            { label: 'Agreement v3.pdf', icon: FileText },
            { label: 'Partnership transcript', icon: MessageSquareText },
            { label: 'Priya · email thread', icon: Mail },
          ].map(({ label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 text-[11px] text-[#5d6678]">
              <Icon className="size-3.5 text-[#3157e8]" />
              <span>{label}</span>
            </div>
          ))}
          <div className="mt-5 border-t border-[#e1e4ea] pt-4">
            <div className="text-xs font-semibold">Next steps</div>
            <div className="mt-3 space-y-2 text-[11px] text-[#5d6678]">
              <PreviewCheck text="Confirm pilot scope" />
              <PreviewCheck text="Share questionnaire" />
              <PreviewCheck text="Schedule next sync" />
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-[#cfe5dc] bg-[#f1faf6] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#13745c]">
              <ShieldCheck className="size-4" /> Approval required
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#4d6b62]">
              Nothing sends until you approve it.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function PreviewBlock({
  icon: Icon,
  title,
  success,
  children,
}: {
  icon: typeof Mail
  title: string
  success?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-[#dfe3eb] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn('size-4', success ? 'text-[#13866a]' : 'text-[#3157e8]')} />
        {title}
      </div>
      <div className="mt-2 text-xs leading-5 text-[#5d6678]">{children}</div>
    </div>
  )
}

function PreviewCheck({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="size-3.5 shrink-0 text-[#159272]" />
      <span>{text}</span>
    </div>
  )
}

const FEATURES = [
  [Inbox, 'Inbox that stays clear', 'Surface what matters, summarize threads, and prepare replies so you spend less time sorting.'],
  [Users, 'Meetings that deliver', 'Record without a bot, capture decisions, and connect action items to the right context.'],
  [CheckCircle2, 'Follow-ups that happen', 'Turn conversations into drafts, reminders, and next steps—without the busywork.'],
  [ShieldCheck, 'Enterprise-ready', 'Workspace controls, role-based access, audit trails, and configurable retention.'],
] as const

function FeatureRail() {
  return (
    <section id="product" className="scroll-mt-20 border-b border-[#e7e9ee]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <h2 className="max-w-2xl text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
          One place for the work that moves forward
        </h2>
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, title, copy], index) => (
            <div
              key={title}
              className={cn('py-6 lg:px-7', index > 0 && 'border-t border-[#e1e4ea] lg:border-l lg:border-t-0', index === 0 && 'lg:pl-0')}
            >
              <Icon className="size-7 text-[#3157e8]" strokeWidth={1.8} />
              <h3 className="mt-7 text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#616a7b]">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Workflow() {
  return (
    <section className="border-b border-[#e7e9ee] bg-[#fbfcfe]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <h2 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
          From conversation to completed work.
        </h2>
        <div className="mt-12 grid gap-8 lg:grid-cols-[220px_1fr]">
          <div className="space-y-9">
            <WorkflowNote n="1" title="Context, connected">
              Relevant emails, meetings, and files become one authorized source set.
            </WorkflowNote>
            <WorkflowNote n="2" title="Work, prepared">
              Get cited answers and drafts grounded in what actually happened.
            </WorkflowNote>
            <WorkflowNote n="3" title="You stay in control">
              Review, edit, and approve every external action before it happens.
            </WorkflowNote>
          </div>
          <ContextPreview />
        </div>
      </div>
    </section>
  )
}

function WorkflowNote({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#3157e8] text-xs text-white">{n}</span>
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#626b7c]">{children}</p>
    </div>
  )
}

function ContextPreview() {
  return (
    <div className="grid overflow-hidden rounded-xl border border-[#d8dce5] bg-white shadow-[0_15px_45px_rgba(31,43,77,0.08)] md:grid-cols-3">
      <DemoColumn title="Sources" icon={FileText}>
        <SourceRow icon={Mail} title="Q2 renewal and pricing" meta="Email · May 8" active />
        <SourceRow icon={MessageSquareText} title="Renewal discussion" meta="Meeting · 45 min" />
        <SourceRow icon={FileText} title="Pricing terms.pdf" meta="Attachment · v3" />
      </DemoColumn>
      <DemoColumn title="Cited answer" icon={Sparkles}>
        <p className="text-sm leading-6 text-[#3f4858]">
          The renewal keeps current pricing for 50 seats. Consolidated billing begins in June
          and rollout completes by July 15. <sup className="text-[#3157e8]">1 2 3</sup>
        </p>
        <div className="mt-5 border-t border-[#e4e7ed] pt-4 text-xs text-[#6b7485]">
          3 authorized sources
        </div>
      </DemoColumn>
      <DemoColumn title="Draft reply" icon={Send}>
        <p className="text-sm leading-6 text-[#3f4858]">
          Hi Alex, thanks for confirming. We’re happy to honor the current pricing and begin
          consolidated billing in June…
        </p>
        <div className="mt-5 flex gap-2">
          <span className="rounded-md bg-[#3157e8] px-3 py-2 text-xs font-semibold text-white">Approve & send</span>
          <span className="rounded-md border border-[#d5dae3] px-3 py-2 text-xs font-medium">Edit</span>
        </div>
      </DemoColumn>
    </div>
  )
}

function DemoColumn({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="min-h-72 border-b border-[#e1e4ea] p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="mb-5 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-[#3157e8]" /> {title}
      </div>
      {children}
    </div>
  )
}

function SourceRow({ icon: Icon, title, meta, active }: { icon: typeof Mail; title: string; meta: string; active?: boolean }) {
  return (
    <div className={cn('mb-2 rounded-lg p-3', active ? 'bg-[#edf2ff]' : 'bg-[#f7f8fa]')}>
      <div className="flex items-center gap-2 text-xs font-semibold"><Icon className="size-3.5 text-[#3157e8]" />{title}</div>
      <div className="mt-1 text-[11px] text-[#737c8d]">{meta}</div>
    </div>
  )
}

const TRUST = [
  [LockKeyhole, 'Content encrypted per user'],
  [ShieldCheck, 'No model training'],
  [CheckCircle2, 'Review before send'],
  [Trash2, 'Delete your data anytime'],
] as const

function Trust() {
  return (
    <section id="security" className="scroll-mt-20 border-b border-[#e7e9ee]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <h2 className="text-center text-4xl font-semibold tracking-[-0.035em]">
          Private by design. Useful by default.
        </h2>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(([Icon, text], index) => (
            <div key={text} className={cn('flex items-center gap-4 py-3 lg:px-6', index > 0 && 'lg:border-l lg:border-[#e1e4ea]')}>
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] text-[#3157e8]">
                <Icon className="size-5" />
              </span>
              <span className="text-sm font-semibold">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 bg-[#fbfcfe]">
      <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8">
        <h2 className="text-center text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
          Start free. Upgrade when Revido earns its place.
        </h2>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <PricePlan title="Plus" price="$30" suffix="/ month" primary>
            <PlanPoint text="Unlimited connected context" />
            <PlanPoint text="Meeting capture and transcripts" />
            <PlanPoint text="AI drafts, search, and follow-ups" />
            <PlanPoint text="Agents and approvals" />
            <Button asChild className="mt-7 w-full bg-[#3157e8] text-white hover:bg-[#2748c7]">
              <Link to="/onboarding">Start free — no card</Link>
            </Button>
          </PricePlan>
          <PricePlan title="Enterprise" price="Custom">
            <PlanPoint text="SAML or OIDC SSO" />
            <PlanPoint text="Workspace policies and audit logs" />
            <PlanPoint text="Custom retention and onboarding" />
            <Button asChild variant="outline" className="mt-7 w-full border-[#9ea5b2] bg-white text-[#111318] hover:bg-[#f7f8fa]">
              <Link to="/talk">Talk to us</Link>
            </Button>
          </PricePlan>
        </div>
      </div>
    </section>
  )
}

function PricePlan({ title, price, suffix, primary, children }: { title: string; price: string; suffix?: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border bg-white p-7', primary ? 'border-[#3157e8]' : 'border-[#d6dae2]')}>
      <h3 className="text-2xl font-semibold">{title}</h3>
      <div className="mt-2 flex items-end gap-2">
        <span className={cn('text-5xl font-semibold tracking-tight', primary && 'text-[#3157e8]')}>{price}</span>
        {suffix && <span className="pb-1 text-sm font-medium">{suffix}</span>}
      </div>
      {primary && <p className="mt-2 text-sm font-semibold text-[#3157e8]">7 days free</p>}
      <div className="mt-7 border-t border-[#e2e5eb] pt-6">{children}</div>
    </div>
  )
}

function PlanPoint({ text }: { text: string }) {
  return <div className="mb-3 flex items-center gap-3 text-sm"><Check className="size-4 text-[#3157e8]" />{text}</div>
}

function FinalCta() {
  return (
    <section className="bg-[#3157e8] text-white">
      <div className="mx-auto max-w-5xl px-5 py-16 text-center sm:px-8">
        <h2 className="text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Move the work forward.</h2>
        <p className="mt-4 text-lg text-white/80">Connect your inbox and let Revido prepare the next step.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="bg-white text-[#3157e8] hover:bg-white/90">
            <Link to="/onboarding">Start free for 7 days</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/70 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <Link to="/app" search={{ demo: true }}><Play className="size-4" /> Try the live demo</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[#e1e4ea] bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-9 sm:flex-row sm:items-center sm:px-8">
        <Brand />
        <div className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-[#626b7b] sm:ml-auto">
          <a href="#product">Product</a>
          <a href="#security">Security</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/talk">Contact</Link>
        </div>
        <span className="text-xs text-[#8a92a1]">© 2026 Revido</span>
      </div>
    </footer>
  )
}
