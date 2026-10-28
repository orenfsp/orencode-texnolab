
import base64
import hashlib
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse

from app.services import webhooks


def _me(client, h):
    return client.get("/api/auth/me", headers=h).json()




def test_profile_consents_and_coach_link(client, login):
    athlete = login("athlete@fsp56.demo")
    prof = client.get("/api/me/profile", headers=athlete).json()
    assert prof["is_minor"] and {c["kind"] for c in prof["consents"]} == {"pd_self", "pd_guardian"}
    body = {k: prof[k] for k in ("last_name", "first_name", "middle_name", "phone", "municipality_id")}
    r = client.put("/api/me/profile", headers=athlete, json=body | {"guardian_name": None})
    assert r.status_code == 422
    r = client.put("/api/me/antidoping", headers=athlete, json={"rusada_course_date": str(date.today()), "rusada_certificate_url": "https://rusada.ru/x"})
    assert r.status_code == 200 and r.json()["athlete"]["rusada_course_date"]
    doc = client.get(f"/api/me/consents/{prof['consents'][0]['id']}.docx", headers=athlete)
    assert doc.status_code == 200

    coach = login("student@fsp56.demo", "coach")
    found = client.get("/api/coach/search", headers=coach, params={"q": "Ветров"}).json()
    target = found[0]
    disc = target["disciplines"][-1]["id"]
    r = client.post("/api/coach/links", headers=coach, json={"athlete_id": target["id"], "discipline_id": disc})
    assert r.status_code == 201, r.text
    link_id = r.json()["id"]
    assert client.post(f"/api/links/{link_id}/status", headers=coach, json={"status": "active"}).status_code == 403
    r = client.post(f"/api/links/{link_id}/status", headers=athlete, json={"status": "active"})
    assert r.status_code == 200 and [e["status"] for e in r.json()["events"]] == ["pending", "active"]
    r = client.post(f"/api/links/{link_id}/status", headers=coach, json={"status": "suspended", "comment": "каникулы"})
    assert r.json()["status"] == "suspended"




def test_judges_panel_and_category_request(client, login):
    admin = login("admin@fsp56.demo")
    judge = login("secretary@fsp56.demo")
    reqs = client.get("/api/admin/judge-requests", headers=admin, params={"status": "submitted"}).json()
    assert reqs, "в демо есть заявка на категорию"
    r = client.post(f"/api/admin/judge-requests/{reqs[0]['id']}/approve", headers=admin, json={"order_number": "СК-77"})
    assert r.status_code == 200 and r.json()["status"] == "approved"
    mine = client.get("/api/me/judge", headers=judge).json()
    assert mine["qualification"]["category"] == "Спортивный судья второй категории"

    comps = client.get("/api/competitions", headers=admin, params={"status": "registration_open"}).json()
    comp = comps[0]["id"]
    dicts = client.get("/api/dict").json()
    pos = next(p["id"] for p in dicts["judge_positions"] if p["name"] == "Судья")
    coach_id = _me(client, login("coach@fsp56.demo"))["id"]
    r = client.post(f"/api/competitions/{comp}/judges", headers=admin, json={"judge_id": coach_id, "position_id": pos})
    assert r.status_code == 200 and any(j["judge_id"] == coach_id for j in r.json())
    assert client.get(f"/api/competitions/{comp}/judges.docx", headers=admin).status_code == 200
    as_judge = login("coach@fsp56.demo", "judge")
    assert any(a["competition_id"] == comp for a in client.get("/api/me/judging", headers=as_judge).json())
    assert client.get(f"/api/judges/{coach_id}/report.xlsx", headers=as_judge).status_code == 200


def test_rank_request_flow_and_evsk(client, login):
    admin = login("admin@fsp56.demo")
    cands = client.get("/api/admin/rank-candidates", headers=admin).json()
    assert cands, "в протоколах есть результаты под требования ЕВСК"
    coach = login("coach@fsp56.demo", "coach")
    pupils = {p["athlete_id"] for p in client.get("/api/me/athletes", headers=coach).json() if p["status"] == "active"}
    cand = next(c for c in cands if c["athlete_id"] in pupils and not c["has_request"] and "алгоритм" in c["discipline"].lower())
    r = client.post("/api/rank-requests", headers=coach, json={"result_id": cand["result_id"], "rank_id": cand["candidate_rank_id"], "kind": "assign"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert client.post(f"/api/admin/rank-requests/{rid}/approve", headers=admin, json={}).status_code == 422
    r = client.post(f"/api/admin/rank-requests/{rid}/approve", headers=admin, json={"order_number": "Пр-2026/1"})
    assert r.status_code == 200 and r.json()["status"] == "approved"
    ranks = client.get("/api/admin/ranks", headers=admin).json()
    granted = next(x for x in ranks if x["athlete_id"] == cand["athlete_id"] and x["order_number"] == "Пр-2026/1")
    assert granted["basis"] and granted["valid_until"]


def test_deadlines_and_reminders(client, login):
    admin = login("admin@fsp56.demo")
    athlete = login("athlete@fsp56.demo")
    kinds = {d["kind"] for d in client.get("/api/me/deadlines", headers=admin).json()}
    assert {"registration", "report"} <= kinds
    mine = client.get("/api/me/deadlines", headers=athlete).json()
    assert any(d["kind"] == "rank" for d in mine) and all(d["kind"] in ("registration", "rank") for d in mine)
    titles = [n["title"] for n in client.get("/api/notifications", headers=athlete).json()]
    assert any(t.startswith("Срок:") for t in titles)
    assert client.post("/api/admin/reminders/run", headers=admin).json()["sent"] == 0




def test_registry_and_headcount(client, login):
    ministry = login("ministry@fsp56.demo")
    assert client.get("/api/admin/registry/coaches", headers=ministry).json()
    assert client.get("/api/admin/registry/organizations", headers=ministry).json()
    dicts = client.get("/api/dict").json()
    s2 = next(r["id"] for r in dicts["sport_ranks"] if r["code"] == "s2")
    ranked = client.get("/api/admin/registry/athletes", headers=ministry, params={"min_rank_id": s2}).json()
    assert ranked and all(a["rank"] for a in ranked)
    y = date.today().year
    hc = client.get("/api/reports/headcount", headers=ministry, params={"years": [y - 2, y - 1, y]}).json()
    assert hc["total"][str(y)] >= hc["total"][str(y - 2)] > 0
    assert set(hc["slices"]) == {"organization", "discipline", "age_group", "municipality", "stage"}
    assert client.get("/api/reports/headcount", headers=ministry, params={"years": [y]}).status_code == 422
    x = client.get("/api/reports/headcount.xlsx", headers=ministry)
    assert x.status_code == 200 and x.content[:2] == b"PK"


def test_rating_rules_and_team(client, login):
    admin = login("admin@fsp56.demo")
    algo = next(d["id"] for d in client.get("/api/dict").json()["disciplines"] if d["code"] == "algo")
    rating = client.get("/api/rating", headers=admin, params={"discipline_id": algo, "season": date.today().year}).json()
    rows = rating["rows"]
    assert rows
    for r in rows:
        assert r["total"] == round(r["base"] * r["coefficient"], 2)
        assert r["coefficient"] == (1.2 if r["podiums"] >= 2 else 1.0)
        assert r["base"] == sum(e["points"] for e in r["entries"])
    assert [r["total"] for r in rows] == sorted((r["total"] for r in rows), reverse=True)

    teams = client.get("/api/teams", headers=admin).json()
    team = teams[0]
    assert team["members"]
    for path in (f"/api/teams/{team['id']}/list.docx", f"/api/teams/{team['id']}/list.xlsx", f"/api/teams/{team['id']}/order.docx"):
        assert client.get(path, headers=admin).status_code == 200
    r = client.post(f"/api/teams/{team['id']}/approve", headers=admin, json={"order_number": "П-12", "order_date": str(date.today())})
    assert r.json()["status"] == "approved"
    assert client.put(f"/api/teams/{team['id']}/members", headers=admin, json=[]).status_code == 409


def test_participation_report_access(client, login):
    athlete = login("athlete@fsp56.demo")
    aid = _me(client, athlete)["id"]
    assert client.get(f"/api/athletes/{aid}/participation.docx", headers=athlete).status_code == 200
    stranger = login("athlete01@fsp56.demo")
    assert client.get(f"/api/athletes/{aid}/participation.docx", headers=stranger).status_code == 403




def test_certificate_with_qr_and_public_verify(client, login):
    athlete = login("athlete@fsp56.demo")
    hist = client.get("/api/me/results", headers=athlete).json()
    r = client.post("/api/me/certificates", headers=athlete, json={"result_id": hist[0]["result_id"], "purpose": "поступление"})
    assert r.status_code == 201
    cert = r.json()
    assert cert["number"].startswith("СП-") and "/verify/" in cert["verify_url"]
    assert client.get(f"/api/certificates/{cert['id']}.docx", headers=athlete).status_code == 200
    pub = client.get(f"/api/public/certificates/{cert['verify_code']}")
    assert pub.status_code == 200 and pub.json()["valid"] and pub.json()["athlete_name"]
    assert client.get("/api/public/certificates/nope").status_code == 404


def test_public_navigator_and_path(client, login):
    ov = client.get("/api/public/overview").json()
    assert len(ov["disciplines"]) == 6 and ov["organizations"] and ov["upcoming"]
    path = client.get("/api/me/path", headers=login("athlete@fsp56.demo")).json()
    algo = next(d for d in path["disciplines"] if "алгоритм" in d["discipline"].lower())
    assert algo["next_rank"] and algo["requirements"]


def test_appeal_with_evidence_corrects_protocol(client, login):
    athlete = login("athlete@fsp56.demo")
    admin = login("admin@fsp56.demo")
    hist = client.get("/api/me/results", headers=athlete).json()
    target = next(h for h in hist if h["place"])
    r = client.post("/api/appeals", headers=athlete,
                    data={"competition_id": target["competition_id"], "text": "Неверно засчитана задача C, прошу перепроверить"},
                    files=[("files", ("log.txt", b"submission 123: OK", "text/plain"))])
    assert r.status_code == 201, r.text
    ap = r.json()
    assert ap["evidence"] and client.get(f"/api/evidence/{ap['evidence'][0]['id']}", headers=admin).status_code == 200
    r = client.post(f"/api/appeals/{ap['id']}/decision", headers=admin, json={"status": "accepted", "decision": "Задача засчитана", "new_score": 9999})
    assert r.status_code == 200
    proto = client.get(f"/api/competitions/{target['competition_id']}/protocol").json()
    me = _me(client, athlete)["id"]
    assert next(row for row in proto["rows"] if row["athlete_id"] == me)["place"] == 1
    assert [h["status"] for h in r.json()["history"]] == ["submitted", "accepted"]


def test_violation_disqualifies(client, login):
    admin = login("admin@fsp56.demo")
    v = client.get("/api/violations", headers=admin).json()[0]
    r = client.post(f"/api/violations/{v['id']}/decision", headers=admin,
                    json={"decision": "disqualification", "decision_text": "Списывание подтверждено", "disqualification_until": str(date.today() + timedelta(days=365))})
    assert r.status_code == 200
    dq = client.get("/api/admin/disqualifications", headers=admin).json()
    assert any(d["athlete_id"] == v["athlete_id"] and d["active"] for d in dq)


def test_governor_prizes(client, login):
    admin = login("admin@fsp56.demo")
    year = date.today().year
    cand = client.get("/api/prizes/candidates", headers=admin, params={"year": year}).json()
    assert cand["items"] and cand["total"] == sum(i["amount"] for i in cand["items"])
    assert all(i["passport"].startswith("•") for i in cand["items"])
    pt = client.post("/api/prizes/petitions", headers=admin, json={"year": year}).json()
    assert client.post(f"/api/prizes/petitions/{pt['id']}/status", headers=admin, json={"status": "awarded"}).status_code == 409
    assert client.post(f"/api/prizes/petitions/{pt['id']}/status", headers=admin, json={"status": "sent"}).json()["status"] == "sent"
    assert client.get(f"/api/prizes/petitions/{pt['id']}.docx", headers=admin).status_code == 200


def test_groups_journal_norms_attestation(client, login):
    coach = login("coach@fsp56.demo", "coach")
    groups = client.get("/api/groups", headers=coach).json()
    ute = next(g for g in groups if g["stage"] == "ute")
    detail = client.get(f"/api/groups/{ute['id']}", headers=coach).json()
    assert detail["sessions"] and detail["members"]
    r = client.post(f"/api/groups/{ute['id']}/sessions", headers=coach,
                    json={"held_on": str(date.today()), "format": "online", "topic": "Онлайн-контест", "attendee_ids": []})
    assert r.status_code == 422
    r = client.post(f"/api/groups/{ute['id']}/sessions", headers=coach,
                    json={"held_on": str(date.today()), "format": "online", "topic": "Онлайн-контест",
                          "confirmation_url": "https://example.org/rec", "attendee_ids": [m["athlete_id"] for m in detail["members"]]})
    assert r.status_code == 201
    athlete_id = _me(client, login("athlete@fsp56.demo"))["id"]
    ready = {x["athlete_id"]: x for x in client.get("/api/norms/readiness", headers=coach, params={"group_id": ute["id"]}).json()}
    assert ready[athlete_id]["ready"] is True
    ssm = next(g for g in groups if g["stage"] == "ssm")
    r = client.post("/api/attestations", headers=coach, json={"athlete_id": athlete_id, "to_group_id": ssm["id"]})
    assert r.status_code == 201 and r.json()["stage"] == "ssm"
    std = next(s for s in client.get("/api/norms/standards", headers=coach, params={"stage": "ssm"}).json() if "печати" in s["name"])
    r = client.post("/api/norms/results", headers=coach, json={"athlete_id": athlete_id, "standard_id": std["id"], "value": 150})
    assert r.json()["passed"] is False


def test_api_tokens_import_results_and_webhooks(client, login, monkeypatch):
    admin = login("admin@fsp56.demo")
    sent = []
    monkeypatch.setattr(webhooks.httpx, "post", lambda url, **kw: sent.append((url, kw["headers"])) or type("R", (), {"status_code": 200})())
    client.post("/api/admin/webhooks", headers=admin, json={"url": "https://partner.example.org/hook", "events": ["protocol.published"]})
    ro = client.post("/api/admin/api-tokens", headers=admin, json={"name": "read", "scopes": ["competitions:read"]}).json()["token"]
    rw = client.post("/api/admin/api-tokens", headers=admin, json={"name": "contest", "scopes": ["results:write"]}).json()["token"]
    assert client.get("/api/ext/v1/competitions", headers={"X-API-Key": ro}).status_code == 200
    comp = next(c for c in client.get("/api/competitions", headers=admin).json() if c["status"] == "registration_open")
    assert client.post(f"/api/ext/v1/competitions/{comp['id']}/results", headers={"X-API-Key": ro}, json={"results": []}).status_code == 403
    participants = client.get(f"/api/ext/v1/competitions/{comp['id']}/participants", headers={"X-API-Key": rw}).json()
    rows = [{"email": p["email"], "score": 100 + i * 10} for i, p in enumerate(participants)]
    r = client.post(f"/api/ext/v1/competitions/{comp['id']}/results", headers={"X-API-Key": rw}, json={"results": rows, "publish": True})
    assert r.status_code == 200 and r.json()["status"] == "completed" and not r.json()["errors"]
    assert r.json()["protocol"][0]["score"] == 100 + (len(rows) - 1) * 10
    assert any(h["X-FSP-Event"] == "protocol.published" and h["X-FSP-Signature"].startswith("sha256=") for _, h in sent)


def test_fsp_id_oidc_pkce(client, login):
    disc = client.get("/.well-known/openid-configuration").json()
    assert disc["code_challenge_methods_supported"] == ["S256"]
    assert client.get("/oauth/jwks").json()["keys"][0]["alg"] == "RS256"
    verifier = "v" * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    redirect = "http://localhost:8000/demo-client/"
    r = client.get("/oauth/authorize", params={"client_id": "demo-client", "redirect_uri": redirect, "scope": "openid profile roles sport",
                                                "code_challenge": challenge, "code_challenge_method": "S256", "state": "xyz"},
                   follow_redirects=False)
    assert r.status_code == 307 and "/oauth/consent" in r.headers["location"]
    athlete = login("athlete@fsp56.demo")
    r = client.post("/api/oauth/authorize", headers=athlete, json={"client_id": "demo-client", "redirect_uri": redirect,
                                                                    "scope": "openid profile roles sport", "state": "xyz",
                                                                    "code_challenge": challenge, "allow": True})
    q = parse_qs(urlparse(r.json()["redirect_to"]).query)
    assert q["state"] == ["xyz"]
    form = {"grant_type": "authorization_code", "code": q["code"][0], "redirect_uri": redirect, "client_id": "demo-client"}
    assert client.post("/oauth/token", data=form | {"code_verifier": "wrong"}).status_code == 400
    tok = client.post("/oauth/token", data=form | {"code_verifier": verifier}).json()
    assert tok["id_token"] and tok["access_token"]
    info = client.get("/oauth/userinfo", headers={"Authorization": f"Bearer {tok['access_token']}"}).json()
    assert info["family_name"] == "Ветров" and "athlete" in info["roles"] and info["disciplines"]
    assert client.post("/oauth/token", data=form | {"code_verifier": verifier}).status_code == 400
