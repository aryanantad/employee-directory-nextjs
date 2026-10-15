
import { prisma } from "./db.js";

async function main() {
  try {
    const otpCount = await prisma.otpChallenge.count();
    const sessionCount = await prisma.authSession.count();

    console.log("Connected to Neon successfully!");
    console.log("OTP challenges:", otpCount);
    console.log("Auth sessions:", sessionCount);
  } catch (error) {
    console.error("Database test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
