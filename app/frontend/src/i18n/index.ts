import i18n from "i18next"
import { initReactI18next, useTranslation } from "react-i18next"
import { enUS, sl as slLocale } from "date-fns/locale"

import { en } from "./en"
import { sl } from "./sl"

export const LANG_KEY = "shapers.lang"
export const LANGUAGES = ["en", "sl"] as const
export type Lang = (typeof LANGUAGES)[number]

function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === "en" || saved === "sl") return saved
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== "undefined" &&
    navigator.language?.toLowerCase().startsWith("sl")
    ? "sl"
    : "en"
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sl: { translation: sl } },
  lng: initialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

export function setLanguage(lng: Lang) {
  void i18n.changeLanguage(lng)
  try {
    localStorage.setItem(LANG_KEY, lng)
  } catch {
    /* per-browser convenience only */
  }
}

/** date-fns locale matching the current UI language. */
export function useDateLocale() {
  const { i18n: inst } = useTranslation()
  return inst.language?.startsWith("sl") ? slLocale : enUS
}

export default i18n
