import React, { useState } from 'react'
import { useLanguage, LANGUAGES, Language } from '../../context/LanguageContext'

const AppSettings: React.FC = () => {
  const { language, setLanguage, t } = useLanguage()
  const [selected, setSelected] = useState<Language>(language)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setLanguage(selected)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasChanged = selected !== language

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t('appSettings')}</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your admin dashboard preferences.</p>
      </div>

      {/* Language Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Section header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-sm">{t('chooseLanguage')}</h2>
              <p className="text-xs text-slate-500">{t('languageDesc')}</p>
            </div>
          </div>
        </div>

        {/* Language cards */}
        <div className="p-6 grid grid-cols-2 gap-3">
          {LANGUAGES.map(lang => {
            const isSelected = selected === lang.code
            return (
              <button
                key={lang.code}
                onClick={() => setSelected(lang.code)}
                className={`relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left group ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {/* Flag */}
                <span className="text-3xl leading-none">{lang.flag}</span>

                {/* Labels */}
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold text-sm ${isSelected ? 'text-sky-700' : 'text-slate-800'}`}>
                    {lang.nativeLabel}
                  </p>
                  <p className="text-xs text-slate-400">{lang.label}</p>
                </div>

                {/* Code badge */}
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase tracking-wide ${
                  isSelected ? 'bg-sky-200 text-sky-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {lang.code}
                </span>

                {/* Checkmark */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Save button */}
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!hasChanged && !saved}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              saved
                ? 'bg-green-500 text-white cursor-default'
                : hasChanged
                  ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {saved ? `✓ ${t('saved')}` : t('saveChanges')}
          </button>
          {hasChanged && !saved && (
            <p className="text-xs text-slate-500">Unsaved changes</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppSettings
