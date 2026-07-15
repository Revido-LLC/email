import { AGENTS, type AgentDef } from '@revido/mock-data'
import { Button, Input, Sparkle, Tabs, TabsContent, TabsList, TabsTrigger } from '@revido/ui'
import { createFileRoute } from '@tanstack/react-router'
import { Activity, LayoutGrid, Sparkles } from 'lucide-react'
import * as React from 'react'
import { ActivityFeed } from '@/components/agents/activity-feed'
import { AgentCard } from '@/components/agents/agent-card'
import { CreateAgentDialog, type WizardSeed } from '@/components/agents/create-agent-dialog'

export const Route = createFileRoute('/app/agents')({
  component: AgentsScreen,
})

function AgentsScreen() {
  const [agents, setAgents] = React.useState<AgentDef[]>(() => AGENTS)
  const [newIds, setNewIds] = React.useState<Set<string>>(new Set())
  const [nl, setNl] = React.useState('')
  const [seed, setSeed] = React.useState<WizardSeed | null>(null)

  const activeCount = agents.filter((a) => a.enabled).length

  function toggle(id: string) {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)))
  }

  function openCreate() {
    setSeed({ kind: 'nl', text: nl })
  }

  function handleCreate(agent: AgentDef) {
    setAgents((prev) => [agent, ...prev])
    setNewIds((prev) => new Set(prev).add(agent.id))
    setNl('')
  }

  function enableExisting(id: string) {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: true } : a)))
  }

  return (
    <div className="h-full overflow-y-auto">
      <Tabs defaultValue="gallery">
        {/* Sticky header */}
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Agents</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkle />
                {activeCount} working quietly in the background
              </p>
            </div>
            <TabsList>
              <TabsTrigger value="gallery">
                <LayoutGrid className="size-4" /> Gallery
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity className="size-4" /> Activity
              </TabsTrigger>
            </TabsList>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <TabsContent value="gallery" className="mt-0 space-y-6">
            {/* NL create hero */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ai/15 via-accent/10 to-card p-6 shadow-soft">
              <Sparkles className="absolute right-5 top-5 size-5 text-ai/50" />
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                What should we automate?
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Describe a chore in plain English. We compile it into a plan, dry-run it against
                your history, and only turn it on when you say so.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={nl}
                  onChange={(e) => setNl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openCreate()
                  }}
                  placeholder="Label every invoice and mark it FYI…"
                  className="h-11 flex-1 bg-card"
                />
                <Button variant="ai" size="lg" onClick={openCreate}>
                  <Sparkles /> Create agent
                </Button>
              </div>
            </div>

            {/* Gallery grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onToggle={toggle}
                  onOpen={(a) => setSeed({ kind: 'agent', agent: a })}
                  isNew={newIds.has(agent.id)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <ActivityFeed />
          </TabsContent>
        </div>
      </Tabs>

      <CreateAgentDialog
        seed={seed}
        onOpenChange={(open) => {
          if (!open) setSeed(null)
        }}
        onCreate={handleCreate}
        onEnableExisting={enableExisting}
      />
    </div>
  )
}
