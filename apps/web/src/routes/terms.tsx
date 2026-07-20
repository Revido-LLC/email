import { createFileRoute } from '@tanstack/react-router'
import { useLocale } from '@/lib/app-state'
import { LegalPage, type LegalPageCopy } from '@/components/legal/legal-page'

export const Route = createFileRoute('/terms')({
  component: TermsPage,
})

const copy: Record<'en' | 'nl', LegalPageCopy> = {
  en: {
    eyebrow: 'Terms of use',
    title: 'Clear rules for a capable inbox.',
    introduction:
      'These terms govern your use of Revido Mail. By connecting an account or using the service, you agree to them.',
    updated: 'Effective and last updated: July 20, 2026',
    contents: 'On this page',
    back: 'Back to Revido Mail',
    promises: [
      { value: 'You decide', label: 'Which accounts and agents are enabled' },
      { value: 'Review first', label: 'AI can make mistakes' },
      { value: 'Leave anytime', label: 'Disconnect and delete your data' },
    ],
    sections: [
      {
        id: 'service',
        title: '1. The service',
        paragraphs: [
          'Revido Mail connects to supported email providers and offers synchronization, search, organization, AI-assisted summaries and drafting, reminders, and optional automations. Features may change as the product develops.',
        ],
      },
      {
        id: 'eligibility',
        title: '2. Eligibility and accounts',
        bullets: [
          'You must be at least 16 and legally able to agree to these terms.',
          'You must provide accurate account information and protect access to your account.',
          'You may connect only mailboxes you own or are authorized to manage.',
          'You are responsible for activity performed through your account and for promptly reporting unauthorized access.',
        ],
      },
      {
        id: 'permissions',
        title: '3. Mailbox permissions',
        paragraphs: [
          'When you connect Google or Microsoft, you authorize Revido Mail to use the permissions shown in the provider consent screen. Depending on enabled features, this can include reading, organizing, modifying, and sending mail. We use those permissions only to provide features you request or enable.',
          'You can revoke access through Revido Mail or your email provider. Revoking access can prevent mailbox features from working.',
        ],
      },
      {
        id: 'ai',
        title: '4. AI features and automations',
        paragraphs: [
          'AI output can be incomplete, inaccurate, or inappropriate. Review important summaries, extracted facts, recipients, attachments, and drafts before relying on or sending them. Revido Mail is not a substitute for legal, financial, medical, or other professional advice.',
          'You control which optional agents and automations are enabled. You remain responsible for actions approved, configured, or sent through your account.',
        ],
      },
      {
        id: 'acceptable-use',
        title: '5. Acceptable use',
        bullets: [
          'Do not use the service for unlawful activity, fraud, harassment, malware, phishing, or unsolicited bulk messaging.',
          'Do not access another person’s mailbox without authorization.',
          'Do not interfere with the service, bypass security or usage controls, scrape it excessively, or attempt to discover another user’s data.',
          'Do not use AI features to violate rights, confidentiality obligations, sanctions, or applicable provider rules.',
        ],
      },
      {
        id: 'third-parties',
        title: '6. Third-party services',
        paragraphs: [
          'Revido Mail depends on services provided by Google, Microsoft, AI providers, hosting providers, and other vendors. Their own terms and availability also apply. We are not responsible for changes, suspensions, or outages controlled by those providers.',
        ],
      },
      {
        id: 'ownership',
        title: '7. Ownership and feedback',
        paragraphs: [
          'You retain your rights in your email and other content. These terms give Revido only the limited rights needed to process that content and operate the service.',
          'Revido and its licensors retain rights in the service, branding, and non-open-source components. If you provide feedback, you allow us to use it without restriction or compensation. Open-source components remain governed by their licenses.',
        ],
      },
      {
        id: 'availability',
        title: '8. Availability, suspension, and termination',
        paragraphs: [
          'We may change, limit, suspend, or discontinue features for security, legal, operational, or product reasons. We may suspend access when we reasonably believe an account creates risk or violates these terms.',
          'You can stop using Revido Mail at any time and disconnect your accounts. Provisions that by their nature should survive termination—including ownership, disclaimers, and liability limits—continue to apply.',
        ],
      },
      {
        id: 'disclaimers',
        title: '9. Disclaimers and liability',
        paragraphs: [
          'To the extent permitted by law, Revido Mail is provided “as is” and “as available,” without implied guarantees of uninterrupted operation, error-free AI output, or fitness for a particular purpose.',
          'To the extent permitted by law, Revido is not liable for indirect, incidental, special, consequential, or punitive loss, lost profits, lost opportunities, or loss caused by decisions based on AI output. Nothing in these terms excludes liability that cannot legally be excluded or your mandatory consumer rights.',
        ],
      },
      {
        id: 'changes',
        title: '10. Changes and contact',
        paragraphs: [
          'We may update these terms as the service or law changes. The revised version will be posted here, and material changes will be highlighted when appropriate. Continuing to use the service after an update means the revised terms apply.',
          'Questions about these terms can be submitted through the Talk to Revido page on this website.',
        ],
      },
    ],
  },
  nl: {
    eyebrow: 'Gebruiksvoorwaarden',
    title: 'Duidelijke regels voor een krachtige inbox.',
    introduction:
      'Deze voorwaarden gelden voor het gebruik van Revido Mail. Door een account te koppelen of de dienst te gebruiken ga je ermee akkoord.',
    updated: 'Van kracht en laatst bijgewerkt: 20 juli 2026',
    contents: 'Op deze pagina',
    back: 'Terug naar Revido Mail',
    promises: [
      { value: 'Jij bepaalt', label: 'Welke accounts en agents actief zijn' },
      { value: 'Eerst controleren', label: 'AI kan fouten maken' },
      { value: 'Altijd vertrekken', label: 'Loskoppelen en gegevens verwijderen' },
    ],
    sections: [
      {
        id: 'dienst',
        title: '1. De dienst',
        paragraphs: [
          'Revido Mail koppelt ondersteunde e-mailproviders en biedt synchronisatie, zoeken, ordening, AI-samenvattingen en concepten, herinneringen en optionele automatiseringen. Functies kunnen veranderen terwijl het product zich ontwikkelt.',
        ],
      },
      {
        id: 'toegang',
        title: '2. Toegang en accounts',
        bullets: [
          'Je bent minimaal 16 jaar en mag juridisch met deze voorwaarden instemmen.',
          'Je verstrekt juiste accountgegevens en beveiligt de toegang tot je account.',
          'Je koppelt alleen mailboxen die van jou zijn of die je bevoegd beheert.',
          'Je bent verantwoordelijk voor activiteit via je account en meldt ongeoorloofde toegang zo snel mogelijk.',
        ],
      },
      {
        id: 'machtigingen',
        title: '3. Mailboxmachtigingen',
        paragraphs: [
          'Wanneer je Google of Microsoft koppelt, geef je Revido Mail toestemming voor de machtigingen in het toestemmingsscherm van de provider. Afhankelijk van ingeschakelde functies kan dit lezen, ordenen, wijzigen en verzenden van e-mail omvatten. We gebruiken die machtigingen alleen voor functies die je gebruikt of inschakelt.',
          'Je kunt de toegang intrekken via Revido Mail of je e-mailprovider. Daarna werken mailboxfuncties mogelijk niet meer.',
        ],
      },
      {
        id: 'ai',
        title: '4. AI-functies en automatiseringen',
        paragraphs: [
          'AI-uitvoer kan onvolledig, onjuist of ongepast zijn. Controleer belangrijke samenvattingen, feiten, ontvangers, bijlagen en concepten voordat je erop vertrouwt of ze verzendt. Revido Mail vervangt geen juridisch, financieel, medisch of ander professioneel advies.',
          'Jij bepaalt welke optionele agents en automatiseringen actief zijn. Je blijft verantwoordelijk voor acties die via je account zijn goedgekeurd, ingesteld of verzonden.',
        ],
      },
      {
        id: 'gebruik',
        title: '5. Toegestaan gebruik',
        bullets: [
          'Gebruik de dienst niet voor illegale activiteiten, fraude, intimidatie, malware, phishing of ongevraagde bulkmail.',
          'Open geen mailbox van iemand anders zonder toestemming.',
          'Verstoor de dienst niet, omzeil geen beveiliging of gebruikslimieten en probeer geen gegevens van andere gebruikers te achterhalen.',
          'Gebruik AI-functies niet om rechten, geheimhoudingsplichten, sancties of providerregels te schenden.',
        ],
      },
      {
        id: 'derden',
        title: '6. Diensten van derden',
        paragraphs: [
          'Revido Mail is afhankelijk van Google, Microsoft, AI-leveranciers, hostingproviders en andere leveranciers. Hun voorwaarden en beschikbaarheid gelden eveneens. Wij zijn niet verantwoordelijk voor wijzigingen, blokkades of storingen die door deze leveranciers worden beheerd.',
        ],
      },
      {
        id: 'eigendom',
        title: '7. Eigendom en feedback',
        paragraphs: [
          'Je behoudt je rechten op e-mail en andere inhoud. Deze voorwaarden geven Revido alleen de beperkte rechten die nodig zijn om die inhoud te verwerken en de dienst te leveren.',
          'Revido en zijn licentiegevers behouden rechten op de dienst, branding en niet-open-source onderdelen. Feedback mogen we zonder beperking of vergoeding gebruiken. Open-source onderdelen blijven onder hun eigen licenties vallen.',
        ],
      },
      {
        id: 'beschikbaarheid',
        title: '8. Beschikbaarheid, opschorting en beëindiging',
        paragraphs: [
          'We kunnen functies wijzigen, beperken, opschorten of beëindigen om beveiligings-, juridische, operationele of productredenen. We kunnen toegang opschorten wanneer een account naar ons redelijke oordeel risico veroorzaakt of deze voorwaarden schendt.',
          'Je kunt altijd stoppen en accounts loskoppelen. Bepalingen die naar hun aard moeten blijven gelden, waaronder eigendom, disclaimers en aansprakelijkheidsbeperkingen, blijven van kracht.',
        ],
      },
      {
        id: 'aansprakelijkheid',
        title: '9. Disclaimers en aansprakelijkheid',
        paragraphs: [
          'Voor zover wettelijk toegestaan wordt Revido Mail geleverd “zoals het is” en “zoals beschikbaar”, zonder impliciete garanties op ononderbroken werking, foutloze AI-uitvoer of geschiktheid voor een bepaald doel.',
          'Voor zover wettelijk toegestaan is Revido niet aansprakelijk voor indirecte, incidentele, bijzondere, gevolg- of strafschade, winstderving, gemiste kansen of verlies door beslissingen op basis van AI-uitvoer. Niets sluit aansprakelijkheid uit die wettelijk niet kan worden uitgesloten of beperkt verplichte consumentenrechten.',
        ],
      },
      {
        id: 'wijzigingen',
        title: '10. Wijzigingen en contact',
        paragraphs: [
          'We kunnen deze voorwaarden aanpassen wanneer de dienst of wet verandert. De nieuwe versie verschijnt hier en belangrijke wijzigingen lichten we waar passend uit. Als je de dienst daarna blijft gebruiken, gelden de aangepaste voorwaarden.',
          'Vragen over deze voorwaarden kun je indienen via de pagina Praat met Revido op deze website.',
        ],
      },
    ],
  },
}

function TermsPage() {
  const { locale } = useLocale()
  return <LegalPage copy={copy[locale]} />
}
