// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { Link } from '@tanstack/react-router'
import type { Thread } from '@revido/db'
import { AiTag, Button, Sparkle } from '@revido/ui'
import { Loader2, PenLine, Send, Sparkles, X } from 'lucide-react'
import * as React from 'react'
import { draftToHtml } from '@/components/composer/draft-data'
import { useAiDraft, useAiQuickReplies } from '@/lib/hooks/ai'
import { useReplyToThread } from '@/lib/hooks'

export function ReplyZone({ thread }: { thread: Thread }) {
  const { mutate: fetchQuickReplies, data: quickReplies, isPending: repliesPending } =
    useAiQuickReplies()
  const fullDraft = useAiDraft()
  const reply = useReplyToThread()

  const [draft, setDraft] = React.useState<string | null>(null)
  // While true, the textarea mirrors the streaming draft; a manual edit detaches.
  const [followStream, setFollowStream] = React.useState(false)

  // Suggest quick replies for the open thread.
  React.useEffect(() => {
    setDraft(null)
    setFollowStream(false)
    fetchQuickReplies({ threadId: thread.id })
  }, [thread.id, fetchQuickReplies])

  React.useEffect(() => {
    if (followStream) setDraft(fullDraft.text)
  }, [followStream, fullDraft.text])

  const replies = quickReplies?.replies ?? []

  function writeFullDraft() {
    setFollowStream(true)
    setDraft('')
    void fullDraft.start({
      threadId: thread.id,
      prompt: 'Write a complete, ready-to-send reply to this thread.',
    })
  }

  function send() {
    const body = draft?.trim()
    if (!body) return
    reply.mutate(
      { threadId: thread.id, html: draftToHtml(body) },
      {
        onSuccess: () => {
          setDraft(null)
          setFollowStream(false)
        },
      },
    )
  }

  return (
    <div className="glass-thin shrink-0 border-x-0 border-b-0 px-4 py-3">
      <div className="mx-auto w-full max-w-3xl">
        {draft !== null && (
          <div className="mb-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {fullDraft.isStreaming ? (
                  <>
                    <Loader2 className="size-3 animate-spin" /> Drafting…
                  </>
                ) : (
                  <>
                    <Sparkle className="size-3" /> Reply preview
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDraft(null)
                  setFollowStream(false)
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Discard reply"
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              value={draft}
              onChange={(e) => {
                setFollowStream(false)
                setDraft(e.target.value)
              }}
              rows={3}
              className="w-full resize-none rounded-xl bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(null)
                  setFollowStream(false)
                }}
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={send}
                disabled={reply.isPending || fullDraft.isStreaming || !draft.trim()}
              >
                <Send className="size-3.5" /> {reply.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AiTag label="Quick reply" />
          </span>
          {repliesPending && replies.length === 0 ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Suggesting…
            </span>
          ) : (
            replies.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setFollowStream(false)
                  setDraft(r)
                }}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted"
              >
                {r}
              </button>
            ))
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ai"
              size="sm"
              onClick={writeFullDraft}
              disabled={fullDraft.isStreaming}
            >
              {fullDraft.isStreaming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}{' '}
              Write full draft
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/compose">
                <PenLine className="size-3.5" /> Open composer
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
