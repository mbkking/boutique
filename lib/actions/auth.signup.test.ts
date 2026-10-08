import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const signUpMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k === "x-forwarded-for" ? "127.0.0.1" : null) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: signUpMock } }),
  createAdminClient: async () => ({ rpc: rpcMock }),
}));

import { signUpAction } from "@/lib/actions/auth";

const validPayload = {
  full_name: "Amina Diallo",
  email: "amina@exemple.ne",
  phone: "90123456",
  password: "motdepasse1",
  confirm_password: "motdepasse1",
  cgu_accepted: true,
};

describe("signUpAction — gestion des réponses Supabase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({
      data: [{ request_count: 1, window_started_at: new Date().toISOString() }],
      error: null,
    });
  });

  it("succès avec confirmation e-mail requise (session absente) → signedIn:false", async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
    const res = await signUpAction(validPayload);
    expect(res.success).toBe(true);
    expect((res as { signedIn?: boolean }).signedIn).toBe(false);
  });

  it("succès avec session ouverte → signedIn:true", async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: "u1" }, session: { access_token: "x" } }, error: null });
    const res = await signUpAction(validPayload);
    expect(res.success).toBe(true);
    expect((res as { signedIn?: boolean }).signedIn).toBe(true);
  });

  it("erreur 429 / email rate limit → message clair et aucun compte actif forcé", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "email rate limit exceeded", status: 429 },
    });
    const res = await signUpAction(validPayload);
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toContain("saturé");
  });

  it("erreur « already registered » → message dédié", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered", status: 422 },
    });
    const res = await signUpAction(validPayload);
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toContain("existe déjà");
  });

  it("erreur générique Supabase → message générique", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "database error saving new user", status: 500 },
    });
    const res = await signUpAction(validPayload);
    expect(res.success).toBe(false);
    expect((res as { error?: string }).error).toContain("échoué");
  });

  it("email invalide → rejetté avant appel Supabase", async () => {
    const res = await signUpAction({ ...validPayload, email: "pas-un-email" });
    expect(res.success).toBe(false);
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("limite anti-spam (rate_limit_hit) indique « autorisé » → signUp appelé", async () => {
    // déjà couvert par les tests précédents ; on vérifie l'appel rpc
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
    await signUpAction(validPayload);
    expect(rpcMock).toHaveBeenCalled();
  });
});
