#!/usr/bin/env python3
"""Fix admin ES modules: mutable state object + cross-module imports."""
import re
from pathlib import Path

ADMIN = Path(__file__).resolve().parent.parent / "src" / "admin"

STATE_VARS = [
    "teacherSchedules", "referenceYearMonth", "teachers", "editingId", "dataReady",
    "formRaiseSchedule", "students", "editingStudentId", "studentDataReady",
    "assignments", "pendingAssignments", "roomCapacity", "teacherCapacity",
    "tuitionRates", "saveTimer", "firestoreReady", "secondaryFbApp",
    "teacherScheduleUnsub", "approvalPromotionUnsub", "syncClosureSettingsTimer",
    "syncTeacherAssignmentsTimer", "absences", "teacherAbsences", "teacherSubstitutions",
    "finGradientMin", "finGradientMax", "preferredPairs", "terms", "editingTermId",
    "regularClosedDays", "holidayAutoDetect", "customClosures", "editingClosureId",
    "calYear", "calMonth", "calSelectedDate", "calFilterStudentId", "tsSelectedTeacherId",
    "formCourses", "finYear", "finMonth", "finIncludeTransport", "calWeekAnchor",
    "weekAxis", "calMode", "appInitialized",
]

SHARED_IMPORT = (
    "import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';\n"
    "import { HOLIDAYS_JP } from '../shared/holidays.js';\n"
    "import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';\n"
)

STATE_IMPORT = (
    "import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';\n"
)

EXPORTS_BY_FILE = {}
for path in sorted(ADMIN.glob("*.js")):
    if path.name in ("main.js", "state.js"):
        continue
    text = path.read_text(encoding="utf-8")
    m = re.search(r"export\s*\{([^}]+)\}", text)
    if m:
        names = [n.strip().split(" as ")[0].strip() for n in m.group(1).split(",") if n.strip()]
        EXPORTS_BY_FILE[path.name] = names

SYMBOL_TO_FILE = {}
for fname, names in EXPORTS_BY_FILE.items():
    mod = "./" + fname
    for n in names:
        if n in SYMBOL_TO_FILE and SYMBOL_TO_FILE[n] != mod:
            print(f"WARN duplicate export {n}: {SYMBOL_TO_FILE[n]} vs {mod}")
        SYMBOL_TO_FILE[n] = mod

BUILTINS = {
    "console", "document", "window", "Math", "Date", "JSON", "Object", "Array",
    "String", "Number", "Boolean", "Promise", "Set", "Map", "Error", "parseInt",
    "parseFloat", "isNaN", "alert", "confirm", "setTimeout", "clearTimeout",
    "firebase", "Intl", "RegExp", "encodeURIComponent", "decodeURIComponent",
    "localStorage", "sessionStorage", "fetch", "AbortController", "URL",
}


def local_definitions(text: str) -> set[str]:
    defs = set()
    for m in re.finditer(r"(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", text):
        defs.add(m.group(1))
    for m in re.finditer(r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", text):
        defs.add(m.group(1))
    for m in re.finditer(r"export\s*\{([^}]+)\}", text):
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            if " as " in part:
                defs.add(part.split(" as ")[1].strip())
            else:
                defs.add(part)
    return defs


def replace_state_vars(text: str) -> str:
    for var in sorted(STATE_VARS, key=len, reverse=True):
        # Skip if already S.var
        text = re.sub(rf"(?<!S\.)\b{var}\b", f"S.{var}", text)
    # Fix double S.S.
    text = text.replace("S.S.", "S.")
    return text


def needed_imports(text: str, local_defs: set[str]) -> dict[str, list[str]]:
    needed: dict[str, list[str]] = {}
    for sym, mod in SYMBOL_TO_FILE.items():
        if sym in local_defs or sym in BUILTINS:
            continue
        if re.search(rf"\b{re.escape(sym)}\b", text):
            needed.setdefault(mod, []).append(sym)
    return needed


def build_import_block(cross: dict[str, list[str]]) -> str:
    lines = [SHARED_IMPORT, STATE_IMPORT]
    for mod in sorted(cross.keys()):
        syms = sorted(set(cross[mod]))
        lines.append(f"import {{ {', '.join(syms)} }} from '{mod}';\n")
    return "".join(lines)


def process_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    # Remove old import block (first 4 lines typically)
    text = re.sub(
        r"^import \{ SUBJECT_MAP.*?from '\./state\.js';\n\n?",
        "",
        text,
        count=1,
        flags=re.DOTALL,
    )
    text = replace_state_vars(text)
    local = local_definitions(text)
    cross = needed_imports(text, local)
    header = build_import_block(cross)
    if not text.startswith("import "):
        text = header + "\n" + text.lstrip("\n")
    else:
        text = header + "\n" + text
    path.write_text(text, encoding="utf-8")
    print(f"Updated {path.name}: cross-imports from {list(cross.keys())}")


def write_state_js() -> None:
    lines = [
        "import { firebaseConfig, initPrimaryFirebase } from '../shared/firebase-config.js';",
        "",
        "export { firebaseConfig };",
        "export const { fbAuth, fbDb } = initPrimaryFirebase();",
        "",
        "export const STORAGE_KEY = 'teacher-schedule-list';",
        "",
        "/** Mutable app state (ES modules cannot reassign imported bindings). */",
        "export const S = {",
    ]
    defaults = {
        "teacherSchedules": "[]",
        "referenceYearMonth": "''",
        "teachers": "[]",
        "editingId": "null",
        "dataReady": "false",
        "formRaiseSchedule": "[]",
        "students": "[]",
        "editingStudentId": "null",
        "studentDataReady": "false",
        "assignments": "[]",
        "pendingAssignments": "[]",
        "roomCapacity": "12",
        "teacherCapacity": "2",
        "tuitionRates": "{'小学':2900, '中学':3900, '高校':5200}",
        "saveTimer": "null",
        "firestoreReady": "false",
        "secondaryFbApp": "null",
        "teacherScheduleUnsub": "null",
        "approvalPromotionUnsub": "null",
        "syncClosureSettingsTimer": "null",
        "syncTeacherAssignmentsTimer": "null",
        "absences": "[]",
        "teacherAbsences": "[]",
        "teacherSubstitutions": "[]",
        "finGradientMin": "25",
        "finGradientMax": "60",
        "preferredPairs": "[]",
        "terms": "[]",
        "editingTermId": "null",
        "regularClosedDays": "['日']",
        "holidayAutoDetect": "false",
        "customClosures": "[]",
        "editingClosureId": "null",
        "calYear": "undefined",
        "calMonth": "undefined",
        "calSelectedDate": "null",
        "calFilterStudentId": "''",
        "tsSelectedTeacherId": "null",
        "formCourses": "[]",
        "finYear": "undefined",
        "finMonth": "undefined",
        "finIncludeTransport": "true",
        "calWeekAnchor": "null",
        "weekAxis": "'teacher'",
        "calMode": "'month'",
        "appInitialized": "false",
    }
    for var in STATE_VARS:
        lines.append(f"  {var}: {defaults[var]},")
    lines.extend([
        "};",
        "",
        "export function getSecondaryAuth(){",
        "  if(!S.secondaryFbApp){",
        "    S.secondaryFbApp = firebase.initializeApp(firebaseConfig, 'secondary');",
        "  }",
        "  return S.secondaryFbApp.auth();",
        "}",
        "",
    ])
    (ADMIN / "state.js").write_text("\n".join(lines), encoding="utf-8")
    print("Wrote state.js")


def main() -> None:
    write_state_js()
    for path in sorted(ADMIN.glob("*.js")):
        if path.name in ("main.js", "state.js"):
            continue
        process_file(path)
    print("Done.")


if __name__ == "__main__":
    main()
