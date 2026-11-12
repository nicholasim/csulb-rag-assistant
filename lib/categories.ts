/**
 * The service categories shown in the sidebar, and the example questions on the
 * welcome screen. Safe to use in the browser (no server code here).
 */
import {
  BookOpenIcon,
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
};

export const CATEGORIES: Category[] = [
  { name: "Enrollment / Registration", icon: CalendarDaysIcon, starter: "When is the add/drop deadline for spring?" },
  { name: "Financial Aid", icon: WalletIcon, starter: "How do I check my financial aid status?" },
  { name: "Tuition / Payments", icon: CreditCardIcon, starter: "How do I pay my tuition fees online?" },
  { name: "Academic Advising", icon: GraduationCapIcon, starter: "Where do I find the advising center for my major?" },
  { name: "Parking & Transportation", icon: BusIcon, starter: "How much is a semester student parking permit?" },
  { name: "Campus Maps", icon: MapIcon, starter: "Is there a campus map so I can get around?" },
  { name: "Career Development Center", icon: BriefcaseIcon, starter: "Where can I get help with my resume?" },
  { name: "Library", icon: LibraryIcon, starter: "Where can I study late at night?" },
  { name: "Technology Help Desk", icon: LaptopIcon, starter: "What are the Technology Help Desk hours?" },
  { name: "Student Health Services", icon: HeartPulseIcon, starter: "What services does Student Health Services offer?" },
  { name: "Food Services", icon: UtensilsIcon, starter: "Where can I eat on campus?" },
  { name: "Basic Student Support", icon: HandHeartIcon, starter: "Where can I get help if I can't afford food?" },
  { name: "International Students", icon: GlobeIcon, starter: "Who are the international student advisors?" },
  { name: "Bookstore", icon: BookOpenIcon, starter: "How does Day 1 Textbook Access work?" },
  { name: "Orientation", icon: UsersIcon, starter: "How do I sign up for SOAR orientation?" },
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
