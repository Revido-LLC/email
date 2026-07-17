import { Link } from '@tanstack/react-router'
import { Button, cn } from '@revido/ui'
import { Chrome } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { capture } from '@/lib/analytics'

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
  const { t } = useTranslation()
  const buttonWidth = stacked ? 'w-full sm:w-auto' : ''

  return (
    <div className={cn('flex gap-2', stacked ? 'flex-col sm:flex-row' : 'flex-wrap', className)}>
      <Button asChild variant="primary" size={size} className={buttonWidth}>
        <Link to="/onboarding" onClick={() => capture('landing_cta_clicked', { cta: 'oauth-google' })}>
          <GoogleGlyph />
          {t('landing.oauth.google')}
        </Link>
      </Button>
      <Button asChild variant="outline" size={size} className={buttonWidth}>
        <Link
          to="/onboarding"
          onClick={() => capture('landing_cta_clicked', { cta: 'oauth-microsoft' })}
        >
          <MicrosoftGlyph />
          {t('landing.oauth.microsoft')}
        </Link>
      </Button>
    </div>
  )
}
