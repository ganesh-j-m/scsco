import type { FormFieldDef } from "@/types/admin";

export type Answers = Record<string, unknown>;

/** Same rules as the server: a field is shown when its condition holds and the field it depends on is shown. */
export function visibleIds(fields: Pick<FormFieldDef, "id" | "conditionalLogic">[], answers: Answers): Set<string> {
  const visible = new Set<string>();
  for (const f of fields) {
    const l = f.conditionalLogic;
    if (!l) { visible.add(f.id); continue; }
    const a = answers[l.fieldId];
    const eq = Array.isArray(a) ? a.map(String).includes(l.value) : String(a ?? "") === l.value;
    if (visible.has(l.fieldId) && (l.operator === "equals" ? eq : !eq)) visible.add(f.id);
  }
  return visible;
}

export const FIELD_LABELS: Record<FormFieldDef["type"], string> = {
  SHORT_TEXT: "Short answer", LONG_TEXT: "Paragraph", NUMBER: "Number", EMAIL: "Email", PHONE: "Phone number", DATE: "Date",
  DROPDOWN: "Dropdown", RADIO: "Single choice", CHECKBOXES: "Multiple choice", YES_NO: "Yes / No", RATING: "Rating (1-5)", FILE_UPLOAD: "File upload",
};
