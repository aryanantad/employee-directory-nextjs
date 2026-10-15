
import { NextResponse } from "next/server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const otp =
      typeof body.otp === "string" ? body.otp.trim() : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(otp)
    ) {
      return NextResponse.json(
        { message: "Invalid email or sign-in code." },
        { status: 400 }
      );
    }

    const secret = process.env.OTP_HMAC_SECRET;

    if (!secret) {
      console.error("OTP_HMAC_SECRET is missing.");
      return NextResponse.json(
        { message: "Authentication is not configured." },
        { status: 500 }
      );
    }

    const challenge = await prisma.otpChallenge.findFirst({
      where: { email, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge || challenge.expiresAt <= new Date()) {
      return NextResponse.json(
        { message: "The code is invalid or expired. Request a new code." },
        { status: 400 }
      );
    }

    if (challenge.attempts >= 5) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });

      return NextResponse.json(
        { message: "Too many incorrect attempts. Request a new code." },
        { status: 429 }
      );
    }

    const expectedHash = createHmac("sha256", secret)
      .update(`${email}:${otp}`)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(challenge.codeHash, "hex");

    const isValid =
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer);

    if (!isValid) {
      const attempts = challenge.attempts + 1;

      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          ...(attempts >= 5 ? { consumedAt: new Date() } : {}),
        },
      });

      return NextResponse.json(
        {
          message:
            attempts >= 5
              ? "Too many incorrect attempts. Request a new code."
              : "The code is invalid or expired.",
        },
        { status: attempts >= 5 ? 429 : 400 }
      );
    }

    // Consume the OTP only if another request hasn't already consumed it.
    const consumed = await prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: 5 } },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) {
      return NextResponse.json(
        { message: "This code has already been used. Request a new code." },
        { status: 400 }
      );
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.authSession.create({
      data: { tokenHash, email, expiresAt },
    });

    const response = NextResponse.json({
      message: "Sign-in successful.",
    });

    response.cookies.set("auth_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (error) {
    console.error("OTP verification failed:", error);
    return NextResponse.json(
      { message: "Could not verify the code. Please try again." },
      { status: 500 }
    );
  }
}
