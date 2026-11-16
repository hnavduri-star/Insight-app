/** Shared test data: a CPD-format toolkit and a helper that works through every tool. */
export const question = (q: string, answer = 0) => ({ q, options: ['a', 'b', 'c', 'd'], answer, why: 'w' });

export const toolkit = (title = 'Toolkit', tools = 6, quiz = 3, toolName = (i: number) => `Tool ${i}`) => ({
  title, framework: 'F',
  outcomes: ['Structure a clear answer', 'Respond calmly to pushback', 'Agree a next step'],
  tools: Array.from({ length: tools }, (_, i) => ({
    name: toolName(i), source: 'Getting to Yes', idea: `Idea ${i}`, why: 'Because it works', whenToUse: 'When stakes are high',
    pitfalls: ['Rushing', 'Over-explaining'], steps: ['a', 'b', 'c'], say: ['x', 'y'], caseStudy: { situation: 's', action: 'a', result: 'r' }, tryThis: 't',
    checks: [question(`Understand ${i}`, 0), question(`What would you do? ${i}`, 2)],
    practice: `Your boss asks for an update on project ${i}. Write what you say.`,
  })),
  quiz: Array.from({ length: quiz }, (_, i) => question(`Q${i}`, 1)),
  scenario: 'S',
});

export const toolFeedback = (score = 76) => ({ score, feedback: 'Clear and direct.', tryInstead: 'Lead with the answer.' });

/** Answers both questions on every tool (right by default) and submits each tool's practice. */
export async function completeTools(a: any, lessonId: string, tools = 6, right = true) {
  for (let i = 0; i < tools; i++) {
    await a.post(`/api/bites/${lessonId}/tool/${i}/check`).send({ q: 0, picked: right ? 0 : 1 });
    await a.post(`/api/bites/${lessonId}/tool/${i}/check`).send({ q: 1, picked: right ? 2 : 0 });
    await a.post(`/api/bites/${lessonId}/tool/${i}/practice`).send({ response: 'Short answer: yes, if we move reporting a sprint. Can we agree that today?' });
  }
}
