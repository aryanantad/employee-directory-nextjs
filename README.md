# Employee Directory & Management System

A full-stack employee management application built with **Next.js, TypeScript, Node.js, Express, Prisma, and PostgreSQL**. The application provides secure authentication, employee management, team management, attendance tracking, leave management, and role-based access control.

## Features

### 1. Authentication & Security
- OTP-based login and authentication.
- Session management using secure authentication cookies.
- Access token refresh and refresh token rotation.
- Protected application routes.
- Authentication and authorization handled through dedicated services.
- Role-based access control across frontend and backend.
- Protected HR account that cannot be demoted through role assignment.

### 2. Role-Based Access Control

The application supports three roles:

| Feature | Employee | Manager | HR |
|---|---|---|---|
| View own profile | Yes | Yes | Yes |
| View employee directory | No | No | Yes |
| Create employees | No | No | Yes |
| Assign employee roles | No | No | Yes |
| Manage reporting managers | No | No | Yes |
| Manage teams | No | No | Yes |
| View own attendance | Yes | Yes | Yes |
| Check in / Check out | Yes | Yes | No |
| View team attendance | No | Yes | Yes |
| Apply for leave | Yes | Yes | No |
| View own leave requests | Yes | Yes | Yes |
| Review team leave requests | No | Yes | No |
| View organization leave records | No | No | Yes |

Permissions are enforced on the backend as well as reflected in the frontend interface.

### 3. Employee Management
- Add and manage employee records.
- View employee details in an employee directory.
- Update employee information.
- Activate and deactivate employee accounts.
- Assign employee roles.
- Assign reporting managers.
- Manage employee application permissions.
- Display employee information using reusable employee cards.

### 4. Team Management
- Create and manage teams.
- View available teams.
- Assign employees to teams.
- Remove employees from teams.
- Manage team membership.
- View team information through a dedicated Teams page.
- Provide team-related API routes.

### 5. Attendance Management
- Employee check-in and check-out.
- Track daily attendance.
- View attendance information.
- Display attendance summaries.
- Managers can view attendance for their teams.
- HR can view organization-wide attendance records.
- HR cannot perform employee check-in or check-out actions.

### 6. Leave Management
- Employees and managers can submit leave requests.
- View leave requests and their statuses.
- Managers can review requests from their direct reportees.
- Managers can approve or reject eligible requests.
- HR can view organization-wide leave records.
- HR has read-only access to employee leave workflows.
- Leave types and related configurations can be managed by HR.

### 7. Profile Picture Management
- Upload employee profile pictures.
- Preview profile pictures.
- Crop and adjust images before uploading.
- Zoom and position images using the profile picture interface.
- Display profile pictures across the application.

### 8. Frontend
- Next.js App Router architecture.
- React and TypeScript components.
- Reusable employee, profile, attendance, and leave components.
- Role-aware navigation and dashboards.
- Protected pages and API routes.
- Responsive application layout.

## Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js 16, React 19 |
| Language | TypeScript |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | OTP authentication, access tokens, refresh tokens |
| API Communication | REST APIs |
| Package Management | npm |
| Version Control | Git and GitHub |

## Architecture

The application uses a microservices-based backend architecture.

```text
Employee Management System
│
├── Next.js Frontend
│   ├── Authentication
│   ├── Dashboard
│   ├── Employee Directory
│   ├── Teams
│   ├── Attendance
│   ├── Leave Management
│   └── Profile Pictures
│
├── Auth Service
│   ├── OTP Authentication
│   ├── Token Management
│   ├── User Roles
│   └── Role Assignment
│
└── Employee Service
    ├── Employee Management
    ├── Team Management
    ├── Attendance Management
    └── Leave Management
```

### Service Ports

| Application | Port |
|---|---:|
| Next.js Frontend | 3000 |
| Authentication Service | 4001 |
| Employee Service | 4002 |

## Project Structure

```text
nextjs-learning/
│
├── app/
│   ├── api/
│   │   ├── auth/
│   │   ├── employees/
│   │   ├── profile-picture/
│   │   └── teams/
│   │
│   ├── components/
│   │   ├── AttendanceLeavePanel.tsx
│   │   └── ProfilePicture.tsx
│   │
│   ├── login/
│   ├── teams/
│   ├── EmployeeCard.tsx
│   ├── EmployeeForm.tsx
│   ├── EmployeeList.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── employee-microservices/
│   ├── auth-service/
│   │   ├── prisma/
│   │   └── src/
│   │       ├── routes/
│   │       └── server.ts
│   │
│   └── employee-service/
│       ├── prisma/
│       └── src/
│           └── server.ts
│
├── lib/
│   ├── auth.ts
│   └── employee-service-proxy.ts
│
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js
- npm
- PostgreSQL database
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/aryanantad/employee-directory-nextjs.git
```

```bash
cd employee-directory-nextjs
```

### 2. Install Dependencies

Install the root application dependencies:

```bash
npm install
```

Install dependencies for the authentication service:

```bash
cd employee-microservices/auth-service
npm install
```

Install dependencies for the employee service:

```bash
cd ../employee-service
npm install
```

### 3. Configure Environment Variables

Create the required `.env` files for the root application and both microservices.

Configure the database connection strings, authentication secrets, service URLs, and other required environment variables according to each service's configuration.

**Important:** Never commit `.env` files, database passwords, access tokens, or other credentials to GitHub.

### 4. Configure the Database

Configure PostgreSQL and ensure the Prisma schemas and migrations are available for the corresponding services.

Apply the required migrations using the Prisma commands configured for each service.

### 5. Start the Services

Start the authentication service, employee service, and Next.js application using the development scripts defined in their respective `package.json` files.

The expected service ports are:

- Authentication Service: `4001`
- Employee Service: `4002`
- Next.js Application: `3000`

Open the frontend at:

```text
http://localhost:3000
```

## Database & Migrations

The project uses Prisma ORM with PostgreSQL.

Database migrations cover:

- Refresh token management.
- Profile picture support.
- User role assignments.
- Team management.
- Attendance and leave management.
- Session last-activity tracking.

Migration files are maintained in the relevant Prisma migration directories.

## Authorization and Testing

Role-based access has been tested for Employee, Manager, and HR accounts.

The backend role-boundary tests passed **18 out of 18 checks** across the three roles.

Tests covered:
- Employee access restrictions.
- Manager team-level permissions.
- HR organization-wide read access.
- Attendance and leave action restrictions.
- Role assignment protection.
- HR account protection.

## GitHub Repository

Repository: [employee-directory-nextjs](https://github.com/aryanantad/employee-directory-nextjs)

Current development branch:

```text
feature/team-management
```

The latest development changes include employee management, team management, attendance, leave management, profile pictures, and authentication improvements.

## Future Improvements

Potential future development areas:

- Automated testing and continuous integration.
- Improved application monitoring and error handling.
- Production deployment and environment configuration.
- Additional employee management features.
- Further security and performance improvements.

---

**Project Status:** Active Development

**Primary Goal:** Build a secure, role-based employee management platform with separate authentication and employee microservices.
