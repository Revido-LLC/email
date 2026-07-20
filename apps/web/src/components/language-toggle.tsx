import { Button } from '@revido/ui'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocale } from '@/lib/app-state'

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const nextLocale = locale === 'en' ? 'nl' : 'en'

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setLocale(nextLocale)}
      aria-label={t('common.switchLanguage', { language: t(`common.languages.${nextLocale}`) })}
      title={t('common.switchLanguage', { language: t(`common.languages.${nextLocale}`) })}
      className="gap-1.5"
    >
      <Languages className="size-4" />
      <span>{compact ? nextLocale.toUpperCase() : t(`common.languages.${nextLocale}`)}</span>
    </Button>
  )
}
