import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from cryptography.fernet import Fernet

from worker import capture, contract, readonly, sync
from worker.server import Config, make_handler
from worker.store import Store

EXTRACTOR = '''
import json, os
def out(entity, **data): print(json.dumps({"entity": entity, "data": data}))
out("lead", name="Maria", phone="11999990000", source="x")
out("client", name="Joao", documento="123", phone="11888880000")
out("finance_entry", externalId="F1", description="Venda 1", value=100, date="2026-01-02", clientDocument="123")
out("client", name="Joao duplicado", documento="123")          # duplicado no mesmo sync
out("lead", name="Sem contato")                                  # inválido: sem email/phone
out("finance_entry", externalId="F2", description="Venda 2", value=50, date="2026-01-03",
    customFields={"env": sorted(os.environ.keys()), "user": os.environ.get("INTEGRATION_USER")})
print("lixo que nao e json")
print(json.dumps({"entity": "__expected__", "data": {"client": 3, "finance_entry": 2}}))
'''


class FakeSpy:
    def __init__(self, fail_on=None):
        self.posts: list[tuple[str, dict]] = []
        self.fail_on = fail_on or (lambda path, body: False)

    def __call__(self, base_url, api_key):
        self.api_key = api_key
        return self

    def post(self, path, body):
        from worker.spy_client import SpyError
        if self.fail_on(path, body):
            raise SpyError(400, "recusado")
        self.posts.append((path, body))
        return {"success": True}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name, Fernet.generate_key().decode())
        self.store.save_integration("acme", {"name": "Acme"})
        self.store.set_secrets("acme", {"SPY_API_KEY": "spy-key", "INTEGRATION_USER": "u1"})
        self.extract = self.store.integration_dir("acme") / "extract.py"
        self.extract.write_text(EXTRACTOR, "utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def approve(self):
        self.store.save_integration("acme", {"approved": True, "approvedSha": readonly.sha256(self.extract.read_text("utf-8"))})


class ContractTests(unittest.TestCase):
    def test_validate(self):
        self.assertEqual(contract.validate("lead", {"name": "A", "email": "a@a.com"}), [])
        self.assertTrue(contract.validate("lead", {"name": "A"}))
        self.assertTrue(contract.validate("finance_entry", {"description": "x"}))
        self.assertTrue(contract.validate("nada", {}))

    def test_dedup_key_and_parse(self):
        self.assertEqual(contract.dedup_key("client", {"documento": " ABC ", "email": "x"}), "documento=abc")
        self.assertEqual(contract.parse_line('{"entity":"lead","data":{"name":"A"}}')[0], "lead")
        with self.assertRaises(ValueError):
            contract.parse_line("não é json")
        with self.assertRaises(ValueError):
            contract.parse_line('{"entity":"lead"}')


class CaptureTests(unittest.TestCase):
    def test_command_is_headless_json_and_carries_rules(self):
        cmd = capture.build_command("rae", "https://x.com", "trazer vendas")
        self.assertIn("--headless", cmd)
        self.assertIn("--json", cmd)
        self.assertIn("--no-interactive", cmd)
        prompt = cmd[cmd.index("--prompt") + 1]
        self.assertIn("SOMENTE LEITURA", prompt)
        self.assertIn("extract.py", prompt)
        self.assertEqual(cmd[cmd.index("--url") + 1], "https://x.com")

    def test_parse_agent_json_tolerates_noise(self):
        self.assertEqual(capture.parse_agent_json('aviso\n{"status":"ok"}')["status"], "ok")
        with self.assertRaises(RuntimeError):
            capture.parse_agent_json("sem json")


class ReadonlyTests(unittest.TestCase):
    def test_flags_writes_and_danger(self):
        src = "import requests\nr = requests.get(u)\nrequests.post(u, json=x)\nrequests.delete(u)\nimport subprocess\n# requests.put(u)\n"
        rep = readonly.scan(src)
        self.assertEqual([w["line"] for w in rep["writes"]], [3, 4])
        self.assertEqual([d["what"] for d in rep["dangers"]], ["subprocess"])
        self.assertEqual(len(rep["sha256"]), 64)

    def test_clean_get_only(self):
        rep = readonly.scan("import requests\nrequests.get('x')\n")
        self.assertFalse(rep["writes"] or rep["dangers"])


class SyncTests(Base):
    def test_refuses_unapproved_and_changed(self):
        with self.assertRaises(sync.SyncRefused):
            sync.run_sync(self.store, "acme", "http://spy", client_factory=FakeSpy())
        self.approve()
        self.extract.write_text(EXTRACTOR + "\n# alterado\n", "utf-8")
        with self.assertRaises(sync.SyncRefused):
            sync.run_sync(self.store, "acme", "http://spy", client_factory=FakeSpy())

    def test_full_sync(self):
        self.approve()
        spy = FakeSpy()
        rep = sync.run_sync(self.store, "acme", "http://spy", client_factory=spy, concurrency=1)
        self.assertEqual(spy.api_key, "spy-key")
        paths = [p for p, _ in spy.posts]
        # cadastros antes dos lançamentos
        self.assertLess(paths.index("/api/v1/clients"), paths.index("/api/v1/finance-entries"))
        s = rep["stats"]
        self.assertEqual(s["client"], {"read": 2, "invalid": 0, "duplicate": 1, "sent": 1, "failed": 0})
        self.assertEqual(s["lead"]["invalid"], 1)
        self.assertEqual(s["lead"]["sent"], 1)
        self.assertEqual(s["finance_entry"]["sent"], 2)
        # expected client=3, chegaram 1 enviado + 1 duplicado = 2 → falta 1 → parcial
        self.assertEqual(rep["mismatches"], [{"entity": "client", "expected": 3, "received": 2, "missing": 1}])
        self.assertEqual(rep["status"], "partial")
        self.assertTrue(any(x["stage"] == "extract" for x in rep["samples"]))

    def test_extractor_never_sees_spy_key(self):
        self.approve()
        spy = FakeSpy()
        sync.run_sync(self.store, "acme", "http://spy", client_factory=spy, concurrency=1)
        body = next(b for p, b in spy.posts if p == "/api/v1/finance-entries" and b["externalId"] == "F2")
        self.assertNotIn("SPY_API_KEY", body["customFields"]["env"])
        self.assertNotIn("WORKER_SECRET_KEY", body["customFields"]["env"])
        self.assertEqual(body["customFields"]["user"], "u1")

    def test_spy_rejection_counts_as_failed(self):
        self.approve()
        spy = FakeSpy(fail_on=lambda path, body: body.get("externalId") == "F1")
        rep = sync.run_sync(self.store, "acme", "http://spy", client_factory=spy, concurrency=1)
        self.assertEqual(rep["stats"]["finance_entry"]["failed"], 1)
        self.assertEqual(rep["status"], "partial")

    def test_timeout_is_error(self):
        self.extract.write_text("import time\ntime.sleep(5)\n", "utf-8")
        self.approve()
        rep = sync.run_sync(self.store, "acme", "http://spy", client_factory=FakeSpy(), timeout=1)
        self.assertTrue(rep["timedOut"])
        self.assertEqual(rep["status"], "error")


class ServerTests(Base):
    def setUp(self):
        super().setUp()
        cfg = Config()
        cfg.token = "t" * 32
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cfg, self.store))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"

    def tearDown(self):
        self.httpd.shutdown()
        super().tearDown()

    def call(self, method, path, body=None, token=True):
        req = urllib.request.Request(self.base + path, method=method, data=json.dumps(body).encode() if body is not None else None)
        if token:
            req.add_header("Authorization", "Bearer " + "t" * 32)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_auth(self):
        self.assertEqual(self.call("GET", "/health", token=False)[0], 200)
        self.assertEqual(self.call("GET", "/v1/integrations", token=False)[0], 401)

    def test_put_hides_secrets_and_validates_names(self):
        code, view = self.call("PUT", "/v1/integrations/novo", {"name": "Novo", "spyApiKey": "k", "secrets": {"INTEGRATION_USER": "u"}})
        self.assertEqual(code, 200)
        self.assertNotIn("spyApiKey", json.dumps(view))
        self.assertNotIn("secrets", view)
        self.assertEqual(self.store.get_secrets("novo"), {"SPY_API_KEY": "k", "INTEGRATION_USER": "u"})
        self.assertEqual(self.call("PUT", "/v1/integrations/novo", {"secrets": {"PATH": "x"}})[0], 400)
        self.assertEqual(self.call("PUT", "/v1/integrations/../x", {})[0], 404)

    def test_approve_requires_matching_sha_then_sync_runs(self):
        self.assertEqual(self.call("POST", "/v1/integrations/acme/approve", {"sha256": "errado"})[0], 400)
        self.assertEqual(self.call("POST", "/v1/integrations/acme/sync")[0], 409)  # ainda não aprovado
        sha = readonly.sha256(self.extract.read_text("utf-8"))
        code, view = self.call("POST", "/v1/integrations/acme/approve", {"sha256": sha, "by": "gustavo"})
        self.assertEqual((code, view["approved"]), (200, True))


if __name__ == "__main__":
    unittest.main()
