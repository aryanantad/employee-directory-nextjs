import { forwardEmployeeServiceRequest } from "@/lib/employee-service-proxy";

type RouteContext = {
  params: Promise<{
    id: string;
    employeeId: string;
  }>;
};

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  const { id, employeeId } = await context.params;

  return forwardEmployeeServiceRequest(
    request,
    "DELETE",
    `teams/${encodeURIComponent(id)}/members/${encodeURIComponent(employeeId)}`,
  );
}