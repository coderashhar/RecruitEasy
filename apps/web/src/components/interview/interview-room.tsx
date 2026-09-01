"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterviewParticipantRole } from "@interviewhub/db";

export interface InterviewRoomProps {
  interviewId: string;
  token: string;
  role: InterviewParticipantRole;
}

/**
 * Client shell for a joined interview room.
 *
 * The collaborative editor (Monaco + Yjs over the realtime service's
 * socket.io events, keyed off `token`) lands in a follow-up commit. For now
 * this proves the join flow end-to-end: a non-participant never reaches this
 * component at all — interview/[id]/page.tsx 404s them before a token is ever
 * minted — and a participant who does arrives holding a token scoped to this
 * interview, this user, and their real participant role.
 */
export function InterviewRoom({ interviewId, role }: InterviewRoomProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Interview room
          <Badge variant="secondary">{role}</Badge>
        </CardTitle>
        <CardDescription>Room {interviewId} — collaborative editor loading soon.</CardDescription>
      </CardHeader>
    </Card>
  );
}
