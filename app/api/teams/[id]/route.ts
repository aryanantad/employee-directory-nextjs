import { forwardEmployeeServiceRequest } from "@/lib/employee-service-proxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;

  return forwardEmployeeServiceRequest(
    request,
    "GET",
    `teams/${encodeURIComponent(id)}`,
  );
}

export async function PUT(
  request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;

  return forwardEmployeeServiceRequest(
    request,
    "PUT",
    `teams/${encodeURIComponent(id)}`,
  );
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;

  return forwardEmployeeServiceRequest(
    request,
    "DELETE",
    `teams/${encodeURIComponent(id)}`,
  );
}