
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from ..deps import DB, AdminPrincipal, CurrentPrincipal, JudgePrincipal, ReaderPrincipal
from ..models import (
    Competition,
    CompetitionStatus,
    JudgeAssignment,
    JudgeCategory,
    JudgeCategoryRequest,
    JudgePosition,
    JudgeProfile,
    JudgeQualification,
    RequestKind,
    RequestStatus,
    Role,
    User,
)
from ..models.base import utcnow
from ..services import documents as docs
from ..services.audit import log_action
from ..services.dates import days_left, valid_until
from ..services.notifications import notify, notify_role

router = APIRouter(prefix="/api", tags=["judges"])


def current_qualification(db: DB, judge_id: int) -> JudgeQualification | None:
    return db.scalars(
        select(JudgeQualification)
        .where(JudgeQualification.judge_id == judge_id)
        .order_by(JudgeQualification.assigned_at.desc())
    ).first()


class JudgeOut(BaseModel):
    id: int
    full_name: str
    municipality: str | None
    category: str | None
    category_id: int | None
    assigned_at: date | None
    order_number: str | None
    valid_until: date | None
    days_left: int | None
    competitions: int


def judge_out(db: DB, u: User) -> JudgeOut:
    q = current_qualification(db, u.id)
    return JudgeOut(
        id=u.id,
        full_name=u.full_name,
        municipality=u.municipality.name if u.municipality else None,
        category=q.category.name if q else None,
        category_id=q.category_id if q else None,
        assigned_at=q.assigned_at if q else None,
        order_number=q.order_number if q else None,
        valid_until=q.valid_until if q else None,
        days_left=days_left(q.valid_until) if q else None,
        competitions=db.scalar(select(func.count(JudgeAssignment.id)).where(JudgeAssignment.judge_id == u.id)),
    )


@router.get("/admin/registry/judges", response_model=list[JudgeOut])
def judges_registry(db: DB, _: ReaderPrincipal, q: str | None = None):
    stmt = select(User).join(JudgeProfile, JudgeProfile.user_id == User.id).order_by(User.last_name)
    if q:
        stmt = stmt.where(User.last_name.ilike(f"%{q}%"))
    return [judge_out(db, u) for u in db.scalars(stmt)]


class QualificationIn(BaseModel):
    category_id: int
    assigned_at: date
    order_number: str


def _assign_category(db: DB, judge_id: int, data: QualificationIn) -> JudgeQualification:
    cat = db.get(JudgeCategory, data.category_id)
    if cat is None:
        raise HTTPException(422, "Неизвестная категория")
    q = JudgeQualification(
        judge_id=judge_id,
        category_id=cat.id,
        assigned_at=data.assigned_at,
        order_number=data.order_number,
        valid_until=valid_until(data.assigned_at, cat.validity_years),
    )
    db.add(q)
    return q


@router.post("/admin/judges/{judge_id}/qualification", response_model=JudgeOut)
def set_qualification(judge_id: int, data: QualificationIn, db: DB, p: AdminPrincipal):
    judge = db.get(User, judge_id)
    if judge is None or Role.JUDGE not in judge.role_set:
        raise HTTPException(404, "Судья не найден")
    _assign_category(db, judge_id, data)
    log_action(db, p, "assign", "judge_category", judge_id, category_id=data.category_id, order=data.order_number)
    notify(db, judge_id, "Присвоена судейская категория", f"Приказ {data.order_number}", "/judge")
    db.commit()
    return judge_out(db, judge)




class RequestIn(BaseModel):
    category_id: int
    kind: RequestKind
    justification: str | None = None


class RequestOut(BaseModel):
    id: int
    judge_id: int
    judge_name: str
    category: str
    kind: RequestKind
    justification: str | None
    status: RequestStatus
    comment: str | None
    created_at: str


def request_out(r: JudgeCategoryRequest) -> RequestOut:
    return RequestOut(
        id=r.id,
        judge_id=r.judge_id,
        judge_name=r.judge.full_name,
        category=r.category.name,
        kind=r.kind,
        justification=r.justification,
        status=r.status,
        comment=r.comment,
        created_at=r.created_at.isoformat(),
    )


class MyJudgeOut(BaseModel):
    qualification: JudgeOut
    requests: list[RequestOut]


@router.get("/me/judge", response_model=MyJudgeOut)
def my_judge(db: DB, p: JudgePrincipal):
    reqs = db.scalars(
        select(JudgeCategoryRequest).where(JudgeCategoryRequest.judge_id == p.id).order_by(JudgeCategoryRequest.id.desc())
    ).all()
    return MyJudgeOut(qualification=judge_out(db, p.user), requests=[request_out(r) for r in reqs])


@router.post("/me/judge-requests", response_model=RequestOut, status_code=201)
def submit_judge_request(data: RequestIn, db: DB, p: JudgePrincipal):
    if db.get(JudgeCategory, data.category_id) is None:
        raise HTTPException(422, "Неизвестная категория")
    pending = db.scalar(
        select(JudgeCategoryRequest.id).where(
            JudgeCategoryRequest.judge_id == p.id, JudgeCategoryRequest.status == RequestStatus.SUBMITTED
        )
    )
    if pending:
        raise HTTPException(409, "Предыдущая заявка ещё рассматривается")
    r = JudgeCategoryRequest(judge_id=p.id, **data.model_dump())
    db.add(r)
    db.flush()
    log_action(db, p, "create", "judge_category_request", r.id)
    notify_role(db, Role.ADMIN, "Заявка на судейскую категорию", p.user.full_name, "/admin/judges")
    db.commit()
    db.refresh(r)
    return request_out(r)




@router.get("/admin/judge-requests", response_model=list[RequestOut])
def judge_requests(db: DB, _: ReaderPrincipal, status: RequestStatus | None = None):
    stmt = select(JudgeCategoryRequest).order_by(JudgeCategoryRequest.id.desc())
    if status:
        stmt = stmt.where(JudgeCategoryRequest.status == status)
    return [request_out(r) for r in db.scalars(stmt)]


class DecisionIn(BaseModel):
    order_number: str | None = None
    assigned_at: date | None = None
    comment: str | None = None


@router.post("/admin/judge-requests/{req_id}/{decision}", response_model=RequestOut)
def decide_judge_request(req_id: int, decision: str, data: DecisionIn, db: DB, p: AdminPrincipal):
    r = db.get(JudgeCategoryRequest, req_id)
    if r is None:
        raise HTTPException(404, "Заявка не найдена")
    if r.status != RequestStatus.SUBMITTED:
        raise HTTPException(409, "Заявка уже рассмотрена")
    if decision == "approve":
        if not data.order_number:
            raise HTTPException(422, "Укажите номер приказа")
        _assign_category(
            db, r.judge_id, QualificationIn(category_id=r.category_id, assigned_at=data.assigned_at or date.today(), order_number=data.order_number)
        )
        r.status = RequestStatus.APPROVED
    elif decision == "reject":
        if not data.comment:
            raise HTTPException(422, "Укажите причину отказа")
        r.status = RequestStatus.REJECTED
    else:
        raise HTTPException(404, "Неизвестное действие")
    r.comment = data.comment
    r.decided_at = utcnow()
    log_action(db, p, "status", "judge_category_request", r.id, new=r.status.value)
    notify(db, r.judge_id, "Заявка на категорию рассмотрена", f"{r.category.name}: {'одобрена' if r.status == RequestStatus.APPROVED else 'отклонена'}", "/judge")
    db.commit()
    return request_out(r)




class PanelIn(BaseModel):
    judge_id: int
    position_id: int


class PanelOut(BaseModel):
    id: int
    judge_id: int
    full_name: str
    position_id: int
    position: str
    category: str | None


def panel(db: DB, comp_id: int) -> list[PanelOut]:
    out = []
    for ja in db.scalars(select(JudgeAssignment).where(JudgeAssignment.competition_id == comp_id).order_by(JudgeAssignment.id)):
        q = current_qualification(db, ja.judge_id)
        out.append(PanelOut(id=ja.id, judge_id=ja.judge_id, full_name=ja.judge.full_name, position_id=ja.position_id,
                            position=ja.position.name, category=q.category.name if q else None))
    return out


@router.get("/competitions/{comp_id}/judges", response_model=list[PanelOut])
def get_panel(comp_id: int, db: DB, _: CurrentPrincipal):
    return panel(db, comp_id)


@router.post("/competitions/{comp_id}/judges", response_model=list[PanelOut])
def assign_judge(comp_id: int, data: PanelIn, db: DB, p: AdminPrincipal):
    comp = db.get(Competition, comp_id)
    if comp is None:
        raise HTTPException(404, "Соревнование не найдено")
    judge = db.get(User, data.judge_id)
    if judge is None or Role.JUDGE not in judge.role_set:
        raise HTTPException(422, "Пользователь не является судьёй")
    if db.get(JudgePosition, data.position_id) is None:
        raise HTTPException(422, "Неизвестная должность")
    if db.scalar(select(JudgeAssignment.id).where(JudgeAssignment.competition_id == comp_id, JudgeAssignment.judge_id == data.judge_id)):
        raise HTTPException(409, "Судья уже в коллегии")
    db.add(JudgeAssignment(competition_id=comp_id, judge_id=data.judge_id, position_id=data.position_id))
    pos = db.get(JudgePosition, data.position_id)
    notify(db, data.judge_id, "Назначение на соревнование", f"«{comp.title}»: {pos.name}", "/judge")
    log_action(db, p, "create", "judge_assignment", comp_id, judge_id=data.judge_id, position=pos.name)
    db.commit()
    return panel(db, comp_id)


@router.delete("/competitions/{comp_id}/judges/{assignment_id}", response_model=list[PanelOut])
def remove_judge(comp_id: int, assignment_id: int, db: DB, p: AdminPrincipal):
    ja = db.get(JudgeAssignment, assignment_id)
    if ja is None or ja.competition_id != comp_id:
        raise HTTPException(404, "Назначение не найдено")
    if ja.competition.status == CompetitionStatus.COMPLETED:
        raise HTTPException(409, "Протокол опубликован - состав коллегии зафиксирован")
    db.delete(ja)
    log_action(db, p, "delete", "judge_assignment", comp_id, judge_id=ja.judge_id)
    db.commit()
    return panel(db, comp_id)




@router.get("/competitions/{comp_id}/judges.docx")
def panel_certificate(comp_id: int, db: DB, _: ReaderPrincipal):
    comp = db.get(Competition, comp_id)
    if comp is None:
        raise HTTPException(404, "Соревнование не найдено")
    doc = docs.new_doc(
        "СПРАВКА о составе судейской коллегии",
        [f"Соревнование: {comp.title}", f"Дисциплина: {comp.discipline.name}",
         f"Сроки проведения: {comp.start_date:%d.%m.%Y} – {comp.end_date:%d.%m.%Y}", f"Место: {comp.venue or '-'}"],
    )
    rows = panel(db, comp_id)
    docs.add_table(doc, ["№", "ФИО", "Судейская должность", "Судейская категория"],
                   [(i, r.full_name, r.position, r.category or "-") for i, r in enumerate(rows, 1)])
    docs.signature(doc, "Председатель регионального отделения")
    return docs.file_response(docs.docx_bytes(doc), f"judges_panel_{comp_id}.docx")


def _judge_history(db: DB, judge_id: int) -> list[tuple]:
    items = db.scalars(select(JudgeAssignment).where(JudgeAssignment.judge_id == judge_id)).all()
    items.sort(key=lambda j: j.competition.start_date)
    return [
        (i, j.competition.title, j.competition.discipline.name, f"{j.competition.start_date:%d.%m.%Y}",
         j.competition.venue or "-", j.position.name)
        for i, j in enumerate(items, 1)
    ]


@router.get("/judges/{judge_id}/report.{fmt}")
def judge_report(judge_id: int, fmt: str, db: DB, p: CurrentPrincipal):
    if p.id != judge_id and p.role not in (Role.ADMIN, Role.MINISTRY):
        raise HTTPException(403, "Отчёт доступен самому судье и федерации")
    judge = db.get(User, judge_id)
    if judge is None:
        raise HTTPException(404, "Судья не найден")
    q = current_qualification(db, judge_id)
    cols = ["№", "Соревнование", "Дисциплина", "Дата", "Место", "Судейская должность"]
    rows = _judge_history(db, judge_id)
    title = f"Отчёт о судейской практике: {judge.full_name}"
    if fmt == "xlsx":
        return docs.file_response(docs.xlsx_bytes({"Судейство": (cols, rows)}, title), f"judge_report_{judge_id}.xlsx")
    if fmt != "docx":
        raise HTTPException(404, "Поддерживаются xlsx и docx")
    doc = docs.new_doc("ОТЧЁТ о соревнованиях, на которых работал спортивный судья",
                       [f"Судья: {judge.full_name}", f"Категория: {q.category.name if q else '-'}"
                        + (f", действует до {q.valid_until:%d.%m.%Y}" if q and q.valid_until else "")])
    docs.add_table(doc, cols, rows)
    docs.signature(doc, "Председатель регионального отделения")
    return docs.file_response(docs.docx_bytes(doc), f"judge_report_{judge_id}.docx")
