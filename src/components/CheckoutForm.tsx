"use client";

import { useRef, useState } from "react";
import { POLISH_POSTCODE, normalizePostalCode } from "@/lib/address";
import type { CompanyInfo } from "@/lib/company";
import { t, type Dict, type Locale } from "@/lib/i18n";
import { normalizeNip, validateNip } from "@/lib/nip";

type Errors = Record<string, string>;
type LookupState = "idle" | "loading" | "found" | "not_found" | "failed";

export function CheckoutForm({
  productId,
  locale,
  dict: d,
  termsUrl,
  showPromoInfo,
}: {
  productId: string;
  locale: Locale;
  dict: Dict;
  termsUrl?: string;
  showPromoInfo: boolean;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [nip, setNip] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("PL");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [lookup, setLookup] = useState<LookupState>("idle");
  const [lookupInfo, setLookupInfo] = useState<CompanyInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const lastLooked = useRef<string>("");

  async function runLookup(raw: string) {
    const v = validateNip(raw);
    if (!v.valid) {
      setErrors((e) => ({ ...e, nip: d.nipInvalid }));
      return;
    }
    if (lastLooked.current === v.nip) return;
    lastLooked.current = v.nip;
    setErrors(({ nip: _n, ...rest }) => rest);
    setLookup("loading");
    try {
      const res = await fetch(`/api/nip/${v.nip}`);
      if (res.ok) {
        const c = (await res.json()) as CompanyInfo;
        setLookupInfo(c);
        setCompanyName(c.name);
        if (c.address) {
          setStreet(c.address.street);
          setPostalCode(c.address.postalCode);
          setCity(c.address.city);
          setCountry("PL");
        }
        setLookup("found");
      } else {
        setLookupInfo(null);
        setLookup(res.status === 404 ? "not_found" : res.status === 400 ? "idle" : "failed");
        if (res.status === 400) setErrors((e) => ({ ...e, nip: d.nipInvalid }));
      }
    } catch {
      setLookup("failed");
    }
  }

  function onNipChange(value: string) {
    setNip(value);
    const n = normalizeNip(value);
    if (n.length === 10 && validateNip(n).valid) void runLookup(n);
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = d.invalid;
    if (!firstName.trim()) e.firstName = d.required;
    if (!lastName.trim()) e.lastName = d.required;
    if (wantsInvoice) {
      if (!validateNip(nip).valid) e.nip = d.nipInvalid;
      if (!companyName.trim()) e.companyName = d.required;
    }
    if (!street.trim()) e.street = d.required;
    if (!city.trim()) e.city = d.required;
    const effCountry = wantsInvoice ? "PL" : country;
    const pc = normalizePostalCode(postalCode, effCountry);
    if (!wantsInvoice && !/^[A-Z]{2}$/.test(country)) e.country = d.invalid;
    if (effCountry === "PL" ? !POLISH_POSTCODE.test(pc) : !pc.trim()) e.postalCode = d.invalidPostcode;
    if (!acceptTerms) e.acceptTerms = d.required;
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          locale,
          buyer: {
            email,
            firstName,
            lastName,
            wantsInvoice,
            nip: wantsInvoice ? nip : undefined,
            companyName: wantsInvoice ? companyName : undefined,
            address: { street, postalCode: normalizePostalCode(postalCode, wantsInvoice ? "PL" : country), city, country: wantsInvoice ? "PL" : country },
            acceptTerms,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; errors?: { field: string; code: string }[] };
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      if (body.errors?.length) {
        const map: Errors = {};
        for (const er of body.errors) map[er.field.replace("address.", "")] = er.field.endsWith("postalCode") ? d.invalidPostcode : er.field === "nip" ? d.nipInvalid : er.code === "required" ? d.required : d.invalid;
        setErrors(map);
      } else setFormError(d.errorGeneric);
    } catch {
      setFormError(d.errorGeneric);
    }
    setSubmitting(false);
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => set(e.target.value)} aria-invalid={Boolean(errors[id])} {...props} />
      {errors[id] ? <span className="err">{errors[id]}</span> : null}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      {field("email", d.email, email, setEmail, { type: "email", autoComplete: "email", inputMode: "email" })}
      <div className="row">
        {field("firstName", d.firstName, firstName, setFirstName, { autoComplete: "given-name" })}
        {field("lastName", d.lastName, lastName, setLastName, { autoComplete: "family-name" })}
      </div>

      <div className="toggle">
        <label className="check">
          <input type="checkbox" checked={wantsInvoice} onChange={(e) => setWantsInvoice(e.target.checked)} />
          <span>{d.wantsInvoice}</span>
        </label>
        {wantsInvoice ? (
          <>
            <div className="field">
              <label htmlFor="nip">{d.nip}</label>
              <div className="nip-row">
                <input
                  id="nip"
                  type="text"
                  inputMode="numeric"
                  placeholder="0000000000"
                  value={nip}
                  onChange={(e) => onNipChange(e.target.value)}
                  onBlur={() => nip && void runLookup(nip)}
                  aria-invalid={Boolean(errors.nip)}
                />
                <button type="button" className="secondary" disabled={lookup === "loading"} onClick={() => { lastLooked.current = ""; void runLookup(nip); }}>
                  {lookup === "loading" ? d.nipLooking : d.nipLookup}
                </button>
              </div>
              {errors.nip ? <span className="err">{errors.nip}</span> : null}
              {!errors.nip && lookup === "idle" ? <span className="muted">{d.nipHint}</span> : null}
              {lookup === "found" && lookupInfo ? (
                <span className="ok" data-testid="nip-found">
                  {t(d, "nipFound", { source: lookupInfo.source === "gus-bir" ? "GUS" : "MF" })}
                </span>
              ) : null}
              {lookup === "found" && lookupInfo?.vatStatus && lookupInfo.vatStatus !== "Czynny" ? (
                <span className="warn">{t(d, "vatInactive", { status: lookupInfo.vatStatus })}</span>
              ) : null}
              {lookup === "not_found" ? <span className="warn">{d.nipNotFound}</span> : null}
              {lookup === "failed" ? <span className="warn">{d.nipLookupFailed}</span> : null}
            </div>
            {field("companyName", d.companyName, companyName, setCompanyName, { autoComplete: "organization" })}
          </>
        ) : null}
      </div>

      <h2>{wantsInvoice ? d.addressCompany : d.addressPerson}</h2>
      {field("street", d.street, street, setStreet, { autoComplete: "street-address" })}
      <div className="row-pc">
        {field("postalCode", d.postalCode, postalCode, setPostalCode, { autoComplete: "postal-code", placeholder: country === "PL" ? "00-000" : "" })}
        {field("city", d.city, city, setCity, { autoComplete: "address-level2" })}
      </div>
      {!wantsInvoice ? (
        <div className="field">
          <label htmlFor="country">{d.country}</label>
          <select id="country" value={country === "PL" ? "PL" : "XX"} onChange={(e) => setCountry(e.target.value === "XX" ? "" : e.target.value)}>
            <option value="PL">{d.countryPL}</option>
            <option value="XX">{d.countryOther}</option>
          </select>
          {errors.country ? <span className="err">{errors.country}</span> : null}
          {country !== "PL" ? (
            <input type="text" aria-label={d.country} maxLength={2} placeholder="DE" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
          ) : null}
        </div>
      ) : null}

      <label className="check">
        <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} aria-invalid={Boolean(errors.acceptTerms)} />
        <span>
          {termsUrl ? (
            <a href={termsUrl} target="_blank" rel="noreferrer">{d.acceptTerms}</a>
          ) : (
            d.acceptTerms
          )}
        </span>
      </label>
      {errors.acceptTerms ? <span className="err">{errors.acceptTerms}</span> : null}

      <button type="submit" className="pay" disabled={submitting}>
        {submitting ? d.paying : d.pay}
      </button>
      {formError ? <p className="err">{formError}</p> : null}
      {showPromoInfo ? <p className="muted">{d.promoInfo}</p> : null}
      <p className="muted">{d.securedBy}</p>
    </form>
  );
}
