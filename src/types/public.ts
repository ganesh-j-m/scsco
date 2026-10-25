import type { PageMeta } from "./index";

export interface Notice { id: string; title: string; body: string; attachmentUrl: string | null; publishedAt: string | null }
export interface EventItem { id: string; title: string; description: string | null; venue: string | null; imageUrl: string | null; date: string }
export interface GalleryItem { id: string; title: string; imageUrl: string; category: string | null }
export interface Facility { id: string; name: string; description: string | null; imageUrl: string | null }
export interface Achievement { id: string; title: string; description: string | null; imageUrl: string | null; date: string | null }
export interface Placement { id: string; company: string; jobTitle: string; eligibility: string | null; package: string | null; location: string | null; driveDate: string | null; deadline: string | null; description: string | null }
export interface Department { id: string; name: string; code: string; description: string | null; hod: { designation: string | null; photoUrl: string | null; user: { name: string } } | null; _count: { courses: number; faculty: number } }
export interface Course { id: string; name: string; code: string; durationYears: number; description: string | null; department: { id: string; name: string } }
export interface FacultyMember { id: string; designation: string | null; qualification: string | null; photoUrl: string | null; user: { name: string }; department: { name: string } }
export interface Stats { students: number; faculty: number; departments: number; courses: number }
export interface List<T> { data: T[]; meta?: PageMeta }
