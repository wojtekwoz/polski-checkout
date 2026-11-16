# polski-checkout

**Self-hosted, open-source checkout for Polish sellers on Stripe.**
A pre-checkout form that validates the buyer's NIP, autofills company name and address from the
Ministry of Finance **VAT White List** (with an optional **GUS REGON** fallback), then hands off to
**Stripe Checkout** with all buyer data attached. After payment, a webhook runs pluggable hooks:
**grant access** (generic signed webhook) and **issue an invoice** (Fakturownia, iFirma).

Built for course creators, communities and small SaaS selling in Poland: the UX of Polish gateways
("Chcę fakturę na firmę" → NIP → data fills itself), with Stripe's payments, subscriptions and promo codes.

> 🇵🇱 Polska wersja opisu jest [niżej](#-po-polsku).

---

## Why

There are three common ways Polish creators handle B2B buyers who need a VAT invoice:

| | 1. Polish gateway (Easytools-style) | 2. Stripe Checkout + `tax_id_collection` | 3. **Own pre-checkout form → Stripe** (this project) |
|---|---|---|---|
| "Chcę fakturę" toggle + NIP autofill | ✅ | ❌ buyer types everything | ✅ White List / GUS |
| NIP checksum validation | ✅ | format only | ✅ |
| Structured PL address (ulica, kod, miasto) | ✅ | ✅ | ✅ |
| Subscriptions, promo codes, BLIK/P24 via Stripe | partly | ✅ | ✅ |
| Auto invoice to Fakturownia / iFirma | ✅ built in | needs Zapier/Make | ✅ built-in hooks |
| Platform fee on top of payments | usually yes | no | no |
| Own the code, change anything | ❌ | ❌ | ✅ MIT |

Option 1 is the least work but you are tied to the platform. Option 2 is what most people start with,
and then fix invoice data by hand. Option 3 needs a small app - this repo is that app.

## Features

- **Checkout page per product** - `/checkout/<id>`, configured in [`products.config.ts`](products.config.ts) or the `PRODUCTS_JSON` env var. One-time payments and subscriptions, existing Stripe Price ids or inline PLN prices.
- **Buyer form** - email, first/last name, *"Chcę fakturę na firmę"* toggle. Company: NIP with checksum validation and autofill. Private buyer: structured address (street, postcode, city, country).
- **Company lookup** - `GET /api/nip/:nip` → MF VAT White List (`wl-api.mf.gov.pl`, no key), optional GUS BIR 1.1 (REGON) fallback when the company is not on the list or the list is down. Shows a warning when the VAT status is not "Czynny". Public data only; small in-memory cache to save the daily White List quota.
- **Stripe** - creates a Customer with the address, `tax_ids` (`eu_vat`, `PL` + NIP) and metadata, then a Checkout Session (`allow_promotion_codes`, Polish locale). Buyer data is also copied to the PaymentIntent / Subscription metadata.
- **Webhook** - `POST /api/webhooks/stripe` with signature verification. Handles `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `invoice.paid` (renewals).
- **After-payment hooks** - each runs once per payment (idempotency markers stored in Stripe metadata, no database), failures are retried by Stripe without re-running hooks that already succeeded:
  - **Access webhook** - POSTs JSON to any URL (Zapier, Make, n8n, your LMS), optionally signed with HMAC-SHA256.
  - **Invoicing** - Fakturownia and iFirma adapters behind a small `InvoicingAdapter` interface.
- **i18n** - Polish by default, English included (`?lang=en`); add a language by adding a dictionary in `src/lib/i18n.ts`.
- **No secrets, no database** - the app stores nothing; buyer data lives in Stripe (and your invoicing tool).

## How it works

```
buyer ──► /checkout/kurs ──(NIP)──► /api/nip/5260250995 ──► MF White List ─(fallback)─► GUS BIR
             │ form validated on client AND server
             ▼
        /api/checkout ──► Stripe: Customer (address, tax_id PL…, metadata) + Checkout Session
             ▼
        Stripe Checkout (card, BLIK, P24, promo codes…)
             ▼
        /api/webhooks/stripe ──► hooks: access webhook → your LMS / Zapier
                                        invoice      → Fakturownia / iFirma
```

## Quick start

```bash
git clone https://github.com/wojtekwoz/polski-checkout.git
cd polski-checkout
npm install
cp .env.example .env.local    # add STRIPE_SECRET_KEY (test key) at minimum
npm run dev                   # http://localhost:3000/checkout/kurs-demo
```

Forward webhooks locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET
```

Run checks:

```bash
npm test          # unit tests (NIP, White List/GUS mapping with mocked HTTP, buyer, Stripe params, hooks, invoices)
npm run typecheck
npm run build
```

## Configuration

### Products

Edit [`products.config.ts`](products.config.ts):

```ts
{
  id: "spolecznosc-miesiecznie",   // URL: /checkout/spolecznosc-miesiecznie
  name: "Społeczność - plan miesięczny",
  pricePln: 149,                   // gross, shown on the page
  mode: "subscription",            // or "payment"
  stripePriceId: "price_...",      // recommended; otherwise inline price_data from pricePln + interval
  interval: "month",
  vatRate: 23,                     // for invoices: 23 | 8 | 5 | 0 | "zw"
  allowPromotionCodes: true,
}
```

or set `PRODUCTS_JSON` to a JSON array of the same objects.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key (`sk_test_…` / `sk_live_…`), or a restricted key with Customers, Checkout Sessions, PaymentIntents and Invoices write access |
| `STRIPE_WEBHOOK_SECRET` | ✅ for webhooks | `whsec_…` of your webhook endpoint |
| `APP_URL` | | Public URL; auto-detected on Vercel |
| `NEXT_PUBLIC_SHOP_NAME` | | Shown above the product name |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | | `pl` (default) or `en` |
| `NEXT_PUBLIC_TERMS_URL` | | Link for the terms checkbox |
| `PRODUCTS_JSON` | | Overrides `products.config.ts` |
| `GUS_API_KEY` | | Enables the GUS REGON fallback ([free key](https://api.stat.gov.pl/Home/RegonApi)) |
| `GUS_ENV` | | `test` to use the GUS test environment |
| `ACCESS_WEBHOOK_URL` | | Where to POST paid orders |
| `ACCESS_WEBHOOK_SECRET` | | Signs the access webhook (`X-Polski-Checkout-Signature: sha256=<hex>`) |
| `INVOICING_PROVIDER` | | `none` (default), `fakturownia`, `ifirma` |
| `INVOICE_SCOPE` | | `company` (default, only "Chcę fakturę" buyers) or `all` |
| `FAKTUROWNIA_DOMAIN`, `FAKTUROWNIA_API_TOKEN` | for Fakturownia | `xyz` from `xyz.fakturownia.pl` and API token |
| `FAKTUROWNIA_KIND`, `FAKTUROWNIA_SEND_EMAIL` | | `vat` / `bill`; email invoice to buyer |
| `IFIRMA_LOGIN`, `IFIRMA_INVOICE_KEY`, `IFIRMA_PLACE_OF_ISSUE` | for iFirma | login, hex "faktura" API key, place of issue |

### Stripe webhook

Create an endpoint at `https://<your-domain>/api/webhooks/stripe` and subscribe to:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`.

### Access webhook payload

```json
{
  "type": "access.granted",
  "id": "cs_live_…",
  "product": "spolecznosc-miesiecznie",
  "email": "jan@firma.pl",
  "first_name": "Jan",
  "last_name": "Kowalski",
  "company_name": "FIRMA SP. Z O.O.",
  "nip": "5260250995",
  "amount_gross": 14900,
  "currency": "pln",
  "paid_at": "2026-11-16T10:00:00.000Z",
  "stripe": { "customerId": "cus_…", "subscriptionId": "sub_…", "livemode": true }
}
```

`type` is `access.renewed` for subscription renewals. Amounts are in grosze.

### Adding your own hook or invoicing tool

Implement `AfterPaymentHook` (`src/lib/hooks/types.ts`) or `InvoicingAdapter` (`src/lib/invoicing/types.ts`)
and register it in `getHooks()` / `getInvoicingAdapter()`. PRs for inFakt, wFirma, KSeF etc. are welcome.

## Deploy

**Vercel:** import the repo, set the env vars, deploy. Then add the webhook endpoint in Stripe.
Any Node.js host works too: `npm run build && npm start`.

## Status and limitations

- **iFirma adapter**: implemented from the public API docs and unit tested (payload + HMAC signature), **not yet verified against a live iFirma account**. Try it on a test account first.
- **Fakturownia adapter**: implemented against the documented `POST /invoices.json`; verify the generated invoice settings (numbering, seller data, VAT rate) in your account before going live.
- **KSeF** (the national e-invoicing system) is not handled directly - your invoicing tool sends invoices to KSeF.
- **Receipts for private buyers** (paragon / ewidencja): Polish rules for online sales to consumers depend on your situation. Use `INVOICE_SCOPE=all` if you invoice everyone; otherwise handle it in your accounting.
- A Stripe Customer is created when the buyer clicks "pay", also for abandoned checkouts.
- The White List has a per-IP daily request limit; the in-memory cache is per server instance. Configure GUS as a fallback for busy shops.
- Autofilled data comes from public registries and **must still be checked by the buyer** (the form says so). The buyer can edit every field.

## Legal note

This is software, **not tax or legal advice**. You are responsible for your invoices, VAT, consumer rights and
privacy obligations (RODO/GDPR). Company data shown in the form comes from the public
[VAT White List](https://www.podatki.gov.pl/wykaz-podatnikow-vat-wyszukiwarka) of the Ministry of Finance and the
public GUS REGON database. The app itself does not store buyer data; Stripe and your invoicing provider do.

## License

[MIT](LICENSE)

---

## 🇵🇱 Po polsku

**polski-checkout** to darmowa, open-source'owa bramka zakupowa dla polskich twórców i firm sprzedających przez Stripe.
Działa jak polskie platformy sprzedażowe: kupujący zaznacza **„Chcę fakturę na firmę”**, wpisuje NIP, a nazwa firmy
i adres uzupełniają się same z **białej listy podatników VAT** Ministerstwa Finansów (opcjonalnie z **GUS REGON**).
Potem przechodzi do **Stripe Checkout** (karta, BLIK, Przelewy24, kody rabatowe, subskrypcje), a po płatności
aplikacja **nadaje dostęp** (webhook do Zapiera, Make, n8n albo twojej platformy kursowej) i **wystawia fakturę**
w Fakturowni albo iFirmie.

### Dlaczego

Polscy twórcy kursów zwykle wybierają jedną z trzech dróg:

1. **Polska bramka** (np. Easytools) - wygodnie, NIP z GUS i faktury od ręki, ale prowizja i zależność od platformy.
2. **Stripe Checkout z polem NIP** - Stripe sprawdza tylko format NIP-u, dane firmy kupujący wpisuje sam, a faktury robi osobna integracja albo człowiek.
3. **Własny formularz przed płatnością** - NIP i dane firmy z rejestru, potem Stripe. Najlepsze z obu światów, ale trzeba to napisać. **Ten projekt to właśnie ta trzecia droga, gotowa do użycia.**

### Co potrafi

- strona zakupu dla każdego produktu (`/checkout/<id>`), płatności jednorazowe i subskrypcje,
- walidacja NIP-u (suma kontrolna) i automatyczne uzupełnianie danych firmy z białej listy VAT (bez klucza API), z fallbackiem do GUS,
- ostrzeżenie, gdy firma nie jest czynnym podatnikiem VAT,
- adres w osobnych polach: ulica, kod pocztowy, miasto, kraj,
- wszystkie dane trafiają do Stripe'a: adres klienta, NIP jako `tax_id` (`PL…`) i metadane,
- webhook Stripe'a z weryfikacją podpisu i hookami po płatności: nadanie dostępu i faktura (Fakturownia, iFirma),
- każdy hook wykonuje się raz na płatność, nawet gdy Stripe ponawia webhook,
- polski interfejs domyślnie, angielski w zestawie,
- żadnych sekretów w repo i żadnej bazy danych.

### Uruchomienie

```bash
git clone https://github.com/wojtekwoz/polski-checkout.git
cd polski-checkout && npm install
cp .env.example .env.local   # wpisz co najmniej STRIPE_SECRET_KEY
npm run dev                  # http://localhost:3000/checkout/kurs-demo
```

Produkty ustawiasz w `products.config.ts`, a wszystkie zmienne środowiskowe są opisane w `.env.example` i w tabeli wyżej.
Wdrożenie: Vercel (import repo, zmienne środowiskowe, deploy), potem webhook w Stripe na `/api/webhooks/stripe`
ze zdarzeniami `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`.

### Ważne

- To oprogramowanie, a **nie porada podatkowa ani prawna**. Za faktury, VAT, prawa konsumenta i RODO odpowiadasz ty.
- Dane firm pochodzą z publicznych rejestrów (biała lista VAT MF, GUS REGON). Kupujący powinien je sprawdzić i może je poprawić.
- Adapter iFirmy jest napisany według dokumentacji i ma testy, ale nie był jeszcze sprawdzony na prawdziwym koncie. Przetestuj go przed startem.
- Paragony dla osób prywatnych i KSeF obsługuje twój program do faktur, nie ta aplikacja.

Licencja: [MIT](LICENSE).
