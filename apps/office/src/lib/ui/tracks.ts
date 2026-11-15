// The office's music: one entry per file in static/audio/, as `<id>.m4a`, with
// the name the owner sees. New Altitude holds every track, so LICENSE-ASSETS
// keeps the folder out of the Apache license. The files carry a title tag and
// nothing else.

export type Track = { id: string; title: string };

export const TRACKS: Track[] = [
  { id: 'good-morning-neighbor', title: 'Good Morning, Neighbor' },
  { id: 'early-bus', title: 'Early Bus' },
  { id: 'porch-light', title: 'Porch Light' },
  { id: 'first-coffee', title: 'First Coffee' },
  { id: 'second-coffee', title: 'Second Coffee' },
  { id: 'long-way-round', title: 'The Long Way Round' },
  { id: 'around-the-block', title: 'Around the Block' },
  { id: 'last-bus-home', title: 'Last Bus Home' },
  { id: 'running-late', title: 'Running Late' },
  { id: 'window-seat', title: 'Window Seat' },
  { id: 'open-window', title: 'Open Window' },
  { id: 'nothing-urgent', title: 'Nothing Urgent' },
  { id: 'kettle-on', title: 'Kettle On' },
  { id: 'two-oclock', title: "Two O'Clock" },
  { id: 'long-lunch', title: 'Long Lunch' },
  { id: 'garden-path', title: 'Garden Path' },
  { id: 'watering-the-ferns', title: 'Watering the Ferns' },
  { id: 'swivel-chair', title: 'Swivel Chair' },
  { id: 'puzzle-box', title: 'Puzzle Box' },
  { id: 'loose-ends', title: 'Loose Ends' },
  { id: 'quiet-floor', title: 'Quiet Floor' },
  { id: 'blinds-up', title: 'Blinds Up' },
  { id: 'sticky-notes', title: 'Sticky Notes' },
  { id: 'filing-day', title: 'Filing Day' },
  { id: 'lunch-walk', title: 'Lunch Walk' }
];

/** A new owner's first visit opens on this one. */
export const OPENING = 'good-morning-neighbor';

// These loops play only when the owner chooses one. Shuffle never picks them.
export const SOUNDS: Track[] = [
  { id: 'focus-noise', title: 'Focus noise' },
  { id: 'winter-bells', title: 'Winter bells' }
];

export const soundById = (id: string | null | undefined): Track | undefined =>
  SOUNDS.find((sound) => sound.id === id);

export const trackSrc = (id: string): string => `/${soundById(id) ? 'sounds' : 'audio'}/${id}.m4a`;

/** The player and an Odd's recommendation use the same bundled tracks. */
export const audioById = (id: string) => TRACKS.find((t) => t.id === id) ?? soundById(id);

export function djRequest(loved: string[], passed: string[]): string {
  const choices = [...TRACKS, ...SOUNDS].filter((t) => !passed.includes(t.id));
  const catalog = choices
    .map((t) => `${t.title} (#office-track/${t.id})${loved.includes(t.id) ? ' [favorite]' : ''}`)
    .join('\n');
  return `Pick music for what I'm working on. If you need to know the task or mood, ask me. Choose one of these tracks and tell me why. Include a Markdown link using its exact #office-track/ address so I can choose it in the player.\n\n${catalog}`;
}
