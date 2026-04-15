import React, { createContext, useContext, useState } from 'react'

export type Language = 'en' | 'ru' | 'fr' | 'pt'

export interface LanguageOption {
  code: Language
  label: string
  nativeLabel: string
  flag: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English',    nativeLabel: 'English',    flag: '🇬🇧' },
  { code: 'ru', label: 'Russian',    nativeLabel: 'Русский',    flag: '🇷🇺' },
  { code: 'fr', label: 'French',     nativeLabel: 'Français',   flag: '🇫🇷' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português',  flag: '🇵🇹' },
]

// ── Translations ────────────────────────────────────────────────────────────
type TranslationKey =
  | 'dashboard' | 'currencyPairs' | 'paymentMethods' | 'cardholders'
  | 'cardholderActivity' | 'orders' | 'allTransactions' | 'userManagement'
  | 'agentManagement' | 'auraChat' | 'auraWallet' | 'currencyAssignments'
  | 'notifications' | 'userDashboard' | 'myProfile' | 'settings'
  | 'language' | 'appSettings' | 'chooseLanguage' | 'languageDesc'
  | 'saved' | 'saveChanges' | 'deliveryOptions'

type Translations = Record<TranslationKey, string>
type TranslationMap = Record<Language, Translations>

export const translations: TranslationMap = {
  en: {
    dashboard: 'Dashboard',
    currencyPairs: 'Currency Pairs',
    paymentMethods: 'Payment Methods',
    cardholders: 'Cardholders',
    cardholderActivity: 'Cardholder Activity',
    orders: 'Orders',
    allTransactions: 'All Transactions',
    userManagement: 'User Management',
    agentManagement: 'Agent Management',
    auraChat: 'AuraChat',
    auraWallet: 'AuraWallet',
    currencyAssignments: 'Currency Assignments',
    notifications: 'Notifications',
    userDashboard: 'User Dashboard',
    myProfile: 'My Profile',
    settings: 'Settings',
    language: 'Language',
    appSettings: 'App Settings',
    chooseLanguage: 'Choose Language',
    languageDesc: 'Select the language used across the admin dashboard.',
    saved: 'Saved!',
    saveChanges: 'Save Changes',
    deliveryOptions: 'Delivery Options',
  },
  ru: {
    dashboard: 'Главная',
    currencyPairs: 'Валютные пары',
    paymentMethods: 'Способы оплаты',
    cardholders: 'Держатели карт',
    cardholderActivity: 'Активность держателей',
    orders: 'Заказы',
    allTransactions: 'Все транзакции',
    userManagement: 'Пользователи',
    agentManagement: 'Агенты',
    auraChat: 'АураЧат',
    auraWallet: 'АураКошелёк',
    currencyAssignments: 'Валютные назначения',
    notifications: 'Уведомления',
    userDashboard: 'Панель пользователя',
    myProfile: 'Мой профиль',
    settings: 'Настройки',
    language: 'Язык',
    appSettings: 'Настройки приложения',
    chooseLanguage: 'Выберите язык',
    languageDesc: 'Выберите язык интерфейса панели администратора.',
    saved: 'Сохранено!',
    saveChanges: 'Сохранить изменения',
    deliveryOptions: 'Параметры доставки',
  },
  fr: {
    dashboard: 'Tableau de bord',
    currencyPairs: 'Paires de devises',
    paymentMethods: 'Méthodes de paiement',
    cardholders: 'Titulaires de carte',
    cardholderActivity: 'Activité des titulaires',
    orders: 'Commandes',
    allTransactions: 'Toutes les transactions',
    userManagement: 'Gestion des utilisateurs',
    agentManagement: 'Gestion des agents',
    auraChat: 'AuraChat',
    auraWallet: 'AuraWallet',
    currencyAssignments: 'Affectations de devises',
    notifications: 'Notifications',
    userDashboard: 'Tableau utilisateur',
    myProfile: 'Mon profil',
    settings: 'Paramètres',
    language: 'Langue',
    appSettings: 'Paramètres de l\'application',
    chooseLanguage: 'Choisir la langue',
    languageDesc: 'Sélectionnez la langue utilisée dans le tableau de bord administrateur.',
    saved: 'Enregistré !',
    saveChanges: 'Enregistrer',
    deliveryOptions: 'Options de livraison',
  },
  pt: {
    dashboard: 'Painel',
    currencyPairs: 'Pares de moedas',
    paymentMethods: 'Métodos de pagamento',
    cardholders: 'Titulares de cartão',
    cardholderActivity: 'Atividade dos titulares',
    orders: 'Pedidos',
    allTransactions: 'Todas as transações',
    userManagement: 'Gestão de utilizadores',
    agentManagement: 'Gestão de agentes',
    auraChat: 'AuraChat',
    auraWallet: 'AuraWallet',
    currencyAssignments: 'Atribuições de moedas',
    notifications: 'Notificações',
    userDashboard: 'Painel do utilizador',
    myProfile: 'Meu perfil',
    settings: 'Configurações',
    language: 'Idioma',
    appSettings: 'Configurações do aplicativo',
    chooseLanguage: 'Escolher idioma',
    languageDesc: 'Selecione o idioma utilizado no painel de administração.',
    saved: 'Salvo!',
    saveChanges: 'Salvar alterações',
    deliveryOptions: 'Opções de entrega',
  },
}

// ── Context ──────────────────────────────────────────────────────────────────
interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
})

const STORAGE_KEY = 'aura_admin_language'

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && ['en', 'ru', 'fr', 'pt'].includes(stored)) return stored as Language
    return 'en'
  })

  const setLanguage = (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang)
    setLanguageState(lang)
  }

  const t = (key: TranslationKey): string => {
    return translations[language]?.[key] ?? translations.en[key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
