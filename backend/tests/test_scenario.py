
from datetime import date, timedelta


def test_end_to_end(client, login):
    admin = login("admin@fsp56.demo")
    athlete = login("athlete@fsp56.demo")
    dicts = client.get("/api/dict").json()
    algo = next(d for d in dicts["disciplines"] if d["code"] == "algo")
    youth = next(g for g in dicts["age_groups"] if g["code"] == "youth")
    first = next(t for t in dicts["competition_types"] if t["name"] == "Первенство")

    start = date.today() + timedelta(days=14)
    r = client.post(
        "/api/competitions",
        headers=admin,
        json={
            "title": "Тестовое первенство по программированию алгоритмическому",
            "discipline_id": algo["id"],
            "type_id": first["id"],
            "level": "regional",
            "age_group_id": youth["id"],
            "format": "mixed",
            "format_details": "Отбор онлайн, финал очно",
            "start_date": start.isoformat(),
            "end_date": start.isoformat(),
            "registration_deadline": (start - timedelta(days=3)).isoformat(),
            "calendar_plan": "regional",
            "calendar_plan_number": "56-TEST-1",
        },
    )
    assert r.status_code == 201, r.text
    comp = r.json()
    assert comp["status"] == "draft" and comp["rating_level"] == "regional"
    assert client.get(f"/api/competitions/{comp['id']}", headers=athlete).status_code == 404

    r = client.post(f"/api/competitions/{comp['id']}/status", headers=admin, json={"status": "registration_open"})
    assert r.status_code == 200, r.text

    listed = client.get("/api/competitions", headers=athlete, params={"discipline_id": algo["id"]}).json()
    mine = next(c for c in listed if c["id"] == comp["id"])
    assert mine["eligible"] is True
    r = client.post(f"/api/competitions/{comp['id']}/applications", headers=athlete, json={})
    assert r.status_code == 201, r.text
    app_id = r.json()["id"]
    assert client.post(f"/api/competitions/{comp['id']}/applications", headers=athlete, json={}).status_code == 409

    coach = login("coach@fsp56.demo", "coach")
    pupils = client.get("/api/me/athletes", headers=coach).json()
    other = next(
        p for p in pupils
        if p["status"] == "active" and p["discipline_id"] == algo["id"] and p["full_name"] != "Ветров Михаил Андреевич"
        and next(c for c in client.get("/api/competitions", headers=coach, params={"for_athlete_id": p["athlete_id"]}).json()
                 if c["id"] == comp["id"])["eligible"]
    )
    r = client.post(f"/api/competitions/{comp['id']}/applications", headers=coach, json={"athlete_id": other["athlete_id"]})
    assert r.status_code == 201, r.text
    coach_app_id = r.json()["id"]

    as_judge = login("coach@fsp56.demo", "judge")
    assert client.post(f"/api/competitions/{comp['id']}/applications", headers=as_judge,
                       json={"athlete_id": other["athlete_id"]}).status_code == 403

    assert client.post(f"/api/applications/{app_id}/approve", headers=admin).status_code == 200
    assert client.post(f"/api/applications/{coach_app_id}/approve", headers=admin).status_code == 200
    assert client.post(f"/api/competitions/{comp['id']}/status", headers=admin, json={"status": "registration_closed"}).status_code == 200

    me_id = client.get("/api/auth/me", headers=athlete).json()["id"]
    r = client.put(
        f"/api/competitions/{comp['id']}/results",
        headers=admin,
        json=[{"athlete_id": me_id, "score": 480}, {"athlete_id": other["athlete_id"], "score": 350}],
    )
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    assert [(x["athlete_id"], x["place"]) for x in rows] == [(me_id, 1), (other["athlete_id"], 2)]

    r = client.post(f"/api/competitions/{comp['id']}/protocol/publish", headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["number"] and r.json()["competition"]["status"] == "completed"
    assert r.json()["judges"] == []
    for fmt in ("xlsx", "docx"):
        f = client.get(f"/api/competitions/{comp['id']}/protocol.{fmt}")
        assert f.status_code == 200 and len(f.content) > 1000

    history = client.get("/api/me/results", headers=athlete).json()
    assert history[0]["competition_id"] == comp["id"] and history[0]["place"] == 1
    titles = [n["title"] for n in client.get("/api/notifications", headers=athlete).json()]
    assert "Опубликован протокол" in titles and "Статус заявки изменён" in titles

    actions = {(a["entity"], a["action"]) for a in client.get("/api/admin/audit", headers=admin).json()}
    assert {("competition", "create"), ("application", "status"), ("competition", "results"), ("protocol", "publish")} <= actions


def test_age_group_is_enforced(client, login):
    admin = login("admin@fsp56.demo")
    athlete = login("athlete@fsp56.demo")
    dicts = client.get("/api/dict").json()
    kids = next(g for g in dicts["age_groups"] if g["code"] == "kids")
    start = date.today() + timedelta(days=20)
    comp = client.post(
        "/api/competitions",
        headers=admin,
        json={
            "title": "Детский турнир", "discipline_id": dicts["disciplines"][0]["id"],
            "type_id": dicts["competition_types"][0]["id"], "level": "regional", "age_group_id": kids["id"],
            "format": "online", "start_date": start.isoformat(), "end_date": start.isoformat(),
        },
    ).json()
    client.post(f"/api/competitions/{comp['id']}/status", headers=admin, json={"status": "registration_open"})
    r = client.post(f"/api/competitions/{comp['id']}/applications", headers=athlete, json={})
    assert r.status_code == 409 and "Возрастная группа" in r.json()["detail"]


def test_ministry_is_read_only(client, login):
    ministry = login("ministry@fsp56.demo")
    assert client.get("/api/admin/dashboard", headers=ministry).status_code == 200
    assert client.get("/api/admin/registry/athletes", headers=ministry).status_code == 200
    assert client.post("/api/competitions", headers=ministry, json={}).status_code in (403, 422)
