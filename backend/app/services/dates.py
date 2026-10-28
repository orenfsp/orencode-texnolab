from datetime import date


def add_years(d: date, n: int) -> date:
    try:
        return d.replace(year=d.year + n)
    except ValueError:
        return d.replace(year=d.year + n, day=28)


def valid_until(assigned: date, validity_years: int | None) -> date | None:
    return add_years(assigned, validity_years) if validity_years else None


def days_left(until: date | None, today: date | None = None) -> int | None:
    return (until - (today or date.today())).days if until else None
