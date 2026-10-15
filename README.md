# Employee Directory — Next.js

A full-stack Employee Directory application built with **Next.js, TypeScript, Prisma, PostgreSQL, and Node.js microservices**. The project includes employee management, email-based OTP authentication, and an email feature for employee-related workflows.

**Repository:** [employee-directory-nextjs](https://github.com/aryanantad/employee-directory-nextjs)

## Features

- **Employee directory:** View and manage employee records, including names and roles.
- **Employee CRUD API:** Retrieve employee records and perform supported employee operations.
- **Email OTP authentication:** Request a one-time password by email and verify it to authenticate.
- **OTP security:** OTP expiry, hashed OTP storage, request and attempt limits, and session handling.
- **Logout:** API endpoint and UI component for ending a session.
- **Email integration:** Employee-related email functionality using Nodemailer.
- **Database integration:** Prisma ORM for working with the application's database.
- **Microservice architecture:** Separate Auth Service and Employee Service codebases.
- **Next.js App Router:** Application pages and API routes organized using the App Router.

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | Web application and API routes |
| React and TypeScript | User interface and typed application code |
| Node.js | Microservice runtime |
| PostgreSQL | Relational database |
| Prisma ORM 6 | Database access and schema management |
| Nodemailer | Email delivery |
| Git and GitHub | Version control and source code hosting |

## Architecture

The repository contains the main Next.js application and two microservices:

```text
employee-directory-nextjs/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── logout/
│   │   │   ├── request-otp/
│   │   │   └── verify-otp/
│   │   ├── employees/
│   │   └── ...
│   ├── login/
│   ├── LogoutButton.tsx
│   └── page.tsx
├── employee-microservices/
│   ├── auth-service/
│   └── employee-service/
├── lib/
│   └── auth.ts
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── package.json
└── README.md
```

### Services

- **Next.js application:** Provides the web interface and application API routes.
- **Auth Service:** Separate Node.js service for authentication-related functionality.
- **Employee Service:** Separate Node.js service for employee-related functionality.

The services use local development ports **4001** (Auth Service) and **4002** (Employee Service). These local addresses must be replaced with reachable service URLs when deploying services separately.

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- PostgreSQL database
- Git
- A code editor such as Visual Studio Code

### 1. Clone the repository

```bash
git clone https://github.com/aryanantad/employee-directory-nextjs.git
cd employee-directory-nextjs
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file in the project root. Configure the PostgreSQL connection string and the other environment variables required by the application.

Example of the general configuration:

```env
DATABASE_URL="your_postgresql_connection_string"
EMPLOYEE_SERVICE_URL="http://localhost:4002"
```

The example is a template, not a working credential. Configure email/SMTP credentials and any other variables required by the source code. Never commit `.env` files, passwords, OTP secrets, or database credentials to GitHub.

### 4. Configure the database

Review `prisma/schema.prisma` and the existing migration files. Ensure `DATABASE_URL` points to your intended development database before running any database commands.

Generate Prisma Client:

```bash
npx prisma generate
```

Apply migrations only after checking that the database URL and migration plan are correct:

```bash
npx prisma migrate deploy
```

Use a dedicated development database when experimenting. Do not run database migrations against production without reviewing them first.

### 5. Start the Next.js application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Run the microservices

Each service has its own `package.json`. Open a separate terminal for each service, install its dependencies, configure its own required environment variables, and use its development script.

Auth Service:

```bash
cd employee-microservices/auth-service
npm install
npm run dev
```

Employee Service:

```bash
cd employee-microservices/employee-service
npm install
npm run dev
```

The services expect their own configuration and database connectivity where required. Running the Next.js app alone does not automatically start the two microservices.

## Authentication Flow

1. The user requests an OTP through the authentication interface.
2. The application sends the OTP to the configured email address.
3. The user submits the OTP for verification.
4. The authentication flow validates the OTP and its expiry and applies the configured attempt limits.
5. A valid verification establishes a session.
6. The user can log out through the logout functionality.

Email delivery and authentication require valid environment configuration and must be tested in the target environment.

## API Routes

| Route | Purpose |
|---|---|
| `POST /api/auth/request-otp` | Request an email OTP |
| `POST /api/auth/verify-otp` | Verify an OTP |
| `POST /api/auth/logout` | End the current session |
| `/api/employees` | Employee API route |
| `/api/employees/send-email` | Employee-related email functionality |

Check the route handlers for the exact HTTP methods, request bodies, and response formats before integrating other clients.

## Build and Validation

Run the production build for the main application:

```bash
npm run build
```

Build the Auth Service:

```bash
cd employee-microservices/auth-service
npm run build
```

Build the Employee Service:

```bash
cd employee-microservices/employee-service
npm run build
```

These builds have completed successfully in the development environment. Successful compilation does not by itself verify live email delivery, production database connectivity, inter-service communication, or production deployment.

## Deployment Notes

The source code is available on GitHub, but hosting the Next.js application does not automatically host the two microservices.

Before deploying:

- Configure production environment variables in the hosting platform.
- Host each microservice on a reachable service or configure an appropriate supported deployment architecture.
- Replace local service URLs such as `http://localhost:4002` with the correct reachable URL.
- Configure production database connectivity and apply reviewed migrations.
- Configure and test email delivery, authentication sessions, and employee API calls.
- Keep all secrets out of source control.

## Current Status

- Next.js production build: successful.
- Auth Service TypeScript build: successful.
- Employee Service build and Prisma Client generation: successful.
- GitHub commit: `750b488` — `Add OTP authentication and employee microservices`.
- Production hosting and end-to-end production verification: still to be configured and tested.

## Learning Outcomes

This project has provided hands-on practice with:

- Full-stack development using Next.js and TypeScript.
- REST API routes and employee data operations.
- Database schemas and Prisma ORM.
- Email-based OTP authentication and session handling.
- Splitting application functionality into microservices.
- Environment configuration, build validation, and Git/GitHub workflows.

## Author

**Aryan Antad**

[GitHub Repository](https://github.com/aryanantad/employee-directory-nextjs)
