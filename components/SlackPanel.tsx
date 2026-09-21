'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/data/EmptyState';
import { PanelError } from '@/components/data/PanelError';
import { Section } from '@/components/ui/Section';
import { SkeletonRows } from '@/components/ui/legacy-skeleton';
import { Tabs } from '@/components/ui/legacy-tabs';
import { formatRelative } from '@/lib/format';
import type { PanelResult, SlackDigest, SlackMessage } from '@/lib/types';

const ABAS = ['mencoes', 'diretas'] as const;
type Aba = (typeof ABAS)[number];
const ABA_PARAM = 'slack';
const ABA_PADRAO: Aba = 'mencoes';

function parseAba(value: string | null): Aba {
  return ABAS.find((aba) => aba === value) ?? ABA_PADRAO;
}

function MessageRow({ message }: { message: SlackMessage }) {
  const content = (
    <>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <strong className="font-medium text-ink">{message.author}</strong>
        <span className="type-caption text-ink-dim">{message.channel}</span>
        <span className="type-caption ml-auto text-ink-dim">{formatRelative(message.date)}</span>
      </span>
      <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-ink-mid">
        {message.text}
      </span>
    </>
  );
  return (
    <li className="border-b border-line-soft px-2 py-3 last:border-b-0 hover:bg-brand-tint">
      {message.url ? (
        <a href={message.url} target="_blank" rel="noreferrer" className="block hover:underline">
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
    </li>
  );
}

interface Props {
  slack: PanelResult<SlackDigest>;
  loading?: boolean;
}

export function SlackPanel({ slack, loading = false }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const aba = parseAba(searchParams.get(ABA_PARAM));
  const digest = slack.data;
  const mentions = digest?.mentions ?? [];
  const directs = digest?.directs ?? [];
  const items = aba === 'diretas' ? directs : mentions;

  const setAba = (next: Aba) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === ABA_PADRAO) params.delete(ABA_PARAM);
    else params.set(ABA_PARAM, next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <Section className="min-h-0" eyebrow="Slack">
      <div className="flex h-full min-h-0 flex-col">
        {digest?.team && <p className="type-caption mb-3 text-ink-dim">{digest.team}</p>}
        <Tabs
          id="slack"
          label="listas do Slack"
          active={aba}
          onChange={(id) => setAba(parseAba(id))}
          tabs={[
            { id: 'mencoes', label: 'Menções', count: mentions.length },
            { id: 'diretas', label: 'Mensagens diretas', count: directs.length },
          ]}
        />
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
          {slack.error && <PanelError>{slack.error}</PanelError>}
          {loading && items.length === 0 && <SkeletonRows count={4} />}
          {!loading && items.length === 0 && !slack.error && (
            <EmptyState
              title={
                aba === 'diretas'
                  ? 'Nenhuma mensagem direta não lida.'
                  : 'Nenhuma menção nos últimos 7 dias.'
              }
            />
          )}
          {items.length > 0 && (
            <ul>
              {items.map((message) => (
                <MessageRow key={message.id} message={message} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
