import type { ExamResult, Paper, QState, TopicStat } from "./types";

export function buildResult(
  paper: Paper,
  states: QState[],
  elapsedSec: number,
  tabSwitches: number
): ExamResult {
  const byTopic: Record<string, TopicStat> = {};
  let correct = 0, wrong = 0, skipped = 0, attempted = 0, timeAtt = 0;

  paper.questions.forEach((q, i) => {
    const t = (byTopic[q.topic] ||= { n: 0, att: 0, ok: 0, ms: 0 });
    t.n += 1;
    const s = states[i];
    if (s.given === null) { skipped += 1; return; }
    attempted += 1;
    t.att += 1;
    timeAtt += s.timeMs;
    t.ms += s.timeMs;
    if (s.given === q.ans) { correct += 1; t.ok += 1; } else { wrong += 1; }
  });

  const net = correct - paper.negativeMarking * wrong;
  return {
    paper, states, elapsedSec,
    correct, wrong, skipped, attempted, net,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    avgSec: attempted ? timeAtt / attempted / 1000 : 0,
    byTopic,
    tabSwitches,
  };
}
