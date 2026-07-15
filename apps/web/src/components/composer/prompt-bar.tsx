import { Loader2, Sparkles } from 'lucide-react'
import * as React from 'react'
import { AiTag, Button, Input, Sparkle } from '@revido/ui'
import type { ToneKey } from './draft-data'
import { ToneChips } from './tone-chips'

const SUGGESTIONS = ['Reply to Priya — yes, we have capacity', 'Follow up on the proposal, gently']

/**
 * The prominent, AI-marked prompt bar. Submitting streams a generated draft into
 * the editor below; the tone chips re-stream a variant of the active draft.
 */
export function PromptBar({
  onDraft,
  onTone,
  activeTone,
  streaming,
  hasDraft,
}: {
  onDraft: (prompt: string) => void
  onTone: (tone: ToneKey) => void
  activeTone: ToneKey | null
  streaming: boolean
  hasDraft: boolean
}) {
  const [prompt, setPrompt] = React.useState('')

  function submit() {
    onDraft(prompt.trim() || 'Write a warm, concise follow-up')
  }

  return (
    <div className="rounded-2xl border border-ai/25 bg-gradient-to-br from-ai/10 via-ai/5 to-card p-4 shadow-soft">
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkle />
        <span className="font-display text-base font-semibold">Draft with AI</span>
        <AiTag />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Tell the AI what to write…"
          disabled={streaming}
          className="flex-1 border-ai/30"
        />
        <Button variant="ai" onClick={submit} disabled={streaming} className="sm:w-32">
          {streaming ? (
            <>
              <Loader2 className="animate-spin" /> Drafting…
            </>
          ) : (
            <>
              <Sparkles /> Draft
            </>
          )}
        </Button>
      </div>

      {!hasDraft && !streaming && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
            Try
          </span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPrompt(s)
                onDraft(s)
              }}
              className="rounded-full border border-ai/25 bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-ai/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <ToneChips onTone={onTone} activeTone={activeTone} disabled={streaming} />
    </div>
  )
}
