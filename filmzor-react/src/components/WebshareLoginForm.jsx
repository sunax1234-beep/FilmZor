import { useState } from "react";
import { useWebshareAuth } from "../context/WebshareAuthContext";

export default function WebshareLoginForm({ onSuccess, onCancel }) {
  const { login } = useWebshareAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-xl p-4"
    >
      <p className="text-sm text-gray-300">
        Na prehratie sa treba prihlásiť k Webshare účtu (heslo ide priamo cez zabezpečený backend, nikde sa neukladá).
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Prihlasovacie meno alebo e-mail"
          autoComplete="username"
          required
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-fuchsia-500/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Heslo"
          autoComplete="current-password"
          required
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-gray-500 focus:border-fuchsia-500/60"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-xs font-bold tracking-wide bg-gradient-to-r from-violet-500 to-pink-500 hover:brightness-110 disabled:opacity-50 text-white px-5 py-2.5 rounded-full transition"
        >
          {submitting ? "Prihlasujem..." : "Prihlásiť sa"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-gray-400 hover:text-white px-5 py-2.5 rounded-full border border-white/10 hover:border-white/20 transition"
        >
          Zrušiť
        </button>
      </div>
    </form>
  );
}
