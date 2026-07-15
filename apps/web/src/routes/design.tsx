import { createFileRoute } from '@tanstack/react-router'
import { CATEGORY_LIST } from '@revido/mock-data'
import {
  AiTag,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CategoryChip,
  CategoryDot,
  Checkbox,
  ContactAvatar,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Kbd,
  Label,
  PriorityDot,
  Progress,
  Skeleton,
  Sparkle,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  SimpleTooltip,
} from '@revido/ui'
import { Archive, Moon, Reply, Sun } from 'lucide-react'
import * as React from 'react'
import { useAppState } from '@/lib/app-state'
import { TokenFoundation } from '@/components/design/token-gallery'

export const Route = createFileRoute('/design')({
  component: DesignScreen,
})

const SEMANTIC = [
  'background',
  'foreground',
  'card',
  'muted',
  'primary',
  'accent',
  'secondary',
  'success',
  'warning',
  'destructive',
  'ai',
  'border',
] as const

function DesignScreen() {
  const { theme, toggleTheme } = useAppState()
  return (
    <div className="min-h-screen overflow-y-auto bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-semibold">Design System</h1>
            <p className="mt-1 text-muted-foreground">
              Warm consumer skin, pro-tool bones. Tokens only.
            </p>
          </div>
          <Button variant="outline" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
        </div>

        <TokenFoundation />

        <div className="my-12 border-t border-border" />
        <h2 className="mb-6 font-display text-2xl font-semibold">Components</h2>

        <Group title="Semantic colors">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {SEMANTIC.map((name) => (
              <div key={name} className="space-y-1.5">
                <div
                  className="h-14 rounded-xl border border-border"
                  style={{ background: `var(--${name})` }}
                />
                <div className="text-xs font-medium">{name}</div>
              </div>
            ))}
          </div>
        </Group>

        <Group title="Category colors">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_LIST.map((c) => (
              <CategoryChip key={c.id} token={c.token} label={c.label} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {CATEGORY_LIST.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 text-xs">
                <CategoryDot token={c.token} />
                {c.label}
              </div>
            ))}
          </div>
        </Group>

        <Group title="Typography">
          <div className="space-y-2">
            <div className="font-display text-5xl font-semibold">Your inbox, handled.</div>
            <div className="font-display text-3xl font-semibold">Good morning, Sam</div>
            <div className="text-xl font-semibold">Section heading (sans)</div>
            <p className="text-base">Body text — the quick brown fox jumps over the lazy dog.</p>
            <p className="text-sm text-muted-foreground">Muted small — supporting copy.</p>
            <p className="text-2xs uppercase tracking-wide text-muted-foreground/70">2XS label</p>
          </div>
        </Group>

        <Group title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="ai">
              <Sparkle className="text-ai-foreground" /> AI
            </Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Reply">
              <Reply />
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Archive">
              <Archive />
            </Button>
          </div>
        </Group>

        <Group title="Badges, chips & markers">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Paid</Badge>
            <Badge variant="warning">Due</Badge>
            <Badge variant="destructive">Overdue</Badge>
            <Badge variant="ai">AI</Badge>
            <Badge variant="outline">$1,240</Badge>
            <AiTag />
            <span className="inline-flex items-center gap-1 text-sm">
              <Sparkle /> sparkle-marked
            </span>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs">
              <PriorityDot priority="urgent" /> urgent
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <PriorityDot priority="high" /> high
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <PriorityDot priority="normal" /> normal
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <PriorityDot priority="low" /> low
            </span>
          </div>
        </Group>

        <Group title="Forms">
          <div className="grid max-w-md gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="d-in">Email subject</Label>
              <Input id="d-in" placeholder="Following up on the proposal…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-ta">Message</Label>
              <Textarea id="d-ta" placeholder="Tell the AI what to write…" />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch defaultChecked /> AI drafts
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox defaultChecked /> Remind me
              </label>
            </div>
          </div>
        </Group>

        <Group title="Cards, tabs & overlays">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkle /> Thread summary
                </CardTitle>
                <CardDescription>Pinned AI summary card sample.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                John loves the proposal and needs two confirmations before signing.
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <CardContent className="pt-5">
                <Tabs defaultValue="insights">
                  <TabsList className="w-full">
                    <TabsTrigger value="insights">Insights</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                  </TabsList>
                  <TabsContent value="insights" className="pt-3 text-sm text-muted-foreground">
                    Contextual insights live here.
                  </TabsContent>
                  <TabsContent value="chat" className="pt-3 text-sm text-muted-foreground">
                    Chat over your whole mailbox.
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Approve this action?</DialogTitle>
                  <DialogDescription>
                    Follow-up Chaser wants to send a nudge to Dan Whitfield.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost">Cancel</Button>
                  <Button>Approve</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <SimpleTooltip label="Archive · e">
              <Button variant="outline" size="icon" aria-label="Archive">
                <Archive />
              </Button>
            </SimpleTooltip>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd> palette
            </span>
          </div>
        </Group>

        <Group title="Avatars, progress & loading">
          <div className="flex items-center gap-4">
            <ContactAvatar name="John Rivera" />
            <ContactAvatar name="Priya Nair" />
            <Avatar>
              <AvatarFallback>SO</AvatarFallback>
            </Avatar>
            <div className="w-48">
              <Progress value={0.78} />
            </div>
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </Group>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-2xs font-semibold uppercase tracking-widest text-muted-foreground/70">
        {title}
      </h2>
      {children}
    </section>
  )
}
