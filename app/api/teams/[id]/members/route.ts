import { forwardEmployeeServiceRequest } from "@/lib/employee-service-proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;

  return forwardEmployeeServiceRequest(
    request,
    "POST",
    `teams/${encodeURIComponent(id)}/members`,
  );
}