"use client";

import { useState, type FormEvent, type ReactNode } from "react";

function Icon({
  children,
  size = 18,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const MailIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Icon>
);

const CheckIcon = () => (
  <Icon size={16}>
    <path d="m5 12 5 5L20 7" />
  </Icon>
);

const ArrowRightIcon = () => (
  <Icon>
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </Icon>
);

const ArrowLeftIcon = () => (
  <Icon size={16}>
    <path d="M19 12H5m6-6-6 6 6 6" />
  </Icon>
);

const ShieldIcon = () => (
  <Icon size={16}>
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

const SuccessIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Icon>
);

const ErrorIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5m0 3h.01" />
  </Icon>
);

const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5m0-8h.01" />
  </Icon>
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageType, setMessageType] = useState<
    "error" | "success" | "info"
  >("info");

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setMessageType("error");
      setMessage("Please enter your email address.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/request-otp", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessageType("error");
        setMessage(data.message || "Unable to send verification code.");
        return;
      }

      setEmail(normalizedEmail);
      setOtpSent(true);
      setMessageType("success");
      setMessage(
        data.message || "Verification code sent. Check your inbox."
      );
    } catch (error) {
      console.error("OTP request error:", error);
      setMessageType("error");
      setMessage("Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      setMessageType("error");
      setMessage("Enter the complete six-digit verification code.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      // Step 1: Verify OTP and receive authentication cookies.
      const loginResponse = await fetch("/api/auth/verify-otp", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp,
        }),
        cache: "no-store",
      });

      const loginData = await loginResponse.json().catch(() => ({}));

      if (!loginResponse.ok) {
        setMessageType("error");
        setMessage(
          loginData.message || "Invalid or expired code. Please try again."
        );
        return;
      }

      setMessageType("info");
      setMessage("Login successful. Checking your session...");

      // Step 2: Check that the browser's session cookie works.
      const sessionResponse = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      const sessionData = await sessionResponse.json().catch(() => ({}));

      if (!sessionResponse.ok) {
        console.error("Session verification failed:", {
          status: sessionResponse.status,
          response: sessionData,
        });

        setMessageType("error");
        setMessage(
          sessionData.message ||
            "Login succeeded, but your session could not be verified."
        );
        return;
      }

      // Step 3: Only redirect after the session is confirmed.
      setMessageType("success");
      setMessage("Login successful. Opening Employee Directory...");

      window.location.replace("/");
    } catch (error) {
      console.error("Login or session verification error:", error);
      setMessageType("error");
      setMessage(
        "Could not verify your login session. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-brand">
            <span className="login-brand-icon">E</span>
            <span>Employee Directory</span>
          </div>

          <div className="login-brand-content">
            <span className="login-brand-label">
              Your team. One place.
            </span>

            <h1>
              Great teams
              <br />
              start with
              <br />
              <span>connection.</span>
            </h1>

            <p>
              Find your colleagues, stay connected, and keep
              your team information organized in one workspace.
            </p>

            <div className="login-feature-list">
              <div className="login-feature">
                <span className="login-feature-check">
                  <CheckIcon />
                </span>
                <span>Easy team directory access</span>
              </div>

              <div className="login-feature">
                <span className="login-feature-check">
                  <CheckIcon />
                </span>
                <span>Secure email verification</span>
              </div>

              <div className="login-feature">
                <span className="login-feature-check">
                  <CheckIcon />
                </span>
                <span>One organized workspace</span>
              </div>
            </div>
          </div>

          <div className="login-brand-footer">
            A simpler way to stay connected.
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-container">
            <div className="login-mobile-brand">
              <span className="login-brand-icon">E</span>
              <span>Employee Directory</span>
            </div>

            <div className="login-form-heading">
              <span className="login-eyebrow">
                {otpSent ? "Email verification" : "Welcome"}
              </span>

              <h2>
                {otpSent ? "Check your inbox" : "Welcome back"}
              </h2>

              <p>
                {otpSent
                  ? `Enter the six-digit code sent to ${email}.`
                  : "Sign in to access your employee directory."}
              </p>
            </div>

            {!otpSent ? (
              <form className="login-form" onSubmit={sendOtp}>
                <div className="login-field">
                  <label htmlFor="email">Work email address</label>

                  <div className="login-input-wrap">
                    <span className="login-input-icon">
                      <MailIcon />
                    </span>

                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      required
                      disabled={loading}
                    />
                  </div>

                  <span className="login-field-hint">
                    Use the email address associated with your account.
                  </span>
                </div>

                <button
                  className="login-submit"
                  type="submit"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <>
                      <span className="login-spinner" />
                      Sending code...
                    </>
                  ) : (
                    <>
                      Send verification code
                      <ArrowRightIcon />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form className="login-form" onSubmit={verifyOtp}>
                <div className="login-field">
                  <label htmlFor="otp">Six-digit verification code</label>

                  <input
                    className="login-otp-input"
                    id="otp"
                    name="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(event) =>
                      setOtp(
                        event.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    placeholder="000000"
                    required
                    disabled={loading}
                    autoFocus
                  />

                  <span className="login-field-hint">
                    Enter the code from your email.
                  </span>
                </div>

                <button
                  className="login-submit"
                  type="submit"
                  disabled={loading || otp.length !== 6}
                >
                  {loading ? (
                    <>
                      <span className="login-spinner" />
                      {message.includes("Checking")
                        ? "Checking session..."
                        : "Verifying code..."}
                    </>
                  ) : (
                    <>
                      Verify and sign in
                      <ArrowRightIcon />
                    </>
                  )}
                </button>

                <button
                  className="login-text-button"
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setMessage("");
                  }}
                >
                  <ArrowLeftIcon />
                  Use a different email address
                </button>
              </form>
            )}

            {message && (
              <div
                className={`login-message login-message-${messageType}`}
                role="status"
                aria-live="polite"
              >
                <span className="login-message-icon">
                  {messageType === "success" ? (
                    <SuccessIcon />
                  ) : messageType === "error" ? (
                    <ErrorIcon />
                  ) : (
                    <InfoIcon />
                  )}
                </span>

                <p>{message}</p>
              </div>
            )}

            <div className="login-security-note">
              <ShieldIcon />
              <span>
                Your sign-in is protected by email verification.
              </span>
            </div>

            <div className="login-bottom">
              <span>Employee Directory</span>
              <span>Secure access</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
