'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage, type Language } from '../lib/language-context'
import { getBackendApiUrl } from '../lib/backend-url'

type AuthMode = 'login' | 'register'

interface AuthPageProps {
  mode: AuthMode
}

const modeConfig: Record<AuthMode, { titleKey: 'loginWelcomeBack' | 'loginCreateAccount'; subtitleKey: 'loginBackSubtitle' | 'loginCreateSubtitle'; actionKey: 'loginSigningIn' | 'loginSigningUp'; switchLabelKey: 'loginNoAccount' | 'loginHaveAccount'; switchActionKey: 'loginSwitchToSignup' | 'loginSwitchToLogin'; switchHref: string }> = {
  login: {
    titleKey: 'loginWelcomeBack',
    subtitleKey: 'loginBackSubtitle',
    actionKey: 'loginSigningIn',
    switchLabelKey: 'loginNoAccount',
    switchActionKey: 'loginSwitchToSignup',
    switchHref: '/register',
  },
  register: {
    titleKey: 'loginCreateAccount',
    subtitleKey: 'loginCreateSubtitle',
    actionKey: 'loginSigningUp',
    switchLabelKey: 'loginHaveAccount',
    switchActionKey: 'loginSwitchToLogin',
    switchHref: '/login',
  },
}

export default function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter()
  const { language, setLanguage, t, labels } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const config = modeConfig[mode]

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    const endpoint = mode === 'login'
      ? getBackendApiUrl('/api/login')
      : getBackendApiUrl('/api/register')

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()
      if (!response.ok) {
        if (data?.error && typeof data.error === 'object' && data.error.fieldErrors) {
          const messages = Object.entries(data.error.fieldErrors)
            .map(([field, fieldErrors]) => `${field}: ${(fieldErrors as string[]).join(', ')}`)
            .join(' | ')
          throw new Error(messages)
        }
        throw new Error(data.error || 'Authentication failed')
      }

      localStorage.setItem('token', data.token)
      router.push('/builder')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0c0c0e] px-4 transition-colors">
      <div className="absolute top-4 right-4 z-10">
        <select
          value={language}
          onChange={e => setLanguage(e.target.value as Language)}
          className="rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111114] px-3 py-2 text-sm text-gray-700 dark:text-gray-200 shadow-sm outline-none"
          aria-label={t('navLanguage')}
        >
          {(Object.entries(labels) as Array<[Language, string]>).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-[#151518] rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 p-8 transform transition-all animate-fade-in-up">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {t(config.titleKey)}
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            {t(config.subtitleKey)}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600 transition-all dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('loginEmail')}</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#0a0a0c] dark:text-white"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('loginPassword')}</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-[#0a0a0c] dark:text-white"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg bg-blue-600 py-2.5 font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {loading ? (
              <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              t(config.actionKey)
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          {t(config.switchLabelKey)}
          <button
            type="button"
            onClick={() => router.push(config.switchHref)}
            className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {t(config.switchActionKey)}
          </button>
        </div>
      </div>
    </div>
  )
}
