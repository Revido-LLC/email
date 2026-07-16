// i18n-todo: extract hardcoded copy in this component to the en/nl catalogs (see apps/web/src/i18n)
import { EditorContent, type Editor } from '@tiptap/react'
import { Bold, Italic, List, ListOrdered, Loader2 } from 'lucide-react'
import * as React from 'react'
import { Button, cn } from '@revido/ui'

/**
 * The email body: a Tiptap rich-text editor with a minimal toolbar, plus a muted
 * signature block appended below. The AI-streamed draft populates the content.
 */
export function ComposerEditor({
  editor,
  streaming,
  signatureHtml,
}: {
  editor: Editor | null
  streaming: boolean
  signatureHtml: string
}) {
  const empty = Boolean(editor?.isEmpty) && !streaming

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <EditorToolbar editor={editor} disabled={streaming} />

      <div className="relative">
        {streaming && (
          <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-ai/12 px-2.5 py-1 text-2xs font-semibold text-ai">
            <Loader2 className="size-3 animate-spin" /> Drafting…
          </div>
        )}
        {empty && (
          <p className="pointer-events-none absolute inset-x-4 top-3 text-sm text-muted-foreground/70">
            Write your message, or use the AI prompt above to draft it.
          </p>
        )}
        <EditorContent editor={editor} />
      </div>

      <div className="border-t border-dashed border-border px-4 py-3">
        <div
          className="text-sm leading-relaxed text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: signatureHtml }}
        />
      </div>
    </div>
  )
}

function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <ToolbarButton
        label="Bold"
        active={editor?.isActive('bold')}
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor?.isActive('italic')}
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <div className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bullet list"
        active={editor?.isActive('bulletList')}
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor?.isActive('orderedList')}
        disabled={disabled || !editor}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant={active ? 'subtle' : 'ghost'}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cn(active && 'text-primary')}
    >
      {children}
    </Button>
  )
}
