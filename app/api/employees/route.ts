
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Fetch all employees from the database
export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: {
        id: "asc",
      },
    });

    return NextResponse.json(employees);
  } catch (error) {
    console.error("Error fetching employees:", error);

    return NextResponse.json(
      { error: "Failed to fetch employees" },
      { status: 500 }
    );
  }
}

// POST: Add a new employee to the database
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = body.name?.trim();
    const role = body.role?.trim();

    if (!name || !role) {
      return NextResponse.json(
        { error: "Name and role are required" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.create({
      data: {
        name,
        role,
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error("Error adding employee:", error);

    return NextResponse.json(
      { error: "Failed to add employee" },
      { status: 500 }
    );
  }
}

// PUT: Update an existing employee
export async function PUT(request: Request) {
  try {
    const body = await request.json();

    const id = Number(body.id);
    const name = body.name?.trim();
    const role = body.role?.trim();

    if (!Number.isInteger(id) || id <= 0 || !name || !role) {
      return NextResponse.json(
        { error: "Valid ID, name, and role are required" },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: { name, role },
    });

    return NextResponse.json(employee);
  } catch (error) {
    console.error("Error updating employee:", error);

    return NextResponse.json(
      { error: "Failed to update employee" },
      { status: 500 }
    );
  }
}

// DELETE: Remove an employee
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "A valid employee ID is required" },
        { status: 400 }
      );
    }

    await prisma.employee.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting employee:", error);

    return NextResponse.json(
      { error: "Failed to delete employee" },
      { status: 500 }
    );
  }
}
