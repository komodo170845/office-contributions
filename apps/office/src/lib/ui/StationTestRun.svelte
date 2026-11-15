<script lang="ts">
  import type { Station } from '@oddboro/ledger';
  import { assignmentProblem, nextStation } from '@oddboro/ledger/station-route';
  import type { StaffProfile } from '../staff/roster.ts';

  let {
    stations,
    staff,
    lead,
    sample = $bindable(''),
    onclose
  }: {
    stations: Station[];
    staff: StaffProfile[];
    lead: string;
    sample: string;
    onclose: () => void;
  } = $props();
  let at = $state<number>();
  let trace = $state<{ station: string; choice: string; result: string }[]>([]);
  let finished = $state(false);
  const active = $derived(at === undefined ? undefined : stations[at]);
  const field = 'w-full rounded-lg bg-night/50 px-2.5 py-1.5 text-sm text-ink';
  const action = 'rounded-lg bg-sea px-3 py-1.5 text-xs font-medium text-night disabled:opacity-40';
  const name = (i: number) => stations[i].name.trim() || `Station ${i + 1}`;

  function visit(i: number) {
    at = i;
    const problem = assignmentProblem(stations[i], staff, lead);
    if (problem) stopForAssignment(problem, 'Current assignment');
  }

  function start(e: SubmitEvent) {
    e.preventDefault();
    if (!sample.trim()) return;
    trace = [];
    finished = false;
    visit(0);
  }

  function stopForAssignment(problem: string, choice: string) {
    if (at === undefined) return;
    trace.push({ station: name(at), choice, result: `Stopped. ${problem}` });
    finished = true;
  }

  function choose(choice: 'Accepted' | 'Revision needed' | 'Odd unavailable') {
    if (at === undefined || finished) return;
    const station = stations[at];
    if (choice === 'Odd unavailable') {
      const problem = assignmentProblem(
        station,
        staff.filter((s) => s.id !== station.odd),
        lead
      );
      if (problem) stopForAssignment(problem, choice);
      return;
    }
    const step = nextStation(
      stations,
      at,
      { outcome: choice === 'Accepted' ? 'done' : 'failed' },
      choice === 'Accepted' ? null : choice
    );
    const result =
      'next' in step
        ? `Goes to ${name(step.next)}.`
        : step.outcome === 'done'
          ? 'Workflow complete.'
          : 'Stopped for review.';
    trace.push({ station: name(at), choice, result });
    if ('next' in step) visit(step.next);
    else finished = true;
  }
</script>

<section aria-label="Test run" class="mt-2 grid gap-3 rounded-xl bg-raise p-3">
  <div class="flex items-center justify-between gap-2">
    <h4 class="text-sm font-medium">Test run</h4>
    <button type="button" class="text-xs text-sea" onclick={onclose}>Back to editor</button>
  </div>
  <p class="text-xs text-muted">
    You choose each outcome to simulate the route. In a live job, the assigned Odd checks the work,
    and the office may pause for approvals or usage limits.
  </p>
  {#if at === undefined}
    <form class="grid gap-2" onsubmit={start}>
      <label class="text-xs"
        >Sample job<input class={field} required maxlength="140" bind:value={sample} /></label
      >
      <button class="{action} justify-self-start" disabled={!sample.trim()}>Start test run</button>
    </form>
  {:else}
    <p class="break-words text-sm">{sample}</p>
    {#if trace.length}
      <ol
        aria-label="Station trace"
        class="grid gap-1.5 border-s border-hairline ps-3"
        aria-live="polite"
      >
        {#each trace as entry, i (i)}<li class="text-xs">
            <strong>{entry.station}</strong> · {entry.choice}<span class="block text-muted"
              >{entry.result}</span
            >
          </li>{/each}
      </ol>
    {/if}
    {#if active && !finished}
      <div class="rounded-lg bg-night/40 p-2">
        <strong class="text-sm">{name(at)}</strong><span class="ms-2 text-xs text-muted"
          >{staff.find((odd) => odd.id === active?.odd)?.name}</span
        >
        <p class="mt-1 text-xs text-muted">
          Done when: {active.doneWhen.trim() || 'No condition entered.'}
        </p>
      </div>
      <div class="flex flex-wrap gap-3 text-xs">
        <button type="button" class={action} onclick={() => choose('Accepted')}>Accept</button>
        <button type="button" class="text-sea" onclick={() => choose('Revision needed')}
          >Request revision</button
        >
        <button type="button" class="text-muted" onclick={() => choose('Odd unavailable')}
          >Odd unavailable</button
        >
      </div>
    {/if}
    <button
      type="button"
      class="justify-self-start text-xs text-sea"
      onclick={() => {
        at = undefined;
        trace = [];
        finished = false;
      }}>Start again</button
    >
  {/if}
</section>
