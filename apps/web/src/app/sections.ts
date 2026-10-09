/**
 * The application's sections (ui.md §3) as plain data. Shared by the sidebar, the command palette,
 * the router and the end-to-end tests — keep it free of React and icon imports.
 */

export type SectionGroup = 'home' | 'knowledge' | 'learning' | 'assistant' | 'system';

export interface Section {
  id: string;
  label: string;
  path: string;
  group: SectionGroup;
  description: string;
  /** Phase in which the section becomes functional (docs/checklist). */
  phase: number;
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'today',
    label: 'Today',
    path: '/',
    group: 'home',
    description: 'Due reviews, today’s plan, upcoming deadlines and weak areas in one place.',
    phase: 14,
  },
  {
    id: 'notes',
    label: 'Notes',
    path: '/notes',
    group: 'knowledge',
    description:
      'Markdown notes with links, backlinks, maths, code and diagrams — stored as files you own.',
    phase: 3,
  },
  {
    id: 'search',
    label: 'Search',
    path: '/search',
    group: 'knowledge',
    description:
      'Full-text search across your notes, with filters by tag, type, folder and module.',
    phase: 4,
  },
  {
    id: 'library',
    label: 'Library',
    path: '/library',
    group: 'knowledge',
    description:
      'Lecture slides, PDFs and documents, preserved exactly and searchable down to the page.',
    phase: 5,
  },
  {
    id: 'concepts',
    label: 'Concepts',
    path: '/concepts',
    group: 'knowledge',
    description: 'The ideas you are learning, with their sources, relations and mastery.',
    phase: 6,
  },
  {
    id: 'graph',
    label: 'Graph',
    path: '/graph',
    group: 'knowledge',
    description: 'Your knowledge graph: core concepts, gaps and connections across modules.',
    phase: 7,
  },
  {
    id: 'modules',
    label: 'Modules',
    path: '/modules',
    group: 'learning',
    description:
      'Modules, lectures, topics and assessments, with a mark calculator for your target.',
    phase: 6,
  },
  {
    id: 'review',
    label: 'Review',
    path: '/review',
    group: 'learning',
    description:
      'Flashcards scheduled with spaced repetition (FSRS) so you review just before you forget.',
    phase: 8,
  },
  {
    id: 'practice',
    label: 'Practice',
    path: '/practice',
    group: 'learning',
    description: 'Quizzes, mock exams and adaptive practice sessions.',
    phase: 9,
  },
  {
    id: 'progress',
    label: 'Progress',
    path: '/progress',
    group: 'learning',
    description: 'Mastery, retention and coverage — with the reasons behind every number.',
    phase: 9,
  },
  {
    id: 'plan',
    label: 'Plan',
    path: '/plan',
    group: 'learning',
    description:
      'A study plan built from your deadlines, assessment weights, due reviews and mastery.',
    phase: 14,
  },
  {
    id: 'chat',
    label: 'Chat',
    path: '/chat',
    group: 'assistant',
    description:
      'Ask questions answered from your own sources, be tutored, or let the agent do the work.',
    phase: 13,
  },
  {
    id: 'inbox',
    label: 'Inbox',
    path: '/inbox',
    group: 'assistant',
    description:
      'Generated cards and questions, and AI suggestions (concepts, relations, links, notes) waiting for your decision.',
    phase: 11,
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    group: 'system',
    description: 'Vault, appearance and information about this installation.',
    phase: 2,
  },
];

export const GROUP_LABELS: Record<SectionGroup, string | null> = {
  home: null,
  knowledge: 'Knowledge',
  learning: 'Learning',
  assistant: 'Assistant',
  system: null,
};

export function sectionById(id: string): Section {
  const section = SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown section "${id}"`);
  return section;
}
