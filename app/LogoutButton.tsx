
"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogout() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message || "Could not sign out.");
        setLoading(false);
        return;
      }

      window.location.href = "/login";
    } catch {
      setMessage("Could not connect to the server.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleLogout} disabled={loading}>
        {loading ? "Signing out..." : "Logout"}
      </button>

      {message && <p role="status">{message}</p>}
    </div>
  );
}
