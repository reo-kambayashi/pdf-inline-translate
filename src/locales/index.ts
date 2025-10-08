import ja from "./ja.json";
import en from "./en.json";

const dictionaries = {
  ja,
  en
} as const;

export type LocaleKey = keyof typeof ja;
export type LocaleId = keyof typeof dictionaries;

export const DEFAULT_LOCALE: LocaleId = "ja";

const isLocaleKey = (key: string): key is LocaleKey => key in ja;

export const translate = (
  key: LocaleKey,
  locale: LocaleId = DEFAULT_LOCALE,
  replacements?: Record<string, string>
): string => {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const fallbackDictionary = dictionaries[DEFAULT_LOCALE];
  const template = (dictionary[key] ?? fallbackDictionary[key]) as string | undefined;
  if (!template) {
    return key;
  }
  if (!replacements) {
    return template;
  }
  return Object.entries(replacements).reduce(
    (acc, [replacementKey, value]) =>
      acc.replaceAll(`{{${replacementKey}}}`, value ?? ""),
    template
  );
};

export const validateLocaleKey = (key: string): key is LocaleKey => isLocaleKey(key);
