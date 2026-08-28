import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RecruiterDashboard() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>No candidates yet.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scheduled interviews</CardTitle>
          <CardDescription>Nothing on the calendar.</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Analytics</CardTitle>
          <CardDescription>Completion rate and trends will show here.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
