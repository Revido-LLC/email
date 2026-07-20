import { createFileRoute } from '@tanstack/react-router'
import { useLocale } from '@/lib/app-state'
import { LegalPage, type LegalPageCopy } from '@/components/legal/legal-page'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

const copy: Record<'en' | 'nl', LegalPageCopy> = {
  en: {
    eyebrow: 'Privacy policy',
    title: 'Your inbox stays yours.',
    introduction:
      'This policy explains what Revido Mail processes, why we need it, and the controls you have over your information.',
    updated: 'Effective and last updated: July 20, 2026',
    contents: 'On this page',
    back: 'Back to Revido Mail',
    promises: [
      { value: '30 days', label: 'Imported when you first connect' },
      { value: 'Encrypted', label: 'Mailbox content at rest' },
      { value: 'Your choice', label: 'Disconnect and delete anytime' },
    ],
    sections: [
      {
        id: 'who-we-are',
        title: '1. Who we are',
        paragraphs: [
          'Revido operates Revido Mail, an AI-assisted email client available at email.revido.co. For privacy questions or requests, contact us through the Talk to Revido page on this website.',
        ],
      },
      {
        id: 'information',
        title: '2. Information we process',
        bullets: [
          'Account information such as your name, email address, profile image, language, and appearance preferences.',
          'OAuth credentials from Google or Microsoft. Refresh tokens are encrypted and used only to keep your connected mailbox synchronized.',
          'Mailbox data needed to provide the service, including messages, threads, participants, attachments, labels, dates, and mailbox actions.',
          'AI-generated information such as categories, summaries, suggested replies, extracted facts, reminders, and semantic-search vectors.',
          'Security, reliability, and product-usage events. Product analytics are designed not to include raw message bodies.',
          'Information you submit when you contact Revido.',
        ],
      },
      {
        id: 'how-we-use-it',
        title: '3. How we use information',
        bullets: [
          'Connect, synchronize, search, organize, display, and send email at your direction.',
          'Triage messages, create summaries and drafts, surface commitments, and run automations you enable.',
          'Authenticate users, protect accounts, prevent abuse, diagnose failures, and maintain the service.',
          'Understand product performance using content-free operational and analytics events.',
          'Comply with legal obligations and enforce our terms.',
        ],
      },
      {
        id: 'mailbox-window',
        title: '4. Mailbox import and retention',
        paragraphs: [
          'When you first connect a mailbox, Revido Mail imports only the preceding 30 days. After that, it keeps synchronizing new messages while the account remains connected. The 30-day limit applies to the initial import; messages synchronized afterward can remain in your Revido Mail account until you delete them or disconnect the mailbox.',
          'Disconnecting an account or using Delete everything removes the mailbox content and related indexes we control. Some limited records may remain temporarily where required for security, legal compliance, fraud prevention, or backup expiry.',
        ],
      },
      {
        id: 'ai-providers',
        title: '5. AI and service providers',
        paragraphs: [
          'We use specialist providers to operate Revido Mail. These currently include Railway for hosting, Google and Microsoft for mailbox access, OpenRouter and model providers for language processing, Voyage for embeddings, and Resend for transactional email. They receive only the information needed to perform their function.',
          'AI requests are configured for zero-data-retention or no-training processing where the provider supports it. We do not sell mailbox content or use it to train our own general-purpose AI model.',
        ],
      },
      {
        id: 'legal-bases',
        title: '6. Legal bases',
        paragraphs: [
          'Where data-protection law requires a legal basis, we process information to perform our agreement with you, based on your consent when you connect a mailbox or enable optional features, to meet legal obligations, and for legitimate interests such as security, reliability, and improving the service without using message content for advertising.',
        ],
      },
      {
        id: 'security',
        title: '7. Security and international transfers',
        paragraphs: [
          'Mailbox content is encrypted at rest using per-user key material. Access is limited to the systems and people who need it to operate or protect the service. No online service can guarantee absolute security.',
          'Our providers may process information in countries other than yours. Where required, we rely on recognized transfer mechanisms and contractual protections.',
        ],
      },
      {
        id: 'rights',
        title: '8. Your choices and rights',
        bullets: [
          'Disconnect a mailbox or delete stored mailbox data from Settings.',
          'Revoke Revido Mail access from your Google or Microsoft account settings.',
          'Request access, correction, deletion, restriction, portability, or an objection where applicable law provides those rights.',
          'Withdraw consent without affecting processing that occurred before withdrawal.',
          'Complain to your local data-protection authority.',
        ],
      },
      {
        id: 'changes',
        title: '9. Children and policy changes',
        paragraphs: [
          'Revido Mail is not directed to children under 16. We may update this policy as the product or law changes. We will post the revised version here and highlight material changes when appropriate.',
        ],
      },
    ],
  },
  nl: {
    eyebrow: 'Privacybeleid',
    title: 'Jouw inbox blijft van jou.',
    introduction:
      'Dit beleid legt uit welke gegevens Revido Mail verwerkt, waarom dat nodig is en welke controle jij daarover hebt.',
    updated: 'Van kracht en laatst bijgewerkt: 20 juli 2026',
    contents: 'Op deze pagina',
    back: 'Terug naar Revido Mail',
    promises: [
      { value: '30 dagen', label: 'Geïmporteerd bij de eerste koppeling' },
      { value: 'Versleuteld', label: 'Mailboxinhoud in opslag' },
      { value: 'Jouw keuze', label: 'Altijd loskoppelen en verwijderen' },
    ],
    sections: [
      {
        id: 'wie-we-zijn',
        title: '1. Wie we zijn',
        paragraphs: [
          'Revido beheert Revido Mail, een AI-ondersteunde e-mailclient op email.revido.co. Neem voor privacyvragen of verzoeken contact op via de pagina Praat met Revido op deze website.',
        ],
      },
      {
        id: 'gegevens',
        title: '2. Gegevens die we verwerken',
        bullets: [
          'Accountgegevens zoals naam, e-mailadres, profielfoto, taal en weergavevoorkeuren.',
          'OAuth-inloggegevens van Google of Microsoft. Vernieuwingstokens worden versleuteld en alleen gebruikt om je gekoppelde mailbox te synchroniseren.',
          'Mailboxgegevens die nodig zijn voor de dienst, waaronder berichten, gesprekken, deelnemers, bijlagen, labels, datums en mailboxacties.',
          'Door AI gegenereerde gegevens zoals categorieën, samenvattingen, antwoordsuggesties, feiten, herinneringen en vectoren voor semantisch zoeken.',
          'Beveiligings-, betrouwbaarheids- en gebruiksgebeurtenissen. Productanalyse is ontworpen om geen ruwe berichtinhoud te bevatten.',
          'Informatie die je verstrekt wanneer je contact opneemt met Revido.',
        ],
      },
      {
        id: 'gebruik',
        title: '3. Hoe we gegevens gebruiken',
        bullets: [
          'E-mail koppelen, synchroniseren, zoeken, ordenen, tonen en op jouw verzoek verzenden.',
          'Berichten triageren, samenvattingen en concepten maken, afspraken signaleren en ingeschakelde automatiseringen uitvoeren.',
          'Gebruikers authenticeren, accounts beschermen, misbruik voorkomen, fouten onderzoeken en de dienst onderhouden.',
          'Productprestaties begrijpen met operationele en analytische gebeurtenissen zonder inhoud.',
          'Voldoen aan wettelijke verplichtingen en onze voorwaarden handhaven.',
        ],
      },
      {
        id: 'mailboxperiode',
        title: '4. Mailboximport en bewaartermijn',
        paragraphs: [
          'Wanneer je een mailbox voor het eerst koppelt, importeert Revido Mail alleen de voorafgaande 30 dagen. Daarna blijven nieuwe berichten synchroniseren zolang het account gekoppeld is. De limiet van 30 dagen geldt voor de eerste import; later gesynchroniseerde berichten kunnen blijven staan totdat je ze verwijdert of de mailbox loskoppelt.',
          'Bij loskoppelen of Alles verwijderen wissen we de mailboxinhoud en gerelateerde indexen die wij beheren. Beperkte gegevens kunnen tijdelijk blijven bestaan wanneer dat nodig is voor beveiliging, wettelijke naleving, fraudepreventie of het verlopen van back-ups.',
        ],
      },
      {
        id: 'leveranciers',
        title: '5. AI- en dienstverleners',
        paragraphs: [
          'We gebruiken gespecialiseerde leveranciers om Revido Mail te leveren. Dat zijn momenteel Railway voor hosting, Google en Microsoft voor mailboxtoegang, OpenRouter en modelleveranciers voor taalverwerking, Voyage voor embeddings en Resend voor transactionele e-mail. Zij ontvangen alleen wat nodig is voor hun taak.',
          'AI-verzoeken worden waar ondersteund ingesteld op verwerking zonder gegevensbewaring of training. We verkopen mailboxinhoud niet en gebruiken die niet om ons eigen algemene AI-model te trainen.',
        ],
      },
      {
        id: 'grondslagen',
        title: '6. Juridische grondslagen',
        paragraphs: [
          'Waar de wet een grondslag vereist, verwerken we gegevens om onze overeenkomst uit te voeren, op basis van toestemming wanneer je een mailbox koppelt of optionele functies inschakelt, om wettelijke verplichtingen na te komen en voor gerechtvaardigde belangen zoals beveiliging, betrouwbaarheid en productverbetering zonder berichtinhoud voor advertenties te gebruiken.',
        ],
      },
      {
        id: 'beveiliging',
        title: '7. Beveiliging en internationale doorgifte',
        paragraphs: [
          'Mailboxinhoud wordt in opslag versleuteld met sleutelmateriaal per gebruiker. Toegang is beperkt tot systemen en mensen die de dienst moeten leveren of beschermen. Geen enkele online dienst kan absolute veiligheid garanderen.',
          'Onze leveranciers kunnen gegevens buiten jouw land verwerken. Waar vereist gebruiken we erkende doorgiftemechanismen en contractuele waarborgen.',
        ],
      },
      {
        id: 'rechten',
        title: '8. Jouw keuzes en rechten',
        bullets: [
          'Een mailbox loskoppelen of opgeslagen mailboxgegevens verwijderen via Instellingen.',
          'De toegang van Revido Mail intrekken via je Google- of Microsoft-account.',
          'Verzoeken om inzage, correctie, verwijdering, beperking, overdraagbaarheid of bezwaar waar de wet dat recht geeft.',
          'Toestemming intrekken zonder gevolgen voor eerdere rechtmatige verwerking.',
          'Een klacht indienen bij je lokale privacytoezichthouder.',
        ],
      },
      {
        id: 'wijzigingen',
        title: '9. Kinderen en wijzigingen',
        paragraphs: [
          'Revido Mail is niet gericht op kinderen jonger dan 16 jaar. We kunnen dit beleid aanpassen wanneer het product of de wet verandert. De nieuwe versie verschijnt hier; belangrijke wijzigingen lichten we waar passend uit.',
        ],
      },
    ],
  },
}

function PrivacyPage() {
  const { locale } = useLocale()
  return <LegalPage copy={copy[locale]} />
}
