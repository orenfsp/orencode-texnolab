
import random
import sys

import httpx

BASE = "http://localhost:8000"


def main(competition_id: int, token: str) -> None:
    headers = {"X-API-Key": token}
    with httpx.Client(base_url=BASE, headers=headers, timeout=10) as api:
        participants = api.get(f"/api/ext/v1/competitions/{competition_id}/participants").raise_for_status().json()
        print(f"Одобренных участников: {len(participants)}")

        results = [{"email": p["email"], "score": random.randint(100, 600)} for p in participants]

        r = api.post(f"/api/ext/v1/competitions/{competition_id}/results", json={"results": results, "publish": True})
        r.raise_for_status()
        body = r.json()
        print(f"Импортировано: {body['imported']}, статус соревнования: {body['status']}")
        for row in body["protocol"][:5]:
            print(f"  {row['place'] or '-':>3}  участник {row['athlete_id']}  {row['score']}")
        for err in body["errors"]:
            print("Ошибка в строке", err["row"], err["error"])


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(int(sys.argv[1]), sys.argv[2])
