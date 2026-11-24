/**
 * The service categories shown in the sidebar, and the example questions on the
 * welcome screen. Safe to use in the browser (no server code here).
 */
import {
  BedDoubleIcon,
  BookOpenIcon,
  Building2Icon,
  DumbbellIcon,
  HeartHandshakeIcon,
  PenLineIcon,
  ScrollTextIcon,
  ShieldIcon,
  BriefcaseIcon,
  BusIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandHeartIcon,
  HeartPulseIcon,
  LaptopIcon,
  LibraryIcon,
  type LucideIcon,
  MapIcon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
} from "lucide-react";

export type Category = {
  name: string; // matches the "category" in the knowledge/ file headers
  icon: LucideIcon;
  starter: string; // a good first question; clicking the category puts it in the input box
  group: CategoryGroup; // the sidebar section it's listed under (Entry 29)
};

// Sidebar sections, in display order (Entry 29). Every category belongs to exactly one.
export const CATEGORY_GROUPS = ["Academics", "Money", "Campus Life", "Support & Wellness", "Career & Services"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const CATEGORIES: Category[] = [
  { name: "Enrollment / Registration", icon: CalendarDaysIcon, starter: "When is the add/drop deadline for spring?" , group: "Academics" },
  { name: "Financial Aid", icon: WalletIcon, starter: "How do I check my financial aid status?" , group: "Money" },
  { name: "Tuition / Payments", icon: CreditCardIcon, starter: "How do I pay my tuition fees online?" , group: "Money" },
  { name: "Academic Advising", icon: GraduationCapIcon, starter: "Where do I find the advising center for my major?" , group: "Academics" },
  { name: "Majors & Academics", icon: ScrollTextIcon, starter: "How do I change my major?" , group: "Academics" },
  { name: "Tutoring & Writing", icon: PenLineIcon, starter: "How do I book a Writing Center appointment?" , group: "Academics" },
  { name: "Parking & Transportation", icon: BusIcon, starter: "How much is a semester student parking permit?" , group: "Campus Life" },
  { name: "Campus Maps", icon: MapIcon, starter: "What building does the code ECS stand for?" , group: "Campus Life" },
  { name: "Campus Places", icon: Building2Icon, starter: "What is the Horn Center?" , group: "Campus Life" },
  { name: "Housing", icon: BedDoubleIcon, starter: "How do I apply for on-campus housing?" , group: "Campus Life" },
  { name: "Career Development Center", icon: BriefcaseIcon, starter: "Where can I get help with my resume?" , group: "Career & Services" },
  { name: "Library", icon: LibraryIcon, starter: "Where can I study late at night?" , group: "Academics" },
  { name: "Technology Help Desk", icon: LaptopIcon, starter: "What are the Technology Help Desk hours?" , group: "Career & Services" },
  { name: "Student Health Services", icon: HeartPulseIcon, starter: "What services does Student Health Services offer?" , group: "Support & Wellness" },
  { name: "Wellness & Access", icon: HeartHandshakeIcon, starter: "Is counseling free for students?" , group: "Support & Wellness" },
  { name: "Safety", icon: ShieldIcon, starter: "Can I get a safety escort at night?" , group: "Support & Wellness" },
  { name: "Recreation", icon: DumbbellIcon, starter: "Is the rec center free for students?" , group: "Campus Life" },
  { name: "Food Services", icon: UtensilsIcon, starter: "Where can I eat on campus?" , group: "Campus Life" },
  { name: "Basic Student Support", icon: HandHeartIcon, starter: "Where can I get help if I can't afford food?" , group: "Support & Wellness" },
  { name: "International Students", icon: GlobeIcon, starter: "Who are the international student advisors?" , group: "Support & Wellness" },
  { name: "Bookstore", icon: BookOpenIcon, starter: "How does Day 1 Textbook Access work?" , group: "Career & Services" },
  { name: "Orientation", icon: UsersIcon, starter: "How do I sign up for SOAR orientation?" , group: "Academics" },
];

// Shown on the welcome screen. Only questions we have tested end to end.
export const EXAMPLE_QUESTIONS = [
  "How much is a semester student parking permit?",
  "Who are the international student advisors?",
  "How does Day 1 Textbook Access work?",
  "How do I sign up for SOAR orientation?",
  "When is the add/drop deadline for spring?",
  "What are the Technology Help Desk hours?",
];
