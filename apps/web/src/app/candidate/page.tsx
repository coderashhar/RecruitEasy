import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CandidateDashboard() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Upcoming interviews</CardTitle>
          <CardDescription>Nothing scheduled yet.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Resume &amp; ATS score</CardTitle>
          <CardDescription>Upload a resume to get feedback.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Interview history</CardTitle>
          <CardDescription>No past interviews.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
