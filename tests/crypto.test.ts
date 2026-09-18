import { it, expect } from "vitest";
import { seal, open, hashPassword, verifyPassword } from "../server/crypto";
it("compresses and authenticates large records without losing data", async () => {
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
  const original = {
    sources: Array.from({ length: 20000 }, (_, i) => ({
      id: i,
      text: "원본 셀과 가격 검토 자료 보존",
    })),
  };
  const enc = await seal(original, key);
  expect(enc.length).toBeLessThan(2000000);
  expect(await open(enc, key)).toEqual(original);
  const parsed = JSON.parse(enc);
  const ciphertext = Buffer.from(parsed.data, "base64");
  ciphertext[0] ^= 1;
  parsed.data = ciphertext.toString("base64");
  await expect(open(JSON.stringify(parsed), key)).rejects.toThrow();
});
it("uses salted password hashes and rejects wrong passwords", async () => {
  const a = await hashPassword("testing-password-1234"),
    b = await hashPassword("testing-password-1234");
  expect(a).not.toEqual(b);
  expect(await verifyPassword("testing-password-1234", a)).toBe(true);
  expect(await verifyPassword("wrong", a)).toBe(false);
});
