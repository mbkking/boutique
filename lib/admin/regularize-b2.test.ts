import { describe, it, expect } from "vitest";
import { selectAffectedAccounts } from "./regularize-b2";

const base = { isActive: true, emailConfirmedAt: "2026-10-06T00:00:00Z", createdAt: "2026-10-06T00:00:00Z" };

describe("selectAffectedAccounts (B2)", () => {
  it("cible un customer avec email non confirmé", () => {
    const out = selectAffectedAccounts([
      { id: "1", email: "a@x.com", role: "customer", isActive: true, emailConfirmedAt: null, createdAt: base.createdAt },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].actions).toContain("confirm_email");
  });

  it("cible un customer avec profil inactif", () => {
    const out = selectAffectedAccounts([
      { id: "2", email: "b@x.com", role: "customer", isActive: false, emailConfirmedAt: base.emailConfirmedAt, createdAt: base.createdAt },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].actions).toEqual(["activate_profile"]);
  });

  it("exclut admin et driver même s'ils sont non confirmés", () => {
    const out = selectAffectedAccounts([
      { id: "3", email: "adm@x.com", role: "admin", isActive: false, emailConfirmedAt: null, createdAt: base.createdAt },
      { id: "4", email: "drv@x.com", role: "driver", isActive: false, emailConfirmedAt: null, createdAt: base.createdAt },
    ]);
    expect(out).toHaveLength(0);
  });

  it("exclut les customers sains", () => {
    const out = selectAffectedAccounts([
      { id: "5", email: "c@x.com", role: "customer", isActive: true, emailConfirmedAt: base.emailConfirmedAt, createdAt: base.createdAt },
    ]);
    expect(out).toHaveLength(0);
  });

  it("produit les deux actions quand email non confirmé ET profil inactif", () => {
    const out = selectAffectedAccounts([
      { id: "6", email: "d@x.com", role: "customer", isActive: false, emailConfirmedAt: null, createdAt: base.createdAt },
    ]);
    expect(out[0].actions).toEqual(["confirm_email", "activate_profile"]);
  });
});
