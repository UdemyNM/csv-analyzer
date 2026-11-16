import { useId, useState } from "react";

/** メール＋パスワードだけのログインフォーム（登録・再設定の導線は置かない）。 */
export function LoginForm({ onSignIn }) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSignIn(email, password);
    } catch (e) {
      setError(e?.message || "ログインできませんでした");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card login-form" onSubmit={handleSubmit}>
      <h1 className="login-form__title">ログイン</h1>
      <div className="field">
        <label htmlFor={emailId}>メールアドレス</label>
        <input
          id={emailId}
          type="email"
          className="input"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={passwordId}>パスワード</label>
        <input
          id={passwordId}
          type="password"
          className="input"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={submitting}>
        ログイン
      </button>
    </form>
  );
}
