import { LocalTime } from "@/components/broadsheet/local-time";
import { CalloutBanner } from "@/components/broadsheet/panels";
import { FactRow, PageHeader, SectionLabel } from "@/components/broadsheet/section";
import {
  CalendarSyncToggle,
  ConnectCalendarButton,
  DisconnectCalendarButton,
} from "@/components/settings/calendar-controls";
import { getCalendarAccount, isCalendarSyncConfigured } from "@/lib/calendar-accounts";
import { ROLES } from "@/lib/roles";
import { requireCurrentUser } from "@/lib/users";

export const metadata = { title: "Calendar" };

/** What the OAuth callback appends to this page's URL on its way back. */
const OUTCOME: Record<string, { tone: "success" | "warning" | "danger"; title: string; body: string }> = {
  connected: {
    tone: "success",
    title: "Calendar connected",
    body: "Interviews you take part in now appear on it, and your busy times are taken into account when someone schedules you.",
  },
  cancelled: {
    tone: "warning",
    title: "Nothing was connected",
    body: "You closed Google's consent screen before finishing. Nothing changed.",
  },
  expired: {
    tone: "warning",
    title: "That took too long",
    body: "The connection attempt timed out for safety. Start it again.",
  },
  unavailable: {
    tone: "warning",
    title: "Calendar syncing isn't set up",
    body: "This deployment has no calendar integration configured. Ask an administrator.",
  },
  failed: {
    tone: "danger",
    title: "Google couldn't be reached",
    body: "Nothing was connected. Try again in a moment.",
  },
};

export default async function CalendarSettingsPage({
  searchParams,
}: {
  // A Promise in Next.js 16 — see the note in the root CLAUDE.md.
  searchParams: Promise<{ calendar?: string }>;
}) {
  const [{ user }, { calendar }] = await Promise.all([requireCurrentUser(ROLES), searchParams]);
  const configured = isCalendarSyncConfigured();
  const account = configured ? await getCalendarAccount(user.id) : null;
  const outcome = calendar ? OUTCOME[calendar] : undefined;

  return (
    <div className="flex max-w-[880px] flex-col">
      <PageHeader
        title="Calendar"
        description="Keep InterviewHub and your own calendar in step (PRD FR-5.3)"
      />

      {outcome && (
        <CalloutBanner tone={outcome.tone} title={outcome.title} className="mt-6">
          {outcome.body}
        </CalloutBanner>
      )}

      <section aria-labelledby="google" className="mt-[30px]">
        <SectionLabel id="google">Google Calendar</SectionLabel>

        {!configured ? (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Calendar syncing isn&apos;t set up for this deployment, so there&apos;s nothing to connect here yet.
            Interview invitations still arrive by email with a calendar attachment.
          </p>
        ) : account ? (
          <>
            <FactRow label="Connected account">
              <span className="font-mono text-[13px]">{account.accountEmail}</span>
            </FactRow>
            <FactRow label="Connected on">
              <LocalTime value={account.connectedAt} format="date" />
            </FactRow>
            <FactRow label="Syncing">
              <span className="font-mono text-[13px]">{account.syncEnabled ? "on" : "paused"}</span>
            </FactRow>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <CalendarSyncToggle enabled={account.syncEnabled} />
              <DisconnectCalendarButton accountEmail={account.accountEmail} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Connecting your Google Calendar does two things. Interviews you take part in are written straight to it,
              and moved or removed when they change — no invitation to accept. And when someone schedules you, the
              times you&apos;re already busy are marked in the scheduling grid.
            </p>
            <div className="mt-5">
              <ConnectCalendarButton label="Connect Google Calendar" />
            </div>
          </>
        )}
      </section>

      {configured && (
        <section aria-labelledby="privacy" className="mt-10">
          <SectionLabel id="privacy">What InterviewHub can see</SectionLabel>
          <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Only when you are busy — never the title, the people, or anything else about an event. The permission
            InterviewHub asks for is Google&apos;s free/busy view, plus the ability to manage the interview events it
            creates itself. It never reads the rest of your calendar, and disconnecting stops both immediately.
          </p>
        </section>
      )}
    </div>
  );
}
