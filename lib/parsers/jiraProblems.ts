import type { JiraItem, JiraProblem, JiraProblemItem } from '@/lib/types';
import { issueMarker } from './jira';

/** Uma issue com a data que só a aba de problemas pede. */
export interface JiraAuditIssue extends JiraItem {
  /** AAAA-MM-DD, ou vazio quando o campo de início não foi preenchido. */
  startDate: string;
}

// O tipo sai do mesmo mapeamento que desenha o marcador da linha: uma história
// é o que o painel já mostra como [S], um épico o que mostra como [E]. Assim
// "História" e "Story" valem igual, e a subtarefa nunca é confundida com
// história.
const isStory = (issue: JiraItem) => issueMarker(issue) === '[S]';
export const isEpic = (issue: JiraItem) => issueMarker(issue) === '[E]';

interface Context {
  /** As histórias cujo pai é esta issue. Vazio para quem não é épico. */
  stories: JiraItem[];
}

type Rule = (issue: JiraAuditIssue, context: Context) => boolean;

// Situação vem da categoria, não do nome do status: "Em andamento", "Em
// Andamento" e "Em revisão" são status diferentes com a mesma categoria.
// A ordem das chaves é a ordem em que os problemas aparecem na linha.
const RULES: Record<JiraProblem, Rule> = {
  'story-in-progress-without-start': (issue) =>
    isStory(issue) && issue.statusCategory === 'indeterminate' && !issue.startDate,
  'story-done-without-start': (issue) =>
    isStory(issue) && issue.statusCategory === 'done' && !issue.startDate,
  'story-without-epic': (issue) => isStory(issue) && !issue.parent,
  'epic-without-stories': (issue, { stories }) => isEpic(issue) && stories.length === 0,
  // Sem história nenhuma, a regra acima já diz o que corrigir; repetir aqui
  // seria um segundo aviso para o mesmo defeito.
  'epic-in-progress-without-active-story': (issue, { stories }) =>
    isEpic(issue) &&
    issue.statusCategory === 'indeterminate' &&
    stories.length > 0 &&
    !stories.some((story) => story.statusCategory === 'indeterminate'),
};

const CHECKS = Object.entries(RULES) as [JiraProblem, Rule][];

/**
 * As issues de `scope` com algum defeito, cada uma com a lista dos seus.
 * `children` são as filhas dos épicos do escopo, de qualquer responsável: o
 * épico é seu, as histórias dele podem não ser.
 */
export function findProblems(scope: JiraAuditIssue[], children: JiraItem[]): JiraProblemItem[] {
  const storiesByEpic = new Map<string, JiraItem[]>();
  for (const child of children) {
    if (!child.parent || !isStory(child)) continue;
    const list = storiesByEpic.get(child.parent.key) ?? [];
    list.push(child);
    storiesByEpic.set(child.parent.key, list);
  }

  const found: JiraProblemItem[] = [];
  for (const issue of scope) {
    const context = { stories: storiesByEpic.get(issue.key) ?? [] };
    const problems = CHECKS.filter(([, rule]) => rule(issue, context)).map(([id]) => id);
    if (problems.length > 0) found.push({ ...issue, problems });
  }
  return found;
}

export const PROBLEM_LABEL: Record<JiraProblem, string> = {
  'story-in-progress-without-start': 'em andamento sem data de início',
  'story-done-without-start': 'concluída sem data de início',
  'story-without-epic': 'sem épico',
  'epic-without-stories': 'sem histórias',
  'epic-in-progress-without-active-story': 'em andamento sem história em andamento',
};
