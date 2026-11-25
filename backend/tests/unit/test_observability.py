from __future__ import annotations

import logging
import sys

from app.observability import JsonFormatter


def test_formatter_does_not_emit_exception_text_or_professor_identifier() -> None:
    record = logging.LogRecord(
        name="daris.test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="request failed %s",
        args=("placeholder-raw-token",),
        exc_info=None,
    )
    record.professor_id = "person-identifier"
    record.reason = "192.0.2.10"
    record.event = "placeholder-raw-token"
    try:
        raise RuntimeError("raw-token-and-personal-data")
    except RuntimeError:
        record.exc_info = sys.exc_info()

    formatted = JsonFormatter().format(record)
    assert "person-identifier" not in formatted
    assert "192.0.2.10" not in formatted
    assert "placeholder-raw-token" not in formatted
    assert "raw-token-and-personal-data" not in formatted
    assert '"error_type":"RuntimeError"' in formatted
