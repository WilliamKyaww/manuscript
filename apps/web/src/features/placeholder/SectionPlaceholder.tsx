import { sectionIcon } from '../../app/section-icons';
import type { Section } from '../../app/sections';
import { Page } from '../../components/Page';
import { EmptyState } from '../../components/States';

/**
 * Honest placeholder for a section that is not built yet (ui.md §5): it says what the section will do
 * and which phase delivers it, and never shows invented data.
 */
export function SectionPlaceholder({ section }: { section: Section }) {
  const Icon = sectionIcon(section.id);
  return (
    <Page title={section.label} description={section.description}>
      <EmptyState
        icon={<Icon size={22} />}
        title={`${section.label} arrives in Phase ${section.phase}`}
        description={
          <p>
            This part of the application has not been built yet. Progress is tracked in the roadmap
            (<code className="font-mono text-xs">docs/checklist</code>).
          </p>
        }
      />
    </Page>
  );
}
