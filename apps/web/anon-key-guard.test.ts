import { describe, expect, it } from "vitest";
import { assertPublicAnonKey } from "./anon-key-guard.mjs";

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const header = b64url({ alg: "HS256", typ: "JWT" });
const jwt = (payload: object) => `${header}.${b64url(payload)}.sig`;

describe("T-0514a assertPublicAnonKey", () => {
  const secretKey = "sb_secret_" + "A".repeat(32);
  const servicePayload = b64url({ role: "service_role", iss: "supabase" });
  const serviceJwt = jwt({ role: "service_role", iss: "supabase" });

  it.each([
    ["sb_secret_ key", secretKey, "A".repeat(8)],
    ["service_role JWT", serviceJwt, servicePayload],
  ])("T-0514a AC-1 rejects a %s without leaking it", (_n, key, leak) => {
    let message = "";
    try {
      assertPublicAnonKey(key);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("VITE_SUPABASE_ANON_KEY");
    expect(message).not.toContain(leak);
    expect(message).not.toContain(key);
  });

  it.each([
    "sb_publishable_B5vExample",
    jwt({ role: "anon" }),
    "test-anon-key",
    "a.b.c",
    "xsb_secret_",
    "a" + secretKey,
  ])("T-0514a AC-2 accepts %s", (key) => {
    expect(() => assertPublicAnonKey(key)).not.toThrow();
  });
});
