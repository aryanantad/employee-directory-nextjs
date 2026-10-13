# Employee Directory

A full-stack Employee Directory web application built with **Next.js, TypeScript, Prisma ORM, and PostgreSQL**. The application allows users to manage employee records through a simple web interface, with a live deployment on Vercel and a hosted Neon PostgreSQL database.

## Live Demo

- **Live Application:** https://employee-directory-nextjs.vercel.app/
- **GitHub Repository:** https://github.com/aryanantad/employee-directory-nextjs

## Features

- View employee records.
- Add new employees.
- Delete employee records.
- Display the total number of employees.
- REST API for employee data.
- Database access through Prisma ORM.
- PostgreSQL database integration.
- Responsive web interface.
- Production deployment using Vercel.

## Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | React framework and server-side functionality |
| React | User interface |
| TypeScript | Type-safe development |
| Prisma ORM | Database queries and data access |
| PostgreSQL | Relational database |
| Neon | Hosted PostgreSQL database |
| Tailwind CSS | Styling |
| Vercel | Application hosting |
| Git and GitHub | Version control and source code hosting |

## Application Architecture

The application follows this general flow:

```text
User Interface
      |
      v
Next.js Application
      |
      v
Prisma ORM
      |
      v
PostgreSQL Database
```

The deployed application runs on Vercel and connects to Neon PostgreSQL. The local development environment can connect to a separate local PostgreSQL database.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/employees` | Retrieve employee records |
| POST | `/api/employees` | Add a new employee |
| DELETE | `/api/employees` | Delete an employee |

## Database Schema

The application uses an `Employee` model with the following fields:

| Field | Type | Description |
|---|---|---|
| `id` | Integer | Unique employee ID, generated automatically |
| `name` | String | Employee name |
| `role` | String | Employee job role |

## Getting Started

### Prerequisites

Install the following before running the project:

- Node.js
- npm
- PostgreSQL
- Git

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

Create a `.env` file in the project root and add your PostgreSQL connection string:

```env
DATABASE_URL="your_postgresql_connection_string"
```

Use your own local PostgreSQL connection string for local development. The deployed application uses the Neon connection string configured in Vercel.

**Security:** Never commit your `.env` file, database password, or other secrets to GitHub.

### 4. Generate Prisma Client

```bash
npx prisma generate
```

### 5. Apply database migrations

```bash
npx prisma migrate deploy
```

Run this command only against the database whose migrations you intend to apply. Do not use database-reset commands on a database containing data you need to keep.

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

The application is deployed using Vercel.

1. Import the GitHub repository into Vercel.
2. Configure `DATABASE_URL` with the Neon PostgreSQL connection string in the appropriate Vercel environment.
3. Ensure the database migrations have been applied.
4. Deploy the application.
5. Test the employee list and CRUD API endpoints.

## Learning Outcomes

This project provided practical experience with:

- Building a full-stack application using Next.js.
- Creating API endpoints for CRUD operations.
- Connecting a web application to PostgreSQL.
- Using Prisma ORM for database queries.
- Managing environment variables securely.
- Using Git and GitHub for version control.
- Deploying an application with Vercel.
- Connecting a production application to a hosted database.

## Future Improvements

- Edit employee details.
- Add employee search and filtering.
- Implement authentication and authorization.
- Add form validation and improved error handling.
- Add pagination for larger employee lists.

## Author

**Aryan Antad**

GitHub: https://github.com/aryanantad
