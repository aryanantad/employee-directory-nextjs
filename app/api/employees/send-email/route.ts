
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: "SMTP Test from Next.js",
      text: "Congratulations! Your Gmail SMTP setup is working.",
    });

    return NextResponse.json({
      success: true,
      message: "Test email sent successfully!",
    });
  } catch (error) {
    console.error("Email sending failed:", error);

    return NextResponse.json(
      { success: false, message: "Failed to send test email." },
      { status: 500 }
    );
  }
}
