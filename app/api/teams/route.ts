import { forwardEmployeeServiceRequest } from "@/lib/employee-service-proxy";

export async function GET(request: Request) {
  return forwardEmployeeServiceRequest(
    request,
    "GET",
    "teams",
  );
}

export async function POST(request: Request) {
  return forwardEmployeeServiceRequest(
    request,
    "POST",
    "teams",
  );
}