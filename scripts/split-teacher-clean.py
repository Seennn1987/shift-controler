#!/usr/bin/env python3
"""Clean split of teacher main.js.bak into ES modules."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEACHER = ROOT / "src" / "teacher"
BAK = TEACHER / "main.js.bak"

STATE_VARS = [
    "regularClosedDays", "holidayAutoDetect", "customClosures",
    "classroomSettingsTimer", "myAdminUid", "myTeacherId", "myTeacherName",
    "curYear", "curMonth", "scheduleDoc", "pendingRequests", "localOverrides",
    "scheduleTimer", "lastLocalScheduleEditAt", "newAssignments",
    "myAssignmentEntries", "myCalYear", "myCalMonth", "myAssignTimer",
]

SHARED = (
    "import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';\n"
    "import { HOLIDAYS_JP } from '../shared/holidays.js';\n"
    "import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';\n"
)
FROM_STATE = "import { fbAuth, fbDb, S } from './state.js';\n"

EXPORTS = {
    "day-status.js": ["findCustomClosure", "getDayStatus"],
    "debug.js": ["debugLog"],
    "classroom-settings.js": ["startClassroomSettingsListener"],
    "schedule-utils.js": ["cycleState", "labelFor", "cellKey"],
    "auth.js": ["showLogin", "handleLogin", "bootstrap"],
    "schedule.js": ["startScheduleListener", "saveMonthEntry", "loadMyPendingRequests"],
    "approvals.js": [
        "loadNewAssignments", "findPendingTicket", "refreshPendingAndRender",
        "approveTicket", "startMyAssignmentsListener",
    ],
    "calendar.js": ["renderMyCalendar"],
    "shift-ui.js": [
        "getMonthEntry", "render", "renderKeepingOverrides", "baselineState",
        "effectiveState", "buildCellHtml", "handleCellClick", "updateSendButtonState",
        "sendPendingChanges",
    ],
}

IMPORTS = {
    "day-status.js": [],
    "debug.js": [],
    "classroom-settings.js": ["debug.js:debugLog", "calendar.js:renderMyCalendar"],
    "schedule-utils.js": [],
    "auth.js": [
        "debug.js:debugLog",
        "classroom-settings.js:startClassroomSettingsListener",
        "schedule.js:startScheduleListener,loadMyPendingRequests",
        "approvals.js:loadNewAssignments,startMyAssignmentsListener",
        "calendar.js:renderMyCalendar",
        "shift-ui.js:render",
    ],
    "schedule.js": ["debug.js:debugLog", "shift-ui.js:renderKeepingOverrides"],
    "approvals.js": ["debug.js:debugLog", "calendar.js:renderMyCalendar"],
    "calendar.js": [
        "day-status.js:getDayStatus",
        "approvals.js:findPendingTicket,approveTicket",
    ],
    "shift-ui.js": [
        "schedule-utils.js:cycleState,labelFor,cellKey",
        "schedule.js:saveMonthEntry",
    ],
    "init.js": ["calendar.js:renderMyCalendar", "shift-ui.js:render,sendPendingChanges"],
}


def to_s(text: str) -> str:
    for var in sorted(STATE_VARS, key=len, reverse=True):
        text = re.sub(rf"(?<![.\w]){var}\b", f"S.{var}", text)
    return text.replace("S.S.", "S.")


def strip_lets(text: str) -> str:
    for var in STATE_VARS:
        text = re.sub(rf"^let {var}[^;\n]*;\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^const debugLines = \[\];\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^const DAY_ORDER = \{[^}]+\};\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^let scheduleTimer = null[^\n]*\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^let lastLocalScheduleEditAt = 0[^\n]*\n?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^let myAssignTimer = null;\n?", "", text, flags=re.MULTILINE)
    return text


def header(name: str) -> str:
    lines = [SHARED, FROM_STATE]
    for spec in IMPORTS.get(name, []):
        mod, syms = spec.split(":")
        lines.append(f"import {{ {syms} }} from './{mod}';\n")
    return "".join(lines) + "\n"


def write(name: str, body: str) -> None:
    body = to_s(strip_lets(body.strip()))
    exp = EXPORTS.get(name, [])
    exp_line = f"\nexport {{ {', '.join(exp)} }};\n" if exp else "\n"
    extra = "const debugLines = [];\n\n" if name == "debug.js" else ""
    (TEACHER / name).write_text(header(name) + extra + body + exp_line, encoding="utf-8")
    print(f"wrote {name}")


def slice_text(full: str, start: str, end: str | None) -> str:
    i = full.find(start)
    j = len(full) if end is None else full.find(end, i)
    return full[i:j].strip()


def main() -> None:
    full = BAK.read_text(encoding="utf-8")
    # drop top imports/init
    full = re.sub(r"^import[\s\S]*?console\.log\([^)]+\);\n\n?", "", full, count=1)

    write("day-status.js", slice_text(full, "function findCustomClosure", "let classroomSettingsTimer"))
    write("debug.js", slice_text(full, "// ---- 診断パネル", "function startClassroomSettingsListener"))
    write("classroom-settings.js", slice_text(full, "function startClassroomSettingsListener", "function cycleState"))
    write("schedule-utils.js", slice_text(full, "function cycleState", "function showLogin"))
    write("auth.js", slice_text(full, "function showLogin", "let scheduleTimer"))
    write("schedule.js", slice_text(full, "function startScheduleListener", "// ---- 新しく決まった授業の承認"))
    write("approvals.js", slice_text(full, "// ---- 新しく決まった授業の承認", "// タブ切り替え"))
    write("init.js", slice_text(full, "// タブ切り替え", "// ---- マイカレンダー"))
    write("calendar.js", slice_text(full, "// ---- マイカレンダー", "function getMonthEntry"))
    write("shift-ui.js", slice_text(full, "function getMonthEntry", None))

    (TEACHER / "main.js").write_text(
        "\n".join(
            f"import './{f}';"
            for f in [
                "state.js", "day-status.js", "debug.js", "classroom-settings.js",
                "schedule-utils.js", "schedule.js", "approvals.js", "calendar.js",
                "shift-ui.js", "auth.js", "init.js",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    print("wrote main.js")


if __name__ == "__main__":
    main()
