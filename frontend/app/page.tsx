'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage, type Language } from '../lib/language-context'

export default function Home() {
  const [config, setConfig] = useState<any>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const router = useRouter()
  const { language, setLanguage, t, labels } = useLanguage()

  useEffect(() => {
    const token = localStorage.getItem('token')
    setIsLoggedIn(!!token)

    fetch('http://localhost:3001/api/config')
      .then((res) => {
        if (res.ok) return res.json()
        throw new Error('No config')
      })
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [])

  const handleGetStarted = () => {
    router.push(isLoggedIn ? '/builder' : '/login')
  }

  const handleDocs = () => {
    router.push('/docs')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setIsLoggedIn(false)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900 transition-colors duration-500 dark:bg-[#0c0c0e] dark:text-gray-100">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-200 bg-white/80 px-8 py-5 backdrop-blur dark:border-gray-800 dark:bg-[#111114]/90">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tighter text-blue-600 animate-fade-in-up dark:text-blue-500">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-lg text-white">⚡</span>
          {t('appName')}
        </h1>

        <div className="flex items-center gap-4">
          <select
            value={language}
            onChange={e => setLanguage(e.target.value as Language)}
            className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm outline-none dark:border-gray-700 dark:bg-[#111114] dark:text-gray-200"
            aria-label={t('navLanguage')}
          >
            {(Object.entries(labels) as Array<[Language, string]>).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>

          {isLoggedIn ? (
            <>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('navWelcome')}</span>
              <button onClick={handleLogout} className="text-sm font-semibold text-gray-700 transition-colors hover:text-red-500 dark:text-gray-300 dark:hover:text-red-400">
                {t('navLogout')}
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="text-sm font-semibold text-gray-700 transition-colors hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400"
            >
              {t('navLoginSignup')}
            </button>
          )}

          <button
            onClick={handleDocs}
            className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Docs
          </button>

          <button
            onClick={handleGetStarted}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:scale-105 hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            {t('navGetStarted')}
          </button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <div className="animate-fade-in-up opacity-0">
          <div className="mb-6 inline-block rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {t('heroBadge')}
          </div>
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-gray-900 md:text-7xl dark:text-white">
            {t('heroTitleTop')} <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-500">
              {t('heroTitleHighlight')}
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-gray-500 md:text-xl dark:text-gray-400">
            {t('heroDescription')}
          </p>
        </div>

        <div className="flex gap-4 animate-fade-in-up opacity-0">
          <button
            onClick={handleGetStarted}
            className="rounded-full bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-1 hover:bg-blue-700 hover:shadow-xl dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {t('heroPrimaryCta')}
          </button>
          <button 
            onClick={handleDocs}
            className="rounded-full border-2 border-gray-200 px-8 py-4 text-lg font-bold text-gray-700 transition-all hover:-translate-y-1 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800"
          >
            {t('heroSecondaryCta')}
          </button>
        </div>

        <div className="mt-20 w-full max-w-4xl animate-fade-in-up overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl transition-transform duration-500 hover:scale-[1.02] dark:border-gray-800 dark:bg-[#151518]">
          <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-4 py-3 dark:bg-[#0a0a0c]">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <div className="ml-4 font-mono text-xs text-gray-400">config.json</div>
          </div>
          <div className="p-6 text-left font-mono text-sm text-gray-800 overflow-x-auto dark:text-gray-300">
            <pre><code>{`{
  "component": { "name": "App" },
  "state": [{ "name": "count", "initial": "0" }],
  "ui": {
    "type": "div",
    "children": [
      { "type": "h1", "text": "Hello World" },
      { "type": "button", "text": "Count: {count}" }
    ]
  }
}`}</code></pre>
          </div>
        </div>

        {config && (
          <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
            {isLoggedIn ? 'Config loaded' : 'Preview mode'}
          </div>
        )}
      </section>

      <footer className="border-t border-gray-200 bg-white py-8 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-[#0c0c0e]">
        {t('heroFooter')}
      </footer>
    </div>
  )
}