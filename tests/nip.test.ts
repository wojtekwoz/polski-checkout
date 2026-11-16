import { describe, expect, it } from "vitest";
import { formatNip, isValidNip, normalizeNip, toEuVat, validateNip } from "../src/lib/nip";

describe("NIP validation", () => {
  it.each([
    "5260250995", // Orange Polska
    "7740001454", // Orlen
    "5260300517", // PZU (public registry)
  ])("accepts valid NIP %s", (nip) => {
    expect(isValidNip(nip)).toBe(true);
  });

  it("normalises separators and PL prefix", () => {
    expect(normalizeNip(" PL 526-025-09-95 ")).toBe("5260250995");
    expect(validateNip("pl526.025.09.95")).toEqual({ valid: true, nip: "5260250995" });
    expect(validateNip("526 025 09 95")).toEqual({ valid: true, nip: "5260250995" });
  });

  it("rejects a wrong checksum digit", () => {
    expect(validateNip("5260250996")).toEqual({ valid: false, reason: "checksum" });
    expect(validateNip("1234567890")).toEqual({ valid: false, reason: "checksum" });
  });

  it("rejects numbers whose checksum remainder is 10", () => {
    // 123456789x: 6+10+21+8+15+24+35+48+63 = 230, 230 % 11 = 10 -> never valid
    for (let d = 0; d <= 9; d++) expect(isValidNip(`123456789${d}`)).toBe(false);
  });

  it("rejects bad formats", () => {
    expect(validateNip("")).toEqual({ valid: false, reason: "format" });
    expect(validateNip("526025099")).toEqual({ valid: false, reason: "format" });
    expect(validateNip("52602509955")).toEqual({ valid: false, reason: "format" });
    expect(validateNip("52602509a5")).toEqual({ valid: false, reason: "format" });
    expect(validateNip("0000000000")).toEqual({ valid: false, reason: "format" });
  });

  it("formats for Stripe and humans", () => {
    expect(toEuVat("526-025-09-95")).toBe("PL5260250995");
    expect(formatNip("5260250995")).toBe("526-025-09-95");
  });
});
