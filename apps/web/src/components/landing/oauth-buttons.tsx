import { Link } from '@tanstack/react-router'
import { Button, cn } from '@revido/ui'
import { Chrome } from 'lucide-react'

/** Chrome glyph stands in for Google (no real brand marks in a mock). */
function GoogleGlyph() {
  return <Chrome className="size-4" />
}

/** A tasteful four-square glyph evokes Microsoft using category tokens. */
function MicrosoftGlyph() {
  return (
    <span className="grid grid-cols-2 gap-0.5" aria-hidden>
      <span className="size-1.5 bg-cat-to-reply" />
      <span className="size-1.5 bg-cat-awaiting-reply" />
      <span className="size-1.5 bg-cat-receipts" />
      <span className="size-1.5 bg-cat-calendar" />
    </span>
  )
}

export function OAuthButtons({
  size = 'md',
  stacked = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  stacked?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex gap-2', stacked ? 'flex-col sm:flex-row' : 'flex-wrap', className)}>
      <Button asChild variant="primary" size={size}>
        <Link to="/onboarding">
          <GoogleGlyph />
          Continue with Google
        </Link>
      </Button>
      <Button asChild variant="outline" size={size}>
        <Link to="/onboarding">
          <MicrosoftGlyph />
          Continue with Microsoft
        </Link>
      </Button>
    </div>
  )
}
