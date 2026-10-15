
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createHmac, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json(
        { message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const secret = process.env.OTP_HMAC_SECRET;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!secret || !smtpUser || !smtpPass) {
      console.error("OTP or SMTP environment variables are missing.");
      return NextResponse.json(
        { message: "Email service is not configured." },
        { status: 500 }
      );
    }

    // Limit requests to 3 per email in a 15-minute window.
    const windowStart = new Date(Date.now() - 15 * 60 * 1000);
    const recentRequests = await prisma.otpChallenge.count({
      where: {
        email,
        createdAt: { gte: windowStart },
      },
    });

    if (recentRequests >= 3) {
      return NextResponse.json(
        { message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const otp = randomInt(100000, 1000000).toString();
    const codeHash = createHmac("sha256", secret)
      .update(`${email}:${otp}`)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Invalidate older outstanding OTPs for this email.
    await prisma.otpChallenge.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const challenge = await prisma.otpChallenge.create({
      data: { email, codeHash, expiresAt },
    });

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: smtpUser,
        to: email,
        subject: "Your sign-in code",
        text: `Your sign-in code is ${otp}. It expires in 5 minutes. If you did not request it, you can ignore this email.`,
      });
    } catch (error) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw error;
    }

    return NextResponse.json({
      message: "If the address can receive email, a sign-in code has been sent.",
    });
  } catch (error) {
    console.error("OTP request failed:", error);
    return NextResponse.json(
      { message: "Could not request a sign-in code. Please try again later." },
      { status: 500 }
    );
  }
}
