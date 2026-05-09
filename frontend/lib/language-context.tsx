'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type Language = 'en' | 'es' | 'fr' | 'de'

const STORAGE_KEY = 'appforge-language'

const translations = {
  en: {
    appName: 'AppForge',
    navWelcome: 'Welcome back',
    navLogout: 'Logout',
    navLoginSignup: 'Login / Sign Up',
    navGetStarted: 'Get Started',
    navLanguage: 'Language',
    heroBadge: 'Now in Public Beta 🚀',
    heroTitleTop: 'Build React Apps',
    heroTitleHighlight: 'from JSON',
    heroDescription: 'Generate full frontend applications using configuration-driven development. No boilerplate. Just pure logic mapped instantly to code.',
    heroPrimaryCta: 'Start Building Free',
    heroSecondaryCta: 'View Docs',
    heroFooter: 'Built with Config-Driven Development ⚡ &copy; 2026 AppForge',
    loginWelcomeBack: 'Welcome back',
    loginCreateAccount: 'Create an account',
    loginBackSubtitle: 'Enter your details to access your builders.',
    loginCreateSubtitle: 'Start building apps from JSON today.',
    loginEmail: 'Email',
    loginPassword: 'Password',
    loginSigningIn: 'Sign In',
    loginSigningUp: 'Sign Up',
    loginNoAccount: "Don't have an account? ",
    loginHaveAccount: 'Already have an account? ',
    loginSwitchToSignup: 'Sign up',
    loginSwitchToLogin: 'Log in',
    loginTitle: 'Log in',
    registerTitle: 'Register',
    registerSubtitle: 'Create your account to start building faster.',
    registerCta: 'Create account',
    languages: {
      en: 'English',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
    },
  },
  es: {
    appName: 'AppForge',
    navWelcome: 'Bienvenido de nuevo',
    navLogout: 'Cerrar sesión',
    navLoginSignup: 'Iniciar sesión / Registrarse',
    navGetStarted: 'Comenzar',
    navLanguage: 'Idioma',
    heroBadge: 'Ahora en beta pública 🚀',
    heroTitleTop: 'Crea apps React',
    heroTitleHighlight: 'desde JSON',
    heroDescription: 'Genera aplicaciones frontend completas usando desarrollo guiado por configuración. Sin boilerplate. Solo lógica pura convertida al instante en código.',
    heroPrimaryCta: 'Empezar gratis',
    heroSecondaryCta: 'Ver documentación',
    heroFooter: 'Hecho con desarrollo guiado por configuración ⚡ &copy; 2026 AppForge',
    loginWelcomeBack: 'Bienvenido de nuevo',
    loginCreateAccount: 'Crear una cuenta',
    loginBackSubtitle: 'Ingresa tus datos para acceder a tus constructores.',
    loginCreateSubtitle: 'Empieza a crear apps desde JSON hoy mismo.',
    loginEmail: 'Correo electrónico',
    loginPassword: 'Contraseña',
    loginSigningIn: 'Iniciar sesión',
    loginSigningUp: 'Registrarse',
    loginNoAccount: '¿No tienes una cuenta? ',
    loginHaveAccount: '¿Ya tienes una cuenta? ',
    loginSwitchToSignup: 'Regístrate',
    loginSwitchToLogin: 'Inicia sesión',
    loginTitle: 'Iniciar sesión',
    registerTitle: 'Registrarse',
    registerSubtitle: 'Crea tu cuenta para empezar más rápido.',
    registerCta: 'Crear cuenta',
    languages: {
      en: 'Inglés',
      es: 'Español',
      fr: 'Francés',
      de: 'Alemán',
    },
  },
  fr: {
    appName: 'AppForge',
    navWelcome: 'Bon retour',
    navLogout: 'Déconnexion',
    navLoginSignup: 'Connexion / Inscription',
    navGetStarted: 'Commencer',
    navLanguage: 'Langue',
    heroBadge: 'Maintenant en bêta publique 🚀',
    heroTitleTop: 'Créez des apps React',
    heroTitleHighlight: 'depuis du JSON',
    heroDescription: 'Générez des applications frontend complètes grâce au développement orienté configuration. Aucun boilerplate. Juste de la logique transformée instantanément en code.',
    heroPrimaryCta: 'Commencer gratuitement',
    heroSecondaryCta: 'Voir la documentation',
    heroFooter: 'Construit avec le développement orienté configuration ⚡ &copy; 2026 AppForge',
    loginWelcomeBack: 'Bon retour',
    loginCreateAccount: 'Créer un compte',
    loginBackSubtitle: 'Entrez vos informations pour accéder à vos outils.',
    loginCreateSubtitle: 'Commencez à créer des apps depuis JSON dès aujourd’hui.',
    loginEmail: 'E-mail',
    loginPassword: 'Mot de passe',
    loginSigningIn: 'Connexion',
    loginSigningUp: 'Inscription',
    loginNoAccount: 'Vous n’avez pas de compte ? ',
    loginHaveAccount: 'Vous avez déjà un compte ? ',
    loginSwitchToSignup: 'Inscrivez-vous',
    loginSwitchToLogin: 'Connectez-vous',
    loginTitle: 'Connexion',
    registerTitle: 'Inscription',
    registerSubtitle: 'Créez votre compte pour aller plus vite.',
    registerCta: 'Créer un compte',
    languages: {
      en: 'Anglais',
      es: 'Espagnol',
      fr: 'Français',
      de: 'Allemand',
    },
  },
  de: {
    appName: 'AppForge',
    navWelcome: 'Willkommen zurück',
    navLogout: 'Abmelden',
    navLoginSignup: 'Anmelden / Registrieren',
    navGetStarted: 'Loslegen',
    navLanguage: 'Sprache',
    heroBadge: 'Jetzt in öffentlicher Beta 🚀',
    heroTitleTop: 'Baue React-Apps',
    heroTitleHighlight: 'aus JSON',
    heroDescription: 'Erstelle vollständige Frontend-Anwendungen mit konfigurationsgesteuerter Entwicklung. Kein Boilerplate. Nur reine Logik, sofort zu Code umgesetzt.',
    heroPrimaryCta: 'Kostenlos starten',
    heroSecondaryCta: 'Dokumentation ansehen',
    heroFooter: 'Erstellt mit konfigurationsgesteuerter Entwicklung ⚡ &copy; 2026 AppForge',
    loginWelcomeBack: 'Willkommen zurück',
    loginCreateAccount: 'Konto erstellen',
    loginBackSubtitle: 'Gib deine Daten ein, um auf deine Builder zuzugreifen.',
    loginCreateSubtitle: 'Starte heute mit dem App-Building aus JSON.',
    loginEmail: 'E-Mail',
    loginPassword: 'Passwort',
    loginSigningIn: 'Anmelden',
    loginSigningUp: 'Registrieren',
    loginNoAccount: 'Noch kein Konto? ',
    loginHaveAccount: 'Schon ein Konto? ',
    loginSwitchToSignup: 'Registrieren',
    loginSwitchToLogin: 'Anmelden',
    loginTitle: 'Anmelden',
    registerTitle: 'Registrieren',
    registerSubtitle: 'Erstelle dein Konto, um schneller loszulegen.',
    registerCta: 'Konto erstellen',
    languages: {
      en: 'Englisch',
      es: 'Spanisch',
      fr: 'Französisch',
      de: 'Deutsch',
    },
  },
} as const

type StringTranslationKey = {
  [K in keyof typeof translations.en]: typeof translations.en[K] extends string ? K : never
}[keyof typeof translations.en]

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: StringTranslationKey) => string
  labels: Record<Language, string>
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'es' || stored === 'fr' || stored === 'de') {
      setLanguageState(stored)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key: StringTranslationKey) => translations[language][key] ?? translations.en[key] ?? key,
    labels: translations.en.languages,
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
