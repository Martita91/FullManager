import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { branding } from "@/lib/branding";
import { en } from "./locales/en";

export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = [DEFAULT_LOCALE] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * One shared i18next instance for both SSR and the browser. Adding a language
 * later means adding a `resources` entry and a locale file — no component
 * changes, because no component holds literal text.
 */
export function initI18n() {
  if (i18n.isInitialized) return i18n;

  void i18n.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    defaultNS: "translation",
    resources: {
      [DEFAULT_LOCALE]: { translation: en },
    },
    interpolation: {
      // React already escapes anything it renders.
      escapeValue: false,
      defaultVariables: {
        // So every string can say {{productName}} without each call site
        // remembering to pass it.
        productName: branding.productName,
      },
    },
  });

  return i18n;
}

export default i18n;
