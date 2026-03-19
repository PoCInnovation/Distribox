export const KEYBOARD_LAYOUTS = [
  { value: "", label: "None (VM default)" },
  { value: "en-us-qwerty", label: "English (US) - QWERTY" },
  { value: "en-gb-qwerty", label: "English (UK) - QWERTY" },
  { value: "fr-fr-azerty", label: "French - AZERTY" },
  { value: "fr-be-azerty", label: "French (Belgium) - AZERTY" },
  { value: "fr-ch-qwertz", label: "French (Switzerland) - QWERTZ" },
  { value: "de-de-qwertz", label: "German - QWERTZ" },
  { value: "de-ch-qwertz", label: "German (Switzerland) - QWERTZ" },
  { value: "es-es-qwerty", label: "Spanish - QWERTY" },
  { value: "es-latam-qwerty", label: "Spanish (Latin America) - QWERTY" },
  { value: "it-it-qwerty", label: "Italian - QWERTY" },
  { value: "pt-br-qwerty", label: "Portuguese (Brazil) - QWERTY" },
  { value: "pt-pt-qwerty", label: "Portuguese (Portugal) - QWERTY" },
  { value: "nl-nl-qwerty", label: "Dutch - QWERTY" },
  { value: "sv-se-qwerty", label: "Swedish - QWERTY" },
  { value: "da-dk-qwerty", label: "Danish - QWERTY" },
  { value: "nb-no-qwerty", label: "Norwegian - QWERTY" },
  { value: "fi-fi-qwerty", label: "Finnish - QWERTY" },
  { value: "pl-pl-qwerty", label: "Polish - QWERTY" },
  { value: "cs-cz-qwertz", label: "Czech - QWERTZ" },
  { value: "hu-hu-qwertz", label: "Hungarian - QWERTZ" },
  { value: "ro-ro-qwerty", label: "Romanian - QWERTY" },
  { value: "ru-ru-qwerty", label: "Russian - QWERTY" },
  { value: "ja-jp-qwerty", label: "Japanese - QWERTY" },
  { value: "ko-kr-qwerty", label: "Korean - QWERTY" },
  { value: "tr-tr-qwerty", label: "Turkish - QWERTY" },
];

export function getKeyboardLabel(value: string): string {
  return KEYBOARD_LAYOUTS.find((kb) => kb.value === value)?.label ?? value;
}
