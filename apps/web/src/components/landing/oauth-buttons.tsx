import { Button, cn } from '@revido/ui'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { capture } from '@/lib/analytics'
import { signIn } from '@/lib/auth-client'

function GoogleLogo() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.716v2.259h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.715H.957v2.333A8.998 8.998 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.705A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.705V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.347 2.827.957 4.038l3.006-2.333Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.58C13.463.892 11.426 0 9 0A8.998 8.998 0 0 0 .957 4.962l3.006 2.333C4.672 5.165 6.656 3.58 9 3.58Z"
      />
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 21 21" aria-hidden="true">
      <path fill="#F25022" d="M1 1h9v9H1z" />
      <path fill="#7FBA00" d="M11 1h9v9h-9z" />
      <path fill="#00A4EF" d="M1 11h9v9H1z" />
      <path fill="#FFB900" d="M11 11h9v9h-9z" />
    </svg>
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
        setError(result.error.message ?? t('landing.oauth.startError'))
        setPending(null)
      }
    } catch {
      setError(t('landing.oauth.startErrorRetry'))
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
          <GoogleLogo />
          {pending === 'google' ? t('landing.oauth.connecting') : t('landing.oauth.google')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={buttonWidth}
          disabled={pending !== null}
          onClick={() => void beginSignIn('microsoft')}
        >
          <MicrosoftLogo />
          {pending === 'microsoft' ? t('landing.oauth.connecting') : t('landing.oauth.microsoft')}
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
