import { describe, expect, it, vi } from "vitest";
import { parsePolishAddressLine } from "../src/lib/address";
import { lookupCompany } from "../src/lib/company-lookup";
import { lookupWhiteList, mapWhiteListSubject, warsawDate, WhiteListError, type WhiteListSubject } from "../src/lib/whitelist";

const orange: WhiteListSubject = {
  name: "ORANGE POLSKA SPÓŁKA AKCYJNA",
  nip: "5260250995",
  statusVat: "Czynny",
  regon: "012100784",
  krs: "0000010681",
  residenceAddress: "ALEJE JEROZOLIMSKIE 160, 02-326 WARSZAWA",
  workingAddress: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("address parsing", () => {
  it.each([
    ["ALEJE JEROZOLIMSKIE 160, 02-326 WARSZAWA", "ALEJE JEROZOLIMSKIE 160", "02-326", "WARSZAWA"],
    ["UL. PROSTA 1/2, 00-838 WARSZAWA", "UL. PROSTA 1/2", "00-838", "WARSZAWA"],
    ["UL. 3 MAJA 12 LOK. 4, 35-030 RZESZÓW", "UL. 3 MAJA 12 LOK. 4", "35-030", "RZESZÓW"],
    ["DZIEKANÓW LEŚNY UL. SADOWA 3 05-092 ŁOMIANKI", "DZIEKANÓW LEŚNY UL. SADOWA 3", "05-092", "ŁOMIANKI"],
    ["UL. 11-LISTOPADA 5, 62-800 KALISZ", "UL. 11-LISTOPADA 5", "62-800", "KALISZ"],
  ])("%s", (line, street, postalCode, city) => {
    expect(parsePolishAddressLine(line)).toEqual({ street, postalCode, city, country: "PL" });
  });

  it("returns null without a postcode", () => {
    expect(parsePolishAddressLine("WARSZAWA")).toBeNull();
    expect(parsePolishAddressLine(null)).toBeNull();
  });
});

describe("White List mapping", () => {
  it("maps a company with a registered seat", () => {
    expect(mapWhiteListSubject(orange, "5260250995")).toEqual({
      nip: "5260250995",
      name: "ORANGE POLSKA SPÓŁKA AKCYJNA",
      regon: "012100784",
      krs: "0000010681",
      address: { street: "ALEJE JEROZOLIMSKIE 160", postalCode: "02-326", city: "WARSZAWA", country: "PL" },
      vatStatus: "Czynny",
      source: "mf-white-list",
    });
  });

  it("falls back to workingAddress for sole traders", () => {
    const jdg: WhiteListSubject = {
      ...orange,
      name: "JAN KOWALSKI USŁUGI IT",
      krs: null,
      residenceAddress: null,
      workingAddress: "UL. KWIATOWA 7/3, 30-001 KRAKÓW",
      statusVat: "Zwolniony",
    };
    const c = mapWhiteListSubject(jdg, "5260250995");
    expect(c.address).toEqual({ street: "UL. KWIATOWA 7/3", postalCode: "30-001", city: "KRAKÓW", country: "PL" });
    expect(c.vatStatus).toBe("Zwolniony");
  });
});

describe("White List HTTP client (mocked)", () => {
  it("calls the right URL with today's Warsaw date and maps the result", async () => {
    const fetchImpl = vi.fn(async () => json(200, { result: { subject: orange, requestId: "x" } }));
    const c = await lookupWhiteList("5260250995", { fetchImpl: fetchImpl as unknown as typeof fetch, date: "2026-11-16" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe("https://wl-api.mf.gov.pl/api/search/nip/5260250995?date=2026-11-16");
    expect(c?.name).toBe("ORANGE POLSKA SPÓŁKA AKCYJNA");
    expect(c?.address?.city).toBe("WARSZAWA");
  });

  it("returns null when the subject is not on the list", async () => {
    const fetchImpl = vi.fn(async () => json(200, { result: { subject: null, requestId: "x" } }));
    expect(await lookupWhiteList("5260250995", { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });

  it("throws a WhiteListError with the API code on HTTP errors", async () => {
    const fetchImpl = vi.fn(async () => json(400, { code: "WL-191", message: "Limit zapytań wyczerpany." }));
    await expect(lookupWhiteList("5260250995", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      name: "WhiteListError",
      code: "WL-191",
      status: 400,
    });
    await expect(lookupWhiteList("5260250995", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(WhiteListError);
  });

  it("computes the date in Europe/Warsaw", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Warsaw
    expect(warsawDate(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

describe("lookupCompany orchestration (mocked)", () => {
  it("rejects invalid NIP without any HTTP call", async () => {
    const fetchImpl = vi.fn();
    expect(await lookupCompany("1234567890", { fetchImpl: fetchImpl as unknown as typeof fetch, noCache: true })).toEqual({
      ok: false,
      error: "invalid_nip",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns not_found when the White List has no subject and GUS is not configured", async () => {
    const fetchImpl = vi.fn(async () => json(200, { result: { subject: null } }));
    expect(await lookupCompany("5260250995", { fetchImpl: fetchImpl as unknown as typeof fetch, gusApiKey: "", noCache: true })).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("falls back to GUS when the White List fails", async () => {
    const inner = `<root><dane><Regon>012100784</Regon><Nip>5260250995</Nip><Nazwa>ORANGE POLSKA SPÓŁKA AKCYJNA</Nazwa><Miejscowosc>Warszawa</Miejscowosc><KodPocztowy>02-326</KodPocztowy><Ulica>ul. Aleje Jerozolimskie</Ulica><NrNieruchomosci>160</NrNieruchomosci><NrLokalu></NrLokalu><MiejscowoscPoczty>Warszawa</MiejscowoscPoczty></dane></root>`;
    const escaped = inner.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("wl-api")) return json(503, { code: "WL-100", message: "down" });
      const body = String(init?.body ?? "");
      if (body.includes("Zaloguj")) return new Response(`<s:Envelope><s:Body><ZalogujResponse><ZalogujResult>SID123</ZalogujResult></ZalogujResponse></s:Body></s:Envelope>`);
      if (body.includes("DaneSzukajPodmioty")) {
        expect((init?.headers as Record<string, string>).sid).toBe("SID123");
        return new Response(`<s:Envelope><s:Body><DaneSzukajPodmiotyResponse><DaneSzukajPodmiotyResult>${escaped}</DaneSzukajPodmiotyResult></DaneSzukajPodmiotyResponse></s:Body></s:Envelope>`);
      }
      return new Response("<ok/>");
    });
    const r = await lookupCompany("5260250995", { fetchImpl: fetchImpl as unknown as typeof fetch, gusApiKey: "key", noCache: true });
    expect(r).toEqual({
      ok: true,
      company: {
        nip: "5260250995",
        name: "ORANGE POLSKA SPÓŁKA AKCYJNA",
        regon: "012100784",
        krs: null,
        address: { street: "ul. Aleje Jerozolimskie 160", postalCode: "02-326", city: "Warszawa", country: "PL" },
        vatStatus: null,
        source: "gus-bir",
      },
    });
  });
});
