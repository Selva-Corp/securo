"""Server-rendered alert text (fork feature).

Push notifications leave the app, so they need final text at send time. The
in-app inbox re-renders from `kind` + `payload` through i18next, which keeps
it in sync with the UI language; these templates only need to cover the
languages that reach a phone.
"""

from decimal import Decimal
from typing import Any

_TEMPLATES: dict[str, dict[str, tuple[str, str]]] = {
    "en": {
        "upcoming_bill": ("{name} is due {date}", "{amount} expected on {date}."),
        "new_subscription_detected": ("New subscription: {name}", "{amount} {cadence}. Track it or ignore it in Subscriptions."),
        "price_increase": ("{name} costs more now", "Was {old_amount}, now {new_amount}."),
        "charge_after_cancel": ("{name} charged you again", "{amount} on {date}, after you marked it cancelled."),
        "low_balance": ("Low balance: {account}", "Balance is {amount}."),
        "large_transaction": ("Large charge: {name}", "{amount} on {date} ({account})."),
        "unusual_spend": ("Unusual spending in {category}", "{amount} so far this month, {percent}% above your usual."),
        "budget_exceeded": ("Over budget: {category}", "{amount} spent of a {budget} budget."),
        "sync_failed": ("Bank sync needs attention", "{name} could not sync. Open Accounts to reconnect."),
        "test": ("Securo alerts are working", "This is a test notification from {workspace}."),
    },
    "pt-BR": {
        "upcoming_bill": ("{name} vence {date}", "{amount} previsto para {date}."),
        "new_subscription_detected": ("Nova assinatura: {name}", "{amount} {cadence}. Acompanhe ou ignore em Assinaturas."),
        "price_increase": ("{name} ficou mais caro", "Era {old_amount}, agora {new_amount}."),
        "charge_after_cancel": ("{name} cobrou de novo", "{amount} em {date}, depois de marcado como cancelado."),
        "low_balance": ("Saldo baixo: {account}", "O saldo está em {amount}."),
        "large_transaction": ("Gasto alto: {name}", "{amount} em {date} ({account})."),
        "unusual_spend": ("Gasto fora do normal em {category}", "{amount} até agora neste mês, {percent}% acima do habitual."),
        "budget_exceeded": ("Orçamento estourado: {category}", "{amount} gastos de um orçamento de {budget}."),
        "sync_failed": ("Sincronização bancária precisa de atenção", "{name} não sincronizou. Abra Contas para reconectar."),
        "test": ("Alertas do Securo funcionando", "Esta é uma notificação de teste de {workspace}."),
    },
}

_CADENCE_WORDS = {
    "en": {"weekly": "weekly", "biweekly": "every 2 weeks", "monthly": "monthly", "quarterly": "quarterly", "yearly": "yearly"},
    "pt-BR": {"weekly": "por semana", "biweekly": "a cada 2 semanas", "monthly": "por mês", "quarterly": "por trimestre", "yearly": "por ano"},
}


def _language(language: str | None) -> str:
    if not language:
        return "en"
    if language in _TEMPLATES:
        return language
    base = language.split("-")[0]
    for candidate in _TEMPLATES:
        if candidate.split("-")[0] == base:
            return candidate
    return "en"


def format_amount(amount: Any, currency: str | None) -> str:
    try:
        value = Decimal(str(amount))
    except Exception:
        return str(amount)
    text = f"{value:,.2f}"
    return f"{text} {currency}" if currency else text


class _Safe(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render(kind: str, payload: dict, language: str | None) -> tuple[str, str]:
    """Return (title, body) for a kind, with unknown kinds falling back safely."""
    lang = _language(language)
    table = _TEMPLATES[lang]
    title_tpl, body_tpl = table.get(kind) or _TEMPLATES["en"].get(kind) or ("{name}", "{body}")
    values = _Safe(payload)
    if "cadence" in payload:
        values["cadence"] = _CADENCE_WORDS[lang].get(payload["cadence"], payload["cadence"])
    return title_tpl.format_map(values)[:200], body_tpl.format_map(values)[:1000]
