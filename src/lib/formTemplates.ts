// Starter forms. Questions use the same shape the builder saves.
export interface TemplateField { key: string; type: string; label: string; required?: boolean; options?: { label: string }[]; validation?: Record<string, number> }
export interface FormTemplate { id: string; name: string; description: string; fields: TemplateField[] }

const rate = (key: string, label: string): TemplateField => ({ key, type: "RATING", label, required: true });

export const FORM_TEMPLATES: FormTemplate[] = [
  { id: "blank", name: "Blank form", description: "Start from scratch", fields: [] },
  {
    id: "feedback", name: "Course feedback", description: "Ratings and comments for a course or teacher",
    fields: [
      rate("q1", "How clear were the lectures?"), rate("q2", "How useful were the study materials?"), rate("q3", "How approachable was the teacher?"),
      { key: "q4", type: "YES_NO", label: "Would you recommend this course to others?", required: true },
      { key: "q5", type: "LONG_TEXT", label: "What can we improve?", validation: { maxLength: 1000 } },
    ],
  },
  {
    id: "event", name: "Event registration", description: "Collect participants for an event",
    fields: [
      { key: "q1", type: "SHORT_TEXT", label: "Full name", required: true }, { key: "q2", type: "PHONE", label: "Mobile number", required: true },
      { key: "q3", type: "DROPDOWN", label: "Year", required: true, options: [{ label: "First" }, { label: "Second" }, { label: "Third" }] },
      { key: "q4", type: "CHECKBOXES", label: "Which activities will you join?", options: [{ label: "Quiz" }, { label: "Sports" }, { label: "Cultural" }] },
    ],
  },
  {
    id: "survey", name: "Quick survey", description: "A short poll with one choice and a comment",
    fields: [
      { key: "q1", type: "RADIO", label: "Your choice", required: true, options: [{ label: "Option A" }, { label: "Option B" }, { label: "Option C" }] },
      { key: "q2", type: "LONG_TEXT", label: "Comments", validation: { maxLength: 500 } },
    ],
  },
  {
    id: "leave", name: "Request form", description: "Ask for permission or a document",
    fields: [
      { key: "q1", type: "SHORT_TEXT", label: "Subject", required: true }, { key: "q2", type: "DATE", label: "Date needed", required: true },
      { key: "q3", type: "LONG_TEXT", label: "Reason", required: true, validation: { maxLength: 1000 } }, { key: "q4", type: "EMAIL", label: "Contact email" },
    ],
  },
];
