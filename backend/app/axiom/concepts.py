from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ConceptTerm:
    key: str
    title_ru: str
    title_en: str
    title_kk: str
    keywords: tuple[str, ...]


CONCEPTS: tuple[ConceptTerm, ...] = (
    ConceptTerm(
        "pressure_velocity",
        "Давление и скорость потока",
        "Pressure and flow speed",
        "Қысым мен ағын жылдамдығы",
        ("давлен", "pressure", "қысым", "скорост", "speed", "velocity", "жылдам"),
    ),
    ConceptTerm(
        "continuity",
        "Неразрывность потока",
        "Flow continuity",
        "Ағын үзіліссіздігі",
        ("неразрыв", "continuity", "үзіліссіз", "сечение", "cross-section", "қима"),
    ),
    ConceptTerm(
        "streamline",
        "Линия тока",
        "Streamline",
        "Ағын сызығы",
        ("линия тока", "streamline", "ағын сызығы", "streamline"),
    ),
    ConceptTerm(
        "bernoulli_energy",
        "Уравнение Бернулли",
        "Bernoulli equation",
        "Бернулли теңдеуі",
        ("бернулли", "bernoulli", "энерг", "energy", "энергия"),
    ),
    ConceptTerm(
        "lift",
        "Подъёмная сила",
        "Lift",
        "Көтеру күші",
        ("подъём", "подъем", "lift", "көтеру", "крыл", "wing", "қанат"),
    ),
    ConceptTerm(
        "venturi",
        "Эффект Вентури",
        "Venturi effect",
        "Вентури әсері",
        ("вентури", "venturi", "сужение", "narrow", "тар"),
    ),
    ConceptTerm(
        "ideal_fluid",
        "Идеальная жидкость",
        "Ideal fluid",
        "Идеал сұйықтық",
        ("идеальн", "ideal", "идеал", "невязк", "inviscid", "турбулент"),
    ),
)


def concept_title(text: str, language: str = "en") -> str:
    for concept in CONCEPTS:
        if any(keyword in text.lower() for keyword in concept.keywords):
            if language == "ru":
                return concept.title_ru
            if language == "kk":
                return concept.title_kk
            return concept.title_en
    return {"ru": "Ключевая идея", "kk": "Негізгі идея"}.get(language, "Key idea")


def concept_key(text: str) -> str | None:
    """Return a stable lecture concept key, independent of display language."""

    for concept in CONCEPTS:
        if any(keyword in text.lower() for keyword in concept.keywords):
            return concept.key
    return None


def concept_for_segments(texts: list[str], language: str = "en") -> str:
    return concept_title(" ".join(texts), language)
