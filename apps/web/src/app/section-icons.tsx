import {
  BookOpenText,
  CalendarRange,
  ChartLine,
  FileText,
  GraduationCap,
  Inbox,
  Layers,
  Lightbulb,
  type LucideIcon,
  MessagesSquare,
  Network,
  PencilLine,
  Search,
  Settings,
  Sun,
} from 'lucide-react';

export const SECTION_ICONS: Record<string, LucideIcon> = {
  today: Sun,
  notes: FileText,
  search: Search,
  library: BookOpenText,
  concepts: Lightbulb,
  graph: Network,
  modules: GraduationCap,
  review: Layers,
  practice: PencilLine,
  progress: ChartLine,
  plan: CalendarRange,
  chat: MessagesSquare,
  inbox: Inbox,
  settings: Settings,
};

export function sectionIcon(id: string): LucideIcon {
  return SECTION_ICONS[id] ?? FileText;
}
