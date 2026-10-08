import type { Topic } from '@skb/core';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '../../../components/Button';
import { IconButton } from '../../../components/IconButton';
import { Input } from '../../../components/Input';
import { StickySection } from '../../../components/Page';
import { notifyError } from '../../../lib/notify';
import { useLearningActions } from '../api';
import { selectClasses } from '../Field';

/** The module's topics as a tree (task 6.04). */

interface TopicNode {
  topic: Topic;
  depth: number;
}

/** Depth-first order with depths, children after their parent. */
export function flattenTopics(topics: readonly Topic[]): TopicNode[] {
  const children = new Map<string | null, Topic[]>();
  for (const topic of topics)
    children.set(topic.parentId, [...(children.get(topic.parentId) ?? []), topic]);
  const result: TopicNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const topic of children.get(parentId) ?? []) {
      result.push({ topic, depth });
      visit(topic.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

export function TopicsSection({
  moduleId,
  topics,
}: {
  moduleId: string;
  topics: readonly Topic[];
}) {
  const actions = useLearningActions();
  const [title, setTitle] = useState('');
  const [parentId, setParentId] = useState('');
  const nodes = flattenTopics(topics);
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    actions.createTopic.mutate(
      { moduleId, title: title.trim(), parentId: parentId || null },
      { onSuccess: () => setTitle(''), onError: notifyError },
    );
  };
  return (
    <StickySection
      title="Topics"
      description="How the module's content is organised; concepts can belong to topics."
    >
      {nodes.length > 0 && (
        <ul aria-label="Topics" className="mb-3 space-y-0.5">
          {nodes.map(({ topic, depth }) => (
            <li
              key={topic.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-surface-hover"
              style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
            >
              <span className="text-sm">{topic.title}</span>
              <IconButton
                label={`Delete topic ${topic.title}`}
                icon={<Trash2 size={14} />}
                size="sm"
                onClick={() => actions.deleteTopic.mutate(topic.id, { onError: notifyError })}
              />
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-center gap-2" onSubmit={add}>
        <Input
          aria-label="New topic"
          placeholder="New topic"
          className="w-64"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <select
          aria-label="Inside"
          className={`${selectClasses} w-56`}
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
        >
          <option value="">At the top level</option>
          {nodes.map(({ topic, depth }) => (
            <option key={topic.id} value={topic.id}>
              {`${'– '.repeat(depth)}${topic.title}`}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          size="sm"
          disabled={!title.trim()}
          loading={actions.createTopic.isPending}
        >
          Add topic
        </Button>
      </form>
    </StickySection>
  );
}
