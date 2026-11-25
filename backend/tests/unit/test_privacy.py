from __future__ import annotations

from app.services.privacy import find_privacy_violations


def test_professor_name_is_explicitly_allowlisted() -> None:
    rows = [
        {"table_name": "professors", "column_name": "name"},
        {"table_name": "lectures", "column_name": "join_code"},
    ]
    assert find_privacy_violations(rows) == []


def test_student_identity_columns_are_rejected() -> None:
    rows = [
        {"table_name": "students", "column_name": "student_id"},
        {"table_name": "signals", "column_name": "user_id"},
        {"table_name": "signals", "column_name": "email"},
        {"table_name": "signals", "column_name": "ip_address"},
        {"table_name": "signals", "column_name": "device_id"},
        {"table_name": "signals", "column_name": "name"},
    ]
    violations = find_privacy_violations(rows)
    assert violations == [
        "signals.device_id",
        "signals.email",
        "signals.ip_address",
        "signals.name",
        "signals.user_id",
        "students.student_id",
    ]
