export interface DeptRef { id: string; name: string; code: string }
export interface Academic { departments: DeptRef[]; courses: { id: string; name: string; code: string; departmentId: string; durationYears: number }[] }
export interface UserRef { name: string; email: string; phone: string | null; loginId: string; status: "ACTIVE" | "INACTIVE" }

export interface StudentRow {
  id: string;
  studentId: string;
  prn: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  year: number;
  semester: number;
  division: string;
  admissionYear: number;
  address: string | null;
  photoUrl: string | null;
  parentId: string | null;
  status: "ACTIVE" | "INACTIVE";
  user: UserRef;
  department: DeptRef;
  course: { id: string; name: string };
  parent: { id: string; user: { name: string } } | null;
}

export interface FacultyRow {
  id: string;
  employeeId: string;
  designation: string | null;
  qualification: string | null;
  photoUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  user: UserRef & { role: string };
  department: DeptRef;
  headOf: { id: string; name: string } | null;
  _count: { subjects: number };
}

export interface ParentRow {
  id: string;
  occupation: string | null;
  address: string | null;
  user: UserRef;
  children: { id: string; studentId: string; user: { name: string } }[];
}

export interface HodDepartment {
  id: string;
  name: string;
  code: string;
  status: string;
  hod: { id: string; designation: string | null; user: { name: string; loginId: string; email: string } } | null;
  _count: { faculty: number };
}

export interface DashboardStats {
  scope: "college" | "department" | "own";
  stats: Record<string, number | null | undefined>;
  charts: { studentsByDepartment: { name: string; value: number }[]; usersByRole: { name: string; value: number }[] } | null;
}

export interface DepartmentRow {
  id: string; name: string; code: string; description: string | null; status: "ACTIVE" | "INACTIVE";
  hod: { id: string; user: { name: string; loginId: string } } | null;
  _count: { courses: number; faculty: number; students: number };
}
export interface CourseRow {
  id: string; name: string; code: string; durationYears: number; description: string | null; status: "ACTIVE" | "INACTIVE"; departmentId: string;
  department: DeptRef; _count: { subjects: number; students: number };
}
export interface SubjectRow {
  id: string; name: string; code: string; courseId: string; semester: number; credits: number; facultyId: string | null;
  course: { id: string; name: string; departmentId: string; department: { name: string; code: string } };
  faculty: { id: string; user: { name: string } } | null;
}
export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export interface TimetableRow {
  id: string; day: Weekday; startTime: string; endTime: string; departmentId: string; courseId: string; year: number; division: string; room: string | null;
  subject: { id: string; name: string; code: string }; faculty: { id: string; user: { name: string } };
  course: { id: string; name: string; code: string } | null;
}

export interface QrOptions {
  subjects: { id: string; name: string; code: string; semester: number; courseId: string; course: { name: string; durationYears: number }; faculty: { user: { name: string } } | null }[];
  classes: { courseId: string; year: number; division: string; students: number }[];
}
export interface QrSessionSummary {
  id: string; year: number; division: string; date: string; startsAt: string; expiresAt: string; closedAt: string | null; active: boolean; present: number;
  subject: { name: string; code: string; course: { name: string } }; faculty: { user: { name: string } };
}
export interface QrSessionDetail {
  session: { id: string; subjectId: string; year: number; division: string; startsAt: string; expiresAt: string; closedAt: string | null; active: boolean; token: string | null;
    subject: { name: string; code: string; course: { name: string } }; faculty: { user: { name: string } } };
  attendance: { id: string; status: "PRESENT" | "ABSENT" | "LATE"; time: string; student: { studentId: string; user: { name: string } } }[];
  present: number; total: number; serverNow: string;
}
export type AttStatus = "PRESENT" | "ABSENT" | "LATE";
export interface AttendanceRecord {
  id: string; date: string; time: string; status: AttStatus; year: number; division: string; source: "QR" | "MANUAL";
  student: { studentId: string; user: { name: string } }; subject: { name: string; code: string };
}
export interface MyAttendance {
  student: { studentId: string; user: { name: string } } | null;
  subjects: { subjectId: string; name: string; code: string; total: number; present: number; late: number; absent: number; percentage: number }[];
  overall: { total: number; attended: number; percentage: number };
  recent: { id: string; date: string; time: string; status: AttStatus; subject: { name: string; code: string } }[];
}

// ───────── Phase 6 + 7 ─────────
export type Approval = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
export interface AdmissionRow { id: string; reference: string; applicantName: string; email: string; phone: string; courseName: string | null; previousMarks: number | null; address: string | null; status: Approval; remarks: string | null; createdAt: string }
export interface FeeRow { id: string; title: string; amount: number; paid: number; balance: number; dueDate: string; status: "PENDING" | "PARTIAL" | "PAID" | "OVERDUE"; receiptNo: string | null; paidAt: string | null; student?: { studentId: string; user: { name: string } } }
export interface CertificateRow { id: string; type: string; reason: string | null; status: Approval; remarks: string | null; issuedAt: string | null; createdAt: string; student?: { studentId: string; user: { name: string } } }
export interface ExamRow { id: string; name: string; courseId: string; subjectId: string; semester: number; date: string; startTime: string; endTime: string; room: string | null; instructions: string | null; course: { id: string; name: string }; subject: { id: string; name: string; code: string } }
export interface ResultSheet { exam: { id: string; name: string; date: string; semester: number; course: string; subject: string }; maxMarks: number; students: { id: string; studentId: string; division: string; name: string; marks: number | null }[] }
export interface MyResults {
  data: { id: string; marks: number; maxMarks: number; grade: string | null; passed: boolean; semester: number; academicYear: string; exam: { name: string; date: string }; subject: { name: string; code: string } }[];
  summary: { semester: number; academicYear: string; marks: number; max: number; failed: number; percentage: number }[];
}
export interface BookRow { id: string; title: string; author: string; category: string; isbn: string; totalCopies: number; available: number }
export interface IssueRow { id: string; issuedAt: string; dueDate: string; returnedAt: string | null; fine: number; overdue: boolean; book: { title: string; author?: string }; student?: { studentId: string; user: { name: string } } }
export interface PlacementRow { id: string; company: string; jobTitle: string; eligibility: string | null; package: string | null; location: string | null; driveDate: string | null; deadline: string | null; description: string | null; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }
export interface GrievanceRow { id: string; category: string; subject: string; description: string; status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED"; response: string | null; createdAt: string; user?: { name: string; loginId: string; role: string } }
export interface NotificationRow { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

// ───────── Phase 8 + 9: forms ─────────
export type FormFieldType = "SHORT_TEXT" | "LONG_TEXT" | "NUMBER" | "EMAIL" | "PHONE" | "DATE" | "DROPDOWN" | "RADIO" | "CHECKBOXES" | "YES_NO" | "RATING" | "FILE_UPLOAD";
export type FormStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
export interface FormValidation { min?: number; max?: number; minLength?: number; maxLength?: number }
export interface FormLogic { fieldId: string; operator: "equals" | "notEquals"; value: string }
export interface FormFieldDef {
  id: string; sectionId: string | null; type: FormFieldType; label: string; description: string | null; placeholder: string | null; helpText: string | null;
  defaultValue: string | null; required: boolean; validationConfig: FormValidation | null; conditionalLogic: FormLogic | null; options: { label: string; value: string }[];
}
export interface FormListRow { id: string; title: string; status: FormStatus; startAt: string | null; endAt: string | null; createdAt: string; updatedAt: string; createdBy: { name: string }; _count: { submissions: number; fields: number } }
export interface FormAssignmentRow { targetType: string; targetId: string | null }
export interface FormDetail {
  form: { id: string; title: string; description: string | null; instructions: string | null; status: FormStatus; startAt: string | null; endAt: string | null; submissionLimit: number | null; allowMultipleSubmissions: boolean; allowEditAfterSubmission: boolean; createdBy: string; submissions: number };
  sections: { id: string; title: string }[];
  fields: FormFieldDef[];
  assignments: FormAssignmentRow[];
}
export interface FormSubmissionRow { id: string; attempt: number; submittedAt: string; updatedAt: string; user: { name: string; loginId: string; role: string } }
export interface PortalFormRow { id: string; title: string; description: string | null; startAt: string | null; endAt: string | null; state: "open" | "upcoming" | "ended"; submissions: number; lastSubmittedAt: string | null; allowMultipleSubmissions: boolean; allowEditAfterSubmission: boolean }
export interface PortalForm {
  form: { id: string; title: string; description: string | null; instructions: string | null; startAt: string | null; endAt: string | null; allowMultipleSubmissions: boolean; allowEditAfterSubmission: boolean };
  state: "open" | "upcoming" | "ended"; sections: { id: string; title: string }[]; fields: FormFieldDef[]; submitted: number; answers: Record<string, unknown> | null; canSubmit: boolean;
}

// ───────── Assignments & study material ─────────
export interface CourseWorkRow {
  id: string; kind: "ASSIGNMENT" | "MATERIAL"; title: string; description: string | null; subjectId: string; year: number; division: string | null;
  dueDate: string | null; maxMarks: number | null; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; fileName: string | null; fileSize: number | null; hasFile: boolean; createdAt: string;
  subject: { id: string; name: string; code: string; course: { name: string } }; _count: { submissions: number };
}
export interface CourseWorkOptions { subjects: { id: string; name: string; code: string; course: { name: string; durationYears: number } }[] }
export interface CourseWorkRoster {
  item: { id: string; title: string; dueDate: string | null; maxMarks: number | null }; submitted: number; total: number;
  rows: { student: { id: string; studentId: string; division: string; name: string }; submission: { id: string; note: string | null; fileName: string; fileSize: number; marks: number | null; feedback: string | null; submittedAt: string; late: boolean } | null }[];
}
export interface PortalCourseWork {
  id: string; kind: "ASSIGNMENT" | "MATERIAL"; title: string; description: string | null; dueDate: string | null; maxMarks: number | null; fileName: string | null; fileSize: number | null; hasFile: boolean; createdAt: string;
  subject: { name: string; code: string };
  submission: { id: string; fileName: string; note: string | null; marks: number | null; feedback: string | null; submittedAt: string; late: boolean } | null;
}
