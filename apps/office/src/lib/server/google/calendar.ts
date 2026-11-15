// The calendar for one connected Google account. Each reply keeps Google's
// time zones, all-day dates and page tokens so an Odd can read the next page.
import { z } from 'zod';
import {
  accountServer,
  DATA_NOTE,
  GoogleError,
  google,
  id,
  run,
  send,
  untrusted,
  type Token
} from './http.ts';

const API = 'https://www.googleapis.com/calendar/v3';
const read = { readOnlyHint: true };
const calendar = z
  .string()
  .min(1)
  .refine((v) => v !== '.' && v !== '..', 'Use a Google calendar ID.');
const when = z.string().datetime({ offset: true }).describe('A date and time with its UTC offset.');
const period = { time_min: when, time_max: when };
const page = {
  page_token: z.string().optional().describe('nextPageToken from the previous page.')
};
const events = (calendarId: string) => `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
const eventFields =
  'id,etag,status,htmlLink,summary,description,location,start,end,recurringEventId,originalStartTime,attendeesOmitted,organizer,attendees(email,self,responseStatus)';

function checkPeriod(start: string, end: string) {
  if (Date.parse(end) <= Date.parse(start)) throw new Error('The end must be after the start.');
}

const eventTime = z.union([z.string().date(), when]);
const eventTimes = {
  start: eventTime.describe('Start date for an all-day event, or date and time with offset.'),
  end: eventTime.describe('Exclusive end, in the same format as the start.')
};
const version = z.string().regex(/^"[^"\r\n]+"$/, 'Use the exact etag from get_event.');
const changing = { calendar_id: calendar, event_id: id, etag: version };
const write = { readOnlyHint: false };

function dates(start: string, end: string) {
  const allDay = start.length === 10;
  if (allDay !== (end.length === 10)) throw new Error('Use two dates or two dates with times.');
  checkPeriod(start, end);
  return allDay
    ? { start: { date: start }, end: { date: end } }
    : { start: { dateTime: start }, end: { dateTime: end } };
}

export function calendarServer(token: Token, account?: string) {
  const server = accountServer('google-calendar', account, 'the Google Calendar account');
  const result = (data: unknown) => untrusted('calendar', JSON.stringify(data));

  server.registerTool(
    'list_calendars',
    {
      description: `List this account's calendars, their IDs, time zones and access levels. Follow nextPageToken for more. ${DATA_NOTE}`,
      inputSchema: page,
      annotations: read
    },
    run(async ({ page_token }) => {
      const params = new URLSearchParams({
        fields: 'nextPageToken,items(id,summary,summaryOverride,primary,timeZone,accessRole)',
        maxResults: '100'
      });
      if (page_token) params.set('pageToken', page_token);
      return result(await google(token, `${API}/users/me/calendarList?${params}`));
    })
  );

  server.registerTool(
    'list_events',
    {
      description: `Read events overlapping a time range on one calendar. Recurring events appear as individual occurrences. Follow nextPageToken for more. ${DATA_NOTE}`,
      inputSchema: { calendar_id: calendar, ...period, ...page },
      annotations: read
    },
    run(async ({ calendar_id, time_min, time_max, page_token }) => {
      checkPeriod(time_min, time_max);
      const params = new URLSearchParams({
        timeMin: time_min,
        timeMax: time_max,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
        fields:
          'nextPageToken,timeZone,items(id,etag,status,summary,start,end,originalStartTime,recurringEventId,htmlLink)'
      });
      if (page_token) params.set('pageToken', page_token);
      return result(await google(token, `${events(calendar_id)}?${params}`));
    })
  );

  server.registerTool(
    'get_event',
    {
      description: `Read one event and the invitation responses on its calendar. Use the event ID from list_events. ${DATA_NOTE}`,
      inputSchema: { calendar_id: calendar, event_id: id },
      annotations: read
    },
    run(async ({ calendar_id, event_id }) =>
      result(
        await google(
          token,
          `${events(calendar_id)}/${event_id}?${new URLSearchParams({ fields: eventFields })}`
        )
      )
    )
  );

  server.registerTool(
    'check_availability',
    {
      description: `Read busy intervals for up to 50 calendar IDs. If Google returns an error for a calendar, its availability is unknown. ${DATA_NOTE}`,
      inputSchema: { calendar_ids: z.array(calendar).min(1).max(50), ...period },
      annotations: read
    },
    run(async ({ calendar_ids, time_min, time_max }) => {
      checkPeriod(time_min, time_max);
      return result(
        await google(
          token,
          `${API}/freeBusy`,
          send('POST', {
            timeMin: time_min,
            timeMax: time_max,
            items: calendar_ids.map((id) => ({ id }))
          })
        )
      );
    })
  );
  // PATCH only the requested fields. Google's etag keeps a delayed approval
  // from replacing a change someone made after the Odd read the event.
  const change = async (url: string, etag: string, fields: object) => {
    const request = send('PATCH', fields);
    const headers = new Headers(request.headers);
    headers.set('If-Match', etag);
    try {
      return result(
        await google(token, url + '?sendUpdates=all&fields=id,etag,htmlLink', {
          ...request,
          headers
        })
      );
    } catch (e) {
      if (e instanceof GoogleError && e.status === 412)
        throw new Error(
          'This event changed. Read it again and review the new details before retrying.'
        );
      throw e;
    }
  };

  server.registerTool(
    'create_event',
    {
      description:
        'Create one event on the selected calendar. Google sends invitations to the listed guests. Pick an event ID once for this booking and keep it on every retry. If Google says it already exists, use get_event to check the saved booking.',
      inputSchema: {
        calendar_id: calendar,
        event_id: z
          .string()
          .regex(
            /^[0-9a-v]{5,1024}$/,
            'Use a UUID without hyphens or another Google event ID in base32hex.'
          ),
        title: z.string().trim().min(1),
        ...eventTimes,
        guests: z.array(z.string().email()).optional()
      },
      annotations: write
    },
    run(async ({ calendar_id, event_id, title, start, end, guests }) =>
      result(
        await google(
          token,
          events(calendar_id) + '?sendUpdates=all&fields=id,etag,htmlLink',
          send('POST', {
            id: event_id,
            summary: title,
            ...dates(start, end),
            ...(guests?.length ? { attendees: guests.map((email) => ({ email })) } : {})
          })
        )
      )
    )
  );

  server.registerTool(
    'reschedule_event',
    {
      description:
        'Change the start and end of one event. Use the event ID and etag you reviewed. For a recurring meeting, use the occurrence ID from list_events. Google notifies the guests.',
      inputSchema: { ...changing, ...eventTimes },
      annotations: write
    },
    run(async ({ calendar_id, event_id, etag, start, end }) => {
      const url = events(calendar_id) + '/' + event_id;
      const times = dates(start, end);
      const current = await google<{ recurrence?: string[] }>(token, url + '?fields=recurrence');
      if (current.recurrence?.length)
        throw new Error('Choose one occurrence from list_events to reschedule it.');
      return change(url, etag, times);
    })
  );

  server.registerTool(
    'answer_invitation',
    {
      description:
        'Send the connected account’s response to a Google Calendar invitation. Use the event ID and etag you reviewed.',
      inputSchema: { ...changing, response: z.enum(['accepted', 'declined', 'tentative']) },
      annotations: write
    },
    run(async ({ calendar_id, event_id, etag, response }) => {
      const url = events(calendar_id) + '/' + event_id;
      const current = await google<{ attendees?: { self?: boolean; email?: string }[] }>(
        token,
        url + '?fields=attendees(self,email)'
      );
      const self = current.attendees?.find(
        (person) =>
          person.self && person.email && person.email.toLowerCase() === account?.toLowerCase()
      );
      if (!self)
        throw new Error('Open the invitation on the calendar of the account that was invited.');
      return change(url, etag, {
        attendeesOmitted: true,
        attendees: [{ email: self.email, responseStatus: response }]
      });
    })
  );
  return server;
}
