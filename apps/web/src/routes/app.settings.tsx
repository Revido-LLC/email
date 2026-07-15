import { createFileRoute } from '@tanstack/react-router'
import { ACCOUNTS, SIGNATURES, USER, type Account } from '@revido/mock-data'
import {
  AiTag,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  Progress,
  Separator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from '@revido/ui'
import {
  AtSign,
  Check,
  Gauge,
  Lock,
  Mail,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Signature as SignatureIcon,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'

export const Route = createFileRoute('/app/settings')({
  component: SettingsScreen,
})

function SettingsScreen() {
  return (
    <div className="h-full overflow-y-auto">
      <header className="glass-thin sticky top-0 z-10 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <SettingsIcon className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Accounts, AI preferences, signatures, privacy and usage.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="accounts">
          <TabsList className="mb-6 flex w-full overflow-x-auto">
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="signatures">Signatures</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>
          <TabsContent value="ai">
            <AiTab />
          </TabsContent>
          <TabsContent value="signatures">
            <SignaturesTab />
          </TabsContent>
          <TabsContent value="privacy">
            <PrivacyTab />
          </TabsContent>
          <TabsContent value="usage">
            <UsageTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

/* ---------------- Accounts ---------------- */

function AccountsTab() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {ACCOUNTS.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
      <Button variant="outline" className="w-full">
        <Plus className="size-4" /> Connect another account
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Gmail and Outlook supported. Your mail is end-to-end encrypted with a key only you hold.
      </p>
    </div>
  )
}

function AccountCard({ account }: { account: Account }) {
  const providerLabel = account.provider === 'gmail' ? 'Gmail' : 'Outlook'
  const fullySynced = account.syncProgress >= 1

  return (
    <Card className="shadow-soft">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            {account.provider === 'gmail' ? (
              <Mail className="size-5" />
            ) : (
              <AtSign className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{account.email}</span>
              <Badge variant="outline">{providerLabel}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{account.name}</p>
          </div>
          {fullySynced ? (
            <Badge variant="success" className="gap-1">
              <Check className="size-3" /> Synced
            </Badge>
          ) : (
            <Badge variant="warning">Syncing…</Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{account.syncLabel}</span>
            <span>{Math.round(account.syncProgress * 100)}%</span>
          </div>
          <Progress value={account.syncProgress} />
        </div>

        <Separator />

        <DisconnectDialog account={account} />
      </CardContent>
    </Card>
  )
}

function DisconnectDialog({ account }: { account: Account }) {
  const [done, setDone] = React.useState(false)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Disconnecting purges every message, draft and index we hold for this account.
      </p>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" /> Disconnect
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-4" /> Disconnect {account.email}?
            </DialogTitle>
            <DialogDescription>
              This disconnects the account and permanently erases everything we store for it.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="size-4 text-destructive" /> Provable purge
            </div>
            Deleting your key cryptographically erases all your content, including backups —
            instantly and permanently. We couldn’t recover it even if you asked.
          </div>
          {done ? (
            <p className="text-sm font-medium text-muted-foreground">
              ✓ Account disconnected and purged.
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                Keep account
              </Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={() => setDone(true)}>
              <Trash2 className="size-3.5" /> Disconnect + delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- AI preferences ---------------- */

const AI_PREFS: { id: string; label: string; description: string; note?: string; on: boolean }[] = [
  {
    id: 'drafts',
    label: 'Reply drafts',
    description: 'Pre-write replies in your voice so you can send with one tap.',
    on: true,
  },
  {
    id: 'agents',
    label: 'Inbox agents',
    description: 'Let agents triage, file and chase in the background.',
    on: true,
  },
  {
    id: 'chat',
    label: 'Chat with inbox',
    description: 'Ask questions across your mail and get grounded answers.',
    on: true,
  },
  {
    id: 'digest',
    label: 'Daily digest email',
    description: 'A morning brief of what matters.',
    note: 'Delivered at 7:00am, your time.',
    on: false,
  },
]

function AiTab() {
  const [prefs, setPrefs] = React.useState(() =>
    Object.fromEntries(AI_PREFS.map((p) => [p.id, p.on])),
  )

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>AI preferences</CardTitle>
            <AiTag />
          </div>
          <CardDescription>
            You’re always in control. Turn any of these off and the AI stays quiet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {AI_PREFS.map((pref, i) => (
            <div key={pref.id}>
              {i > 0 && <Separator className="my-1" />}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <Label htmlFor={`pref-${pref.id}`} className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-ai" />
                    {pref.label}
                  </Label>
                  <p className="mt-0.5 text-sm text-muted-foreground">{pref.description}</p>
                  {pref.note && (
                    <p className="mt-0.5 text-2xs text-muted-foreground/70">{pref.note}</p>
                  )}
                </div>
                <Switch
                  id={`pref-${pref.id}`}
                  checked={prefs[pref.id]}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, [pref.id]: v }))}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-ai/25 bg-ai/5 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-ai/12 text-ai">
          <Sparkles className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">Your voice profile</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Learned from your sent mail — greetings, sign-offs and how formal you get with each
            contact. Drafts sound like you, not a robot.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Signatures ---------------- */

function SignaturesTab() {
  const signature = SIGNATURES[0]!
  const [value, setValue] = React.useState(signature.html)
  const [saved, setSaved] = React.useState(false)

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center gap-2">
          <SignatureIcon className="size-4 text-muted-foreground" />
          <CardTitle>{signature.name} signature</CardTitle>
        </div>
        <CardDescription>Appended to new mail. HTML is allowed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          className="min-h-28 font-mono text-xs"
          spellCheck={false}
        />
        <div>
          <Label className="text-xs text-muted-foreground">Preview</Label>
          <div
            className="mt-1.5 rounded-xl border border-border bg-muted/40 p-3.5 text-sm"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setSaved(true)}>
            <Check className="size-3.5" /> Save signature
          </Button>
          {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- Privacy ---------------- */

function PrivacyTab() {
  const guarantees = [
    'Your mail is encrypted with a key only you hold.',
    'AI runs on your inbox with zero retention — prompts and content are never stored or trained on.',
    'The client is open source. Audit exactly what runs.',
    'Delete your key and every byte is provably, permanently gone.',
  ]
  const notClaimed = [
    'We don’t sell or share your data — there is no ad model here.',
    'We don’t read your mail. Agents act on it; humans at Revido never see it.',
    'We don’t hold a backdoor. There’s no recovery key on our side.',
  ]

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" />
            <CardTitle>What we guarantee</CardTitle>
          </div>
          <CardDescription>Plain language, no fine print.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {guarantees.map((g) => (
            <div key={g} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{g}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <X className="size-4 text-muted-foreground" />
            <CardTitle>What we don’t claim</CardTitle>
          </div>
          <CardDescription>The honest limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {notClaimed.map((n) => (
            <div key={n} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <X className="mt-0.5 size-4 shrink-0" />
              <span>{n}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Open source · zero-retention AI. The whole thing is auditable, and nothing you type sticks
          to a model.
        </p>
      </div>

      <DeleteEverythingDialog />
    </div>
  )
}

function DeleteEverythingDialog() {
  const [done, setDone] = React.useState(false)

  return (
    <Card className="border-destructive/30 bg-destructive/5 shadow-soft">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-destructive">Delete everything</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Wipe every account, agent and byte we hold for you.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" className="shrink-0">
              <Trash2 className="size-3.5" /> Delete everything
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-4" /> Delete everything?
              </DialogTitle>
              <DialogDescription>
                This erases all accounts, agents, drafts and indexes tied to your key.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="size-4 text-destructive" /> Provable purge
              </div>
              Deleting your key cryptographically erases all your content, including backups —
              instantly and permanently.
            </div>
            {done && (
              <p className="text-sm font-medium text-muted-foreground">
                ✓ Everything deleted. Your key is gone.
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="destructive" size="sm" onClick={() => setDone(true)}>
                <Trash2 className="size-3.5" /> Yes, delete everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

/* ---------------- Usage ---------------- */

const COUNTERS: { label: string; value: string; sub: string; token: string }[] = [
  { label: 'AI drafts this month', value: '48', sub: 'replies pre-written', token: 'to-reply' },
  { label: 'Agent runs', value: '312', sub: 'actions handled for you', token: 'awaiting-reply' },
  { label: 'Chat queries', value: '27', sub: 'questions answered', token: 'newsletters' },
]

function UsageTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {COUNTERS.map((c) => (
          <Card key={c.label} className="shadow-soft">
            <CardContent className="p-5">
              <div className={cn('text-2xl font-semibold tabular-nums', counterText(c.token))}>
                {c.value}
              </div>
              <div className="mt-1 text-sm font-medium">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-subtle p-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Gauge className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">You’re on the free plan — no limits today.</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {USER.name}, everything above is on the house while we’re in early access. We’ll always
            warn you before anything changes.
          </p>
        </div>
      </div>
    </div>
  )
}

function counterText(token: string) {
  switch (token) {
    case 'to-reply':
      return 'text-cat-to-reply'
    case 'awaiting-reply':
      return 'text-cat-awaiting-reply'
    case 'newsletters':
      return 'text-cat-newsletters'
    default:
      return 'text-primary'
  }
}
