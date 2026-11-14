import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyAuthCreateError } from "../../server/authErrors";

test("senha vazada/comum vira mensagem clara (422), não um erro genérico", () => {
  const r = friendlyAuthCreateError({ code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one." });
  assert.equal(r.status, 422); assert.equal(r.code, "senha_fraca"); assert.match(r.message, /senha temporária/);
  assert.equal(friendlyAuthCreateError({ message: "Password is known to be weak and easy to guess" }).code, "senha_fraca"); // sem code, só texto
});
test("e-mail duplicado e erro desconhecido", () => {
  assert.equal(friendlyAuthCreateError({ code: "email_exists" }).status, 409);
  assert.equal(friendlyAuthCreateError({ message: "A user with this email address has already been registered" }).code, "email_existente");
  const o = friendlyAuthCreateError({ message: "boom" }); assert.equal(o.status, 500); assert.match(o.message, /boom/);
});
