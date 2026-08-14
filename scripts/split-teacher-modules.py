#!/usr/bin/env python3
"""Split src/teacher/main.js into ES modules with shared S state."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEACHER = ROOT / "src" / "teacher"
MAIN = TEACHER / "main.js"

STATE_VARS = [
    "regularClosedDays", "holidayAutoDetect", "customClosures",
    "classroomSettingsTimer", "myAdminUid", "myTeacherId", "myTeacherName",
    "curYear", "curMonth", "scheduleDoc", "pendingRequests", "localOverrides",
    "scheduleTimer", "lastLocalScheduleEditAt", "newAssignments",
    "myAssignmentEntries", "myCalYear", "myCalMonth", "myAssignTimer",
]

SECTIONS = [
    ("day-status.js", "// 休校日設定", "// ---- 診断パネル"),
    ("debug.js", "// ---- 診断パネル", "function cycleState"),
    ("schedule-utils.js", "function cycleState", "function showLogin"),
    ("auth.js", "function showLogin", "let scheduleTimer"),
    ("schedule.js", "let scheduleTimer", "// ---- 新しく決まった授業の承認"),
    ("approvals.js", "// ---- 新しく決まった授業の承認", "// タブ切り替え"),
    ("init.js", "// タブ切り替え", "// ---- マイカレンダー"),
    ("calendar.js", "// ---- マイカレンダー", "function getMonthEntry"),
    ("shift-ui.js", "function getMonthEntry", None),
]

SHARED_IMPORT = (
    "import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';\n"
    "import { HOLIDAYS_JP } from '../shared/holidays.js';\n"
    "import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';\n"
)
STATE_IMPORT = "import { fbAuth, fbDb, S, DAY_ORDER } from './state.js';\n"

EXPORTS_BY_FILE = {
    "day-status.js": ["findCustomClosure", "getDayStatus"],
    "debug.js": ["debugLog"],
    "schedule-utils.js": ["cycleState", "labelFor", "cellKey"],
    "auth.js": ["showLogin", "handleLogin", "bootstrap"],
    "schedule.js": [
        "startScheduleListener", "saveMonthEntry", "loadMyPendingRequests",
        "startClassroomSettingsListener",
    ],
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
    "init.js": [],
}

SYMBOL_TO_FILE = {}
for fname, names in EXPORTS_BY_FILE.items():
    for n in names:
        SYMBOL_TO_FILE[n] = "./" + fname

BUILTINS = {
    "console", "document", "window", "Math", "Date", "JSON", "Object", "Array",
    "String", "Number", "Boolean", "Promise", "Set", "Map", "Error", "parseInt",
    "parseFloat", "isNaN", "alert", "confirm", "setTimeout", "clearTimeout",
    "firebase", "clearInterval", "setInterval",
}


def extract_section(text: str, start: str, end: str | None) -> str:
    i = text.find(start)
    if i < 0:
        raise ValueError(f"start marker not found: {start!r}")
    j = len(text) if end is None else text.find(end, i + len(start))
    if end and j < 0:
        raise ValueError(f"end marker not found: {end!r}")
    return text[i:j].strip()


def replace_state_vars(text: str) -> str:
    for var in sorted(STATE_VARS, key=len, reverse=True):
        text = re.sub(rf"(?<!S\.)\b{var}\b", f"S.{var}", text)
    return text.replace("S.S.", "S.")


def local_definitions(text: str) -> set[str]:
    defs = set()
    for m in re.finditer(r"(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", text):
        defs.add(m.group(1))
    for m in re.finditer(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", text):
        defs.add(m.group(1))
    return defs


def needed_imports(text: str, local_defs: set[str]) -> dict[str, list[str]]:
    needed: dict[str, list[str]] = {}
    for sym, mod in SYMBOL_TO_FILE.items():
        if sym in local_defs or sym in BUILTINS:
            continue
        if re.search(rf"\b{re.escape(sym)}\b", text):
            needed.setdefault(mod, []).append(sym)
    return needed


def build_header(cross: dict[str, list[str]], extra: str = "") -> str:
    lines = [SHARED_IMPORT, STATE_IMPORT]
    if extra:
        lines.append(extra)
    for mod in sorted(cross.keys()):
        syms = sorted(set(cross[mod]))
        lines.append(f"import {{ {', '.join(syms)} }} from '{mod}';\n")
    return "".join(lines) + "\n"


def write_state_js() -> None:
    defaults = {
        "regularClosedDays": "['日']",
        "holidayAutoDetect": "false",
        "customClosures": "[]",
        "classroomSettingsTimer": "null",
        "myAdminUid": "null",
        "myTeacherId": "null",
        "myTeacherName": "''",
        "curYear": "undefined",
        "curMonth": "undefined",
        "scheduleDoc": "{months:{}}",
        "pendingRequests": "[]",
        "localOverrides": "{}",
        "scheduleTimer": "null",
        "lastLocalScheduleEditAt": "0",
        "newAssignments": "[]",
        "myAssignmentEntries": "[]",
        "myCalYear": "undefined",
        "myCalMonth": "undefined",
        "myAssignTimer": "null",
    }
    lines = [
        "import { initPrimaryFirebase } from '../shared/firebase-config.js';",
        "",
        "export const { fbAuth, fbDb } = initPrimaryFirebase();",
        "console.log('%cピタコマ 講師用ページ BUILD: 2026-08-14-v10', 'background:#d9822b;color:#fff;font-size:16px;font-weight:bold;padding:8px;');",
        "",
        "export const DAY_ORDER = {'月':0,'火':1,'水':2,'木':3,'金':4,'土':5,'日':6};",
        "",
        "/** Mutable app state */",
        "export const S = {",
    ]
    for var in STATE_VARS:
        lines.append(f"  {var}: {defaults[var]},")
    lines.append("};")
    lines.append("")
    (TEACHER / "state.js").write_text("\n".join(lines) + "\n", encoding="utf-8")


def process_file(fname: str, body: str) -> None:
    # Remove inline state declarations that moved to state.js
    for var in STATE_VARS:
        body = re.sub(rf"^let {var}[^;\n]*;\n?", "", body, flags=re.MULTILINE)
    body = re.sub(r"^let debugLines = \[\];\n?", "", body, flags=re.MULTILINE)
    body = re.sub(r"^const DAY_ORDER = \{[^}]+\};\n?", "", body, flags=re.MULTILINE)

    body = replace_state_vars(body)

    # Fix classroom settings load from Firestore
    body = body.replace(
        "S.regularClosedDays = d.S.regularClosedDays",
        "S.regularClosedDays = d.regularClosedDays",
    )
    body = body.replace("!!d.S.holidayAutoDetect", "!!d.holidayAutoDetect")
    body = body.replace("d.S.customClosures", "d.customClosures")

    local = local_definitions(body)
    cross = needed_imports(body, local)
    extra = ""
    if fname == "debug.js":
        extra = "const debugLines = [];\n"
    if fname == "schedule.js" and "startClassroomSettingsListener" in body:
        # classroom listener lives in schedule.js chunk from original
        pass
    header = build_header(cross, extra)
    exports = EXPORTS_BY_FILE.get(fname, [])
    export_line = f"\nexport {{ {', '.join(exports)} }};\n" if exports else "\n"
    (TEACHER / fname).write_text(header + body + export_line, encoding="utf-8")
    print(f"Wrote {fname}")


def write_main_js() -> None:
    order = [
        "./state.js",
        "./day-status.js",
        "./debug.js",
        "./schedule-utils.js",
        "./schedule.js",
        "./approvals.js",
        "./calendar.js",
        "./shift-ui.js",
        "./auth.js",
        "./init.js",
    ]
    lines = [f"import '{p}';" for p in order]
    (TEACHER / "main.js").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    text = MAIN.read_text(encoding="utf-8")
    # strip original imports and firebase init
    text = re.sub(
        r"^import.*?initPrimaryFirebase\(\);\n\n?",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )
    text = re.sub(r"^const \{ fbAuth, fbDb \} = initPrimaryFirebase\(\);\n", "", text)
    text = re.sub(r"^console\.log\('%cピタコマ 講師用ページ.*?\n\n?", "", text, flags=re.DOTALL)

    write_state_js()
    for fname, start, end in SECTIONS:
        body = extract_section(text, start, end)
        process_file(fname, body)

    # Move startClassroomSettingsListener from schedule chunk - it's before cycleState in original
    # Actually day-status starts at 休校日, debug has classroom listener
    # Re-read: classroom listener is in debug section (lines 43-66). Add to schedule.js or separate.
    # Patch schedule.js to import debugLog and renderMyCalendar for classroom listener in debug section
    debug_path = TEACHER / "debug.js"
    debug_body = debug_path.read_text(encoding="utf-8")
    if "startClassroomSettingsListener" in debug_body:
        # split debug vs classroom-settings
        m = re.search(
            r"(function startClassroomSettingsListener\(\)\{.*?\n\})\s*\n(function cycleState|\Z)",
            debug_body,
            flags=re.DOTALL,
        )
        if m:
            cls_fn = m.group(1)
            debug_only = debug_body.replace(cls_fn, "").strip()
            debug_path.write_text(debug_only + "\n", encoding="utf-8")
            sched_path = TEACHER / "schedule.js"
            sched = sched_path.read_text(encoding="utf-8")
            if "startClassroomSettingsListener" not in sched:
                insert = cls_fn + "\n\n"
                sched = sched.replace(
                    "import { fbAuth, fbDb, S, DAY_ORDER } from './state.js';\n",
                    "import { fbAuth, fbDb, S, DAY_ORDER } from './state.js';\n"
                    "import { debugLog } from './debug.js';\n"
                    "import { renderMyCalendar } from './calendar.js';\n"
                    "import { getDayStatus } from './day-status.js';\n",
                )
                sched = insert + sched.split("\n", 8)[-1]  # bad - let me do simpler
            # append to schedule.js before export
            if "function startClassroomSettingsListener" not in sched:
                sched = sched.replace(
                    "\nexport {",
                    "\n" + cls_fn + "\nexport {",
                )
                exports = EXPORTS_BY_FILE["schedule.js"]
                if "startClassroomSettingsListener" not in exports:
                    exports.append("startClassroomSettingsListener")
                export_names = ", ".join(exports)
                sched = re.sub(r"export \{[^}]+\};", f"export {{ {export_names} }};", sched)
                # fix header imports for schedule.js
                if "debugLog" not in sched:
                    sched = sched.replace(
                        "import { fbAuth, fbDb, S, DAY_ORDER } from './state.js';\n",
                        "import { fbAuth, fbDb, S, DAY_ORDER } from './state.js';\n"
                        "import { debugLog } from './debug.js';\n"
                        "import { renderMyCalendar } from './calendar.js';\n",
                    )
                sched_path.write_text(sched, encoding="utf-8")
                print("Moved startClassroomSettingsListener to schedule.js")

    # auth.js needs side-effect listeners - ensure bootstrap imports
    auth_path = TEACHER / "auth.js"
    auth = auth_path.read_text(encoding="utf-8")
    if "onAuthStateChanged" not in auth:
        pass
    # Re-process cross imports for all files
    for path in sorted(TEACHER.glob("*.js")):
        if path.name in ("main.js", "state.js"):
            continue
        body = path.read_text(encoding="utf-8")
        body = re.sub(r"^import .*?\n(?:import .*?\n)*", "", body, count=1)
        local = local_definitions(body)
        cross = needed_imports(body, local)
        extra = "const debugLines = [];\n" if path.name == "debug.js" else ""
        header = build_header(cross, extra)
        body = re.sub(r"^import .*?\n(?:import .*?\n)*", "", body)
        body = re.sub(r"\nexport \{[^}]+\};\n?$", "", body).rstrip() + "\n"
        exports = EXPORTS_BY_FILE.get(path.name, [])
        export_line = f"export {{ {', '.join(exports)} }};\n" if exports else ""
        path.write_text(header + body + "\n" + export_line, encoding="utf-8")

    write_main_js()
    print("Done.")


if __name__ == "__main__":
    main()
