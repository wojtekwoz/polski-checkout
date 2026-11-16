const pl = {
  title: "Zamówienie",
  email: "E-mail",
  firstName: "Imię",
  lastName: "Nazwisko",
  wantsInvoice: "Chcę fakturę na firmę",
  nip: "NIP",
  nipHint: "Wpisz NIP, a dane firmy uzupełnimy z białej listy VAT.",
  nipLookup: "Pobierz dane",
  nipLooking: "Szukam…",
  nipFound: "Dane pobrane z rejestru ({source}). Sprawdź, czy się zgadzają.",
  nipNotFound: "Nie znaleźliśmy firmy w rejestrze. Uzupełnij dane ręcznie.",
  nipLookupFailed: "Rejestr chwilowo nie odpowiada. Uzupełnij dane ręcznie.",
  nipInvalid: "Niepoprawny NIP (sprawdź cyfry).",
  vatInactive: "Uwaga: status VAT tej firmy to „{status}”.",
  companyName: "Nazwa firmy",
  addressCompany: "Adres firmy",
  addressPerson: "Adres",
  street: "Ulica i numer",
  postalCode: "Kod pocztowy",
  city: "Miejscowość",
  country: "Kraj",
  acceptTerms: "Akceptuję regulamin i politykę prywatności",
  terms: "regulamin",
  pay: "Przejdź do płatności",
  paying: "Przekierowuję do płatności…",
  promoInfo: "Kod rabatowy wpiszesz na następnym kroku.",
  perMonth: "/ mies.",
  perYear: "/ rok",
  perWeek: "/ tydz.",
  perDay: "/ dzień",
  oneTime: "płatność jednorazowa",
  grossNote: "Cena brutto",
  required: "To pole jest wymagane.",
  invalid: "Niepoprawna wartość.",
  invalidPostcode: "Kod pocztowy w formacie 00-000.",
  errorGeneric: "Coś poszło nie tak. Spróbuj ponownie.",
  successTitle: "Dziękujemy za zakup!",
  successBody: "Płatność przyjęta. Potwierdzenie i dostęp wyślemy na Twój e-mail.",
  cancelTitle: "Płatność przerwana",
  cancelBody: "Nic nie zostało pobrane. Możesz wrócić do zamówienia.",
  backToCheckout: "Wróć do zamówienia",
  products: "Produkty",
  securedBy: "Płatność obsługuje Stripe. Nie przechowujemy danych kart.",
  countryPL: "Polska",
  countryOther: "Inny kraj (kod ISO, np. DE)",
};

export type Dict = typeof pl;

const en: Dict = {
  title: "Checkout",
  email: "Email",
  firstName: "First name",
  lastName: "Last name",
  wantsInvoice: "I need a VAT invoice for my company",
  nip: "Polish tax ID (NIP)",
  nipHint: "Enter your NIP and we will fill in company details from the VAT White List.",
  nipLookup: "Fetch details",
  nipLooking: "Looking up…",
  nipFound: "Details fetched from the registry ({source}). Please double-check them.",
  nipNotFound: "Company not found in the registry. Please fill in the details manually.",
  nipLookupFailed: "The registry is not responding. Please fill in the details manually.",
  nipInvalid: "Invalid NIP (check the digits).",
  vatInactive: "Note: this company's VAT status is “{status}”.",
  companyName: "Company name",
  addressCompany: "Company address",
  addressPerson: "Address",
  street: "Street and number",
  postalCode: "Postal code",
  city: "City",
  country: "Country",
  acceptTerms: "I accept the terms and privacy policy",
  terms: "terms",
  pay: "Continue to payment",
  paying: "Redirecting to payment…",
  promoInfo: "You can enter a promo code on the next step.",
  perMonth: "/ month",
  perYear: "/ year",
  perWeek: "/ week",
  perDay: "/ day",
  oneTime: "one-time payment",
  grossNote: "Gross price",
  required: "This field is required.",
  invalid: "Invalid value.",
  invalidPostcode: "Postal code format: 00-000.",
  errorGeneric: "Something went wrong. Please try again.",
  successTitle: "Thank you for your purchase!",
  successBody: "Payment received. We will email you the confirmation and access.",
  cancelTitle: "Payment cancelled",
  cancelBody: "You have not been charged. You can go back to checkout.",
  backToCheckout: "Back to checkout",
  products: "Products",
  securedBy: "Payments are processed by Stripe. We never store card data.",
  countryPL: "Poland",
  countryOther: "Other country (ISO code, e.g. DE)",
};

export const dictionaries = { pl, en } as const;
export type Locale = keyof typeof dictionaries;
export const locales = Object.keys(dictionaries) as Locale[];

export function resolveLocale(input?: string | string[] | null): Locale {
  const v = Array.isArray(input) ? input[0] : input;
  if (v && (locales as string[]).includes(v)) return v as Locale;
  const env = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  if (env && (locales as string[]).includes(env)) return env as Locale;
  return "pl";
}

export function t(dict: Dict, key: keyof Dict, vars: Record<string, string> = {}): string {
  return dict[key].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}
