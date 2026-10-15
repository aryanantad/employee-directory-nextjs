
"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendOtp() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      setMessage(data.message);

      if (response.ok) {
        setOtpSent(true);
      }
    } catch {
      setMessage("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();
      setMessage(data.message);

      if (response.ok) {
        window.location.href = "/";
      }
    } catch {
      setMessage("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1>Employee Directory Login</h1>
      <p>Sign in using a code sent to your email.</p>

      <label htmlFor="email">Email address</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        disabled={otpSent || loading}
        style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 16px" }}
      />

      {!otpSent ? (
        <button onClick={sendOtp} disabled={loading || !email.trim()}>
          {loading ? "Sending..." : "Send OTP"}
        </button>
      ) : (
        <>
          <label htmlFor="otp">Six-digit OTP</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(event) =>
              setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="Enter your code"
            style={{ display: "block", width: "100%", padding: 10, margin: "8px 0 16px" }}
          />

          <button
            onClick={verifyOtp}
            disabled={loading || otp.length !== 6}
          >
            {loading ? "Verifying..." : "Verify OTP"}
          </button>
        </>
      )}

      {message && <p role="status">{message}</p>}
    </main>
  );
}
