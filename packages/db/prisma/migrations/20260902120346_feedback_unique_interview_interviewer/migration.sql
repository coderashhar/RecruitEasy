-- CreateIndex
-- One feedback per interviewer per interview: a resubmission updates that
-- interviewer's own row rather than adding a second opinion from one person.
CREATE UNIQUE INDEX "feedback_interviewId_interviewerId_key" ON "feedback"("interviewId", "interviewerId");
