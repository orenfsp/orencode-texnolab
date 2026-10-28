# Интеграции: API для внешних систем, вебхуки, ФСП ID

## 1. Токены доступа (Д2)

Федерация выпускает токен в разделе "Интеграции и ФСП ID" и выбирает права. Токен показывается один раз, в БД хранится только его хеш.

| Право | Что даёт |
|---|---|
| `competitions:read` | `GET /api/ext/v1/competitions?year=2026` - календарь (без черновиков) |
| `protocols:read` | `GET /api/ext/v1/competitions/{id}/protocol` - опубликованный протокол |
| `results:write` | `GET /api/ext/v1/competitions/{id}/participants` - одобренные участники;<br>`POST /api/ext/v1/competitions/{id}/results` - импорт результатов |

Токен передаётся в заголовке `X-API-Key: fsp_...` или `Authorization: Bearer fsp_...`.

### Импорт результатов с автоматическим формированием протокола

```http
POST /api/ext/v1/competitions/12/results
X-API-Key: fsp_xxx
Content-Type: application/json

{
  "results": [
    {"email": "athlete01@fsp56.demo", "score": 480},
    {"athlete_id": 17, "score": 350, "note": "решено 5 задач"}
  ],
  "publish": true
}
```

Что делает платформа:

1. Если приём заявок ещё открыт, закрывает его.
2. Сопоставляет участников по `athlete_id` или email только среди одобренных заявок.
3. Считает места по убыванию баллов, при равенстве баллов место одинаковое.
4. При `publish: true` публикует протокол, рассылает уведомления и отправляет вебхук `protocol.published`.

В ответе возвращаются `imported`, `errors` (по строкам), `status` и итоговый протокол.

Готовый пример: [`examples/import_results.py`](../examples/import_results.py).

## 2. Вебхуки

Федерация указывает адрес и события:

| Событие | Когда |
|---|---|
| `competition.published` | соревнование опубликовано, открыт приём заявок |
| `application.approved` | одобрена заявка на участие |
| `protocol.published` | опубликован протокол (вручную или через импорт) |

Тело запроса:

```json
{"event": "protocol.published", "data": {"competition_id": 12, "title": "...", "number": "2026-0012"}, "delivery_id": 5}
```

Заголовки: `X-FSP-Event` и `X-FSP-Signature: sha256=<hex>`. Подпись - HMAC-SHA256 от тела, ключом служит секрет вебхука. Проверка на стороне получателя:

```python
import hashlib, hmac
expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, request.headers["X-FSP-Signature"])
```

Журнал последних доставок (код ответа или ошибка) виден в разделе "Интеграции".

## 3. ФСП ID - вход через OpenID Connect (Д1)

| Эндпоинт | Назначение |
|---|---|
| `GET /.well-known/openid-configuration` | discovery-документ |
| `GET /oauth/authorize` | начало входа: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256` |
| `POST /oauth/token` | обмен `code` + `code_verifier` на `id_token` и `access_token` (RS256) |
| `GET /oauth/userinfo` | данные пользователя по `access_token` |
| `GET /oauth/jwks` | открытый ключ для проверки подписи |

Scopes и данные в userinfo:

| Scope | Данные |
|---|---|
| `openid` | `sub` |
| `profile` | `name`, `family_name`, `given_name`, `middle_name` |
| `email` | `email` |
| `roles` | `roles` |
| `sport` | `disciplines`, `sport_rank` |

Порядок входа:

1. Приложение перенаправляет пользователя на `/oauth/authorize`.
2. Провайдер проверяет `client_id` и `redirect_uri`, затем открывает страницу согласия `/oauth/consent` во фронтенде платформы.
3. Пользователь входит, если ещё не вошёл, и видит, какие данные запрашивает приложение.
4. После "Разрешить" браузер возвращается на `redirect_uri?code=...&state=...`. Код одноразовый и живёт 5 минут.
5. Приложение меняет код на токены. PKCE обязателен; для публичных клиентов секрет не нужен.

Тестовое приложение: http://localhost:8000/demo-client/. Его клиент `demo-client` уже зарегистрирован в демо-данных. Новые клиенты федерация регистрирует в разделе "Интеграции и ФСП ID".
