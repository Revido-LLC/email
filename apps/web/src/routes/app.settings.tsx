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
import { useTranslation } from 'react-i18next'
import { formatNumber } from '@/i18n/format'

export const Route = createFileRoute('/app/settings')({
  component: SettingsScreen,
})

function SettingsScreen() {
  const { t } = useTranslation()
  return (
    <div className="h-full overflow-y-auto">
      <header className="glass-thin sticky top-0 z-10 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <SettingsIcon className="size-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t('settings.header.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.header.subtitle')}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="accounts">
          <TabsList className="mb-6 flex w-full overflow-x-auto">
            <TabsTrigger value="accounts">{t('settings.tabs.accounts')}</TabsTrigger>
            <TabsTrigger value="ai">{t('settings.tabs.ai')}</TabsTrigger>
            <TabsTrigger value="signatures">{t('settings.tabs.signatures')}</TabsTrigger>
            <TabsTrigger value="privacy">{t('settings.tabs.privacy')}</TabsTrigger>
            <TabsTrigger value="usage">{t('settings.tabs.usage')}</TabsTrigger>
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
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {ACCOUNTS.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
      <Button variant="outline" className="w-full">
        <Plus className="size-4" /> {t('settings.accounts.connectAnother')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t('settings.accounts.supportNote')}
      </p>
    </div>
  )
}

function AccountCard({ account }: { account: Account }) {
  const { t } = useTranslation()
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
              <Check className="size-3" /> {t('settings.accounts.synced')}
            </Badge>
          ) : (
            <Badge variant="warning">{t('settings.accounts.syncing')}</Badge>
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
  const { t } = useTranslation()
  const [done, setDone] = React.useState(false)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">{t('settings.accounts.disconnectNote')}</p>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" /> {t('settings.accounts.disconnect')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-4" />{' '}
              {t('settings.accounts.disconnectTitle', { email: account.email })}
            </DialogTitle>
            <DialogDescription>
              {t('settings.accounts.disconnectDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <ShieldCheck className="size-4 text-destructive" /> {t('settings.accounts.provablePurge')}
            </div>
            {t('settings.accounts.purgeDetail')}
          </div>
          {done ? (
            <p className="text-sm font-medium text-muted-foreground">
              {t('settings.accounts.disconnectedDone')}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" size="sm">
                {t('settings.accounts.keepAccount')}
              </Button>
            </DialogClose>
            <Button variant="destructive" size="sm" onClick={() => setDone(true)}>
              <Trash2 className="size-3.5" /> {t('settings.accounts.disconnectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- AI preferences ---------------- */

const AI_PREFS: { id: 'drafts' | 'agents' | 'chat' | 'digest'; hasNote?: boolean; on: boolean }[] = [
  { id: 'drafts', on: true },
  { id: 'agents', on: true },
  { id: 'chat', on: true },
  { id: 'digest', hasNote: true, on: false },
]

function AiTab() {
  const { t } = useTranslation()
  const [prefs, setPrefs] = React.useState(() =>
    Object.fromEntries(AI_PREFS.map((p) => [p.id, p.on])),
  )

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{t('settings.ai.title')}</CardTitle>
            <AiTag />
          </div>
          <CardDescription>{t('settings.ai.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {AI_PREFS.map((pref, i) => (
            <div key={pref.id}>
              {i > 0 && <Separator className="my-1" />}
              <div className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <Label htmlFor={`pref-${pref.id}`} className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-ai" />
                    {t(`settings.ai.prefs.${pref.id}.label`)}
                  </Label>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {t(`settings.ai.prefs.${pref.id}.description`)}
                  </p>
                  {pref.hasNote && (
                    <p className="mt-0.5 text-2xs text-muted-foreground/70">
                      {t(`settings.ai.prefs.${pref.id}.note`)}
                    </p>
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
          <p className="text-sm font-medium">{t('settings.ai.voiceProfile.title')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('settings.ai.voiceProfile.description')}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Signatures ---------------- */

function SignaturesTab() {
  const { t } = useTranslation()
  const signature = SIGNATURES[0]!
  const [value, setValue] = React.useState(signature.html)
  const [saved, setSaved] = React.useState(false)

  return (
    <Card className="shadow-soft">
      <CardHeader>
        <div className="flex items-center gap-2">
          <SignatureIcon className="size-4 text-muted-foreground" />
          <CardTitle>{t('settings.signatures.title', { name: signature.name })}</CardTitle>
        </div>
        <CardDescription>{t('settings.signatures.description')}</CardDescription>
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
          <Label className="text-xs text-muted-foreground">{t('settings.signatures.preview')}</Label>
          <div
            className="mt-1.5 rounded-xl border border-border bg-muted/40 p-3.5 text-sm"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setSaved(true)}>
            <Check className="size-3.5" /> {t('settings.signatures.save')}
          </Button>
          {saved && <span className="text-sm text-muted-foreground">{t('settings.signatures.saved')}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- Privacy ---------------- */

function PrivacyTab() {
  const { t } = useTranslation()
  const guaranteeIds = ['encryption', 'zeroRetention', 'openSource', 'delete'] as const
  const notClaimedIds = ['noAds', 'noRead', 'noBackdoor'] as const

  return (
    <div className="space-y-4">
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success" />
            <CardTitle>{t('settings.privacy.guaranteesTitle')}</CardTitle>
          </div>
          <CardDescription>{t('settings.privacy.guaranteesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {guaranteeIds.map((id) => (
            <div key={id} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{t(`settings.privacy.guarantees.${id}`)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <X className="size-4 text-muted-foreground" />
            <CardTitle>{t('settings.privacy.notClaimedTitle')}</CardTitle>
          </div>
          <CardDescription>{t('settings.privacy.notClaimedDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {notClaimedIds.map((id) => (
            <div key={id} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <X className="mt-0.5 size-4 shrink-0" />
              <span>{t(`settings.privacy.notClaimed.${id}`)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('settings.privacy.openSourceNote')}</p>
      </div>

      <DeleteEverythingDialog />
    </div>
  )
}

function DeleteEverythingDialog() {
  const { t } = useTranslation()
  const [done, setDone] = React.useState(false)

  return (
    <Card className="border-destructive/30 bg-destructive/5 shadow-soft">
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-destructive">
            {t('settings.privacy.deleteEverything.title')}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('settings.privacy.deleteEverything.description')}
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm" className="shrink-0">
              <Trash2 className="size-3.5" /> {t('settings.privacy.deleteEverything.button')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-4" /> {t('settings.privacy.deleteEverything.dialogTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('settings.privacy.deleteEverything.dialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5 text-sm text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="size-4 text-destructive" /> {t('settings.accounts.provablePurge')}
              </div>
              {t('settings.privacy.deleteEverything.purgeDetail')}
            </div>
            {done && (
              <p className="text-sm font-medium text-muted-foreground">
                {t('settings.privacy.deleteEverything.done')}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  {t('settings.privacy.deleteEverything.cancel')}
                </Button>
              </DialogClose>
              <Button variant="destructive" size="sm" onClick={() => setDone(true)}>
                <Trash2 className="size-3.5" /> {t('settings.privacy.deleteEverything.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

/* ---------------- Usage ---------------- */

const COUNTERS: { id: 'drafts' | 'agentRuns' | 'chatQueries'; value: number; token: string }[] = [
  { id: 'drafts', value: 48, token: 'to-reply' },
  { id: 'agentRuns', value: 312, token: 'awaiting-reply' },
  { id: 'chatQueries', value: 27, token: 'newsletters' },
]

function UsageTab() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {COUNTERS.map((c) => (
          <Card key={c.id} className="shadow-soft">
            <CardContent className="p-5">
              <div className={cn('text-2xl font-semibold tabular-nums', counterText(c.token))}>
                {formatNumber(c.value)}
              </div>
              <div className="mt-1 text-sm font-medium">
                {t(`settings.usage.counters.${c.id}.label`)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(`settings.usage.counters.${c.id}.sub`)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-subtle p-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Gauge className="size-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{t('settings.usage.freePlan')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('settings.usage.freePlanDetail', { name: USER.name })}
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
