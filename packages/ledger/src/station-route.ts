// The station editor and the office use the same routing rules. This module
// needs only the saved route and the result of one station.
import type { Outcome, Station } from './schema.ts';

export function assignmentProblem(station: Station, roster: { id: string }[], lead: string) {
  if (!roster.some((odd) => odd.id === station.odd))
    return `Choose a current Odd for ${station.name}.`;
  if (station.odd === lead)
    return 'The Office Manager leads the hand-offs. Choose a colleague for each station.';
}

export function nextStation(
  stations: Station[],
  at: number,
  result: { outcome?: Outcome; answered?: boolean },
  note: string | null
): { next: number } | { outcome: Outcome; text: string } {
  if (result.answered && result.outcome === 'done') return { next: at };
  const reviseTo = stations[at].reviseTo;
  if (
    !result.answered &&
    result.outcome === 'failed' &&
    reviseTo !== undefined &&
    /^Revision needed\s*$/im.test(note ?? '')
  )
    return { next: reviseTo };
  if (result.outcome !== 'done')
    return {
      outcome: result.outcome ?? 'failed',
      text: note || 'The station did not meet its completion condition.'
    };
  if (at + 1 === stations.length)
    return { outcome: 'done', text: note || 'The last station finished.' };
  return { next: at + 1 };
}
