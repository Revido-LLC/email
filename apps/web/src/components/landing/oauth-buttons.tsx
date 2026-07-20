import { Button, cn } from '@revido/ui'
import { Chrome } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { capture } from '@/lib/analytics'
import { signIn } from '@/lib/auth-client'

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
  const [pending, setPending] = React.useState<'google' | 'microsoft' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const beginSignIn = async (provider: 'google' | 'microsoft') => {
    setPending(provider)
    setError(null)
    capture('landing_cta_clicked', {
      cta: provider === 'google' ? 'oauth-google' : 'oauth-microsoft',
    })

    try {
      const result = await signIn.social({
        provider,
        callbackURL: `${window.location.origin}/onboarding`,
      })
      if (result.error) {
        setError(result.error.message ?? 'Sign-in could not be started.')
        setPending(null)
      }
    } catch {
      setError('Sign-in could not be started. Please try again.')
      setPending(null)
    }
  }

  return (
    <div className={className}>
      <div className={cn('flex gap-2', stacked ? 'flex-col sm:flex-row' : 'flex-wrap')}>
        <Button
          type="button"
          variant="primary"
          size={size}
          className={buttonWidth}
          disabled={pending !== null}
          onClick={() => void beginSignIn('google')}
        >
          <GoogleGlyph />
          {pending === 'google' ? 'Connecting…' : t('landing.oauth.google')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={buttonWidth}
          disabled={pending !== null}
          onClick={() => void beginSignIn('microsoft')}
        >
          <MicrosoftGlyph />
          {pending === 'microsoft' ? 'Connecting…' : t('landing.oauth.microsoft')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
