import { FormEvent, ReactNode, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-indigoBrand">Dealer Settlement Manager</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { authEnabled, user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!authEnabled || user) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use your Supabase Auth account to continue.">
      <form className="space-y-4 mt-4" onSubmit={onSubmit}>
        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full bg-indigoBrand text-white rounded px-3 py-2" type="submit">
          Sign in
        </button>
      </form>
      <p className="text-sm text-slate-500 mt-4">
        Need an account?{' '}
        <Link className="text-indigoBrand" to="/signup">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}

export function SignupPage() {
  const { authEnabled, user, signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!authEnabled || user) return <Navigate to="/" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await signUp(email, password, name);
      setMessage('Signup submitted. Check email confirmation if it is enabled in Supabase.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.');
    }
  };

  return (
    <AuthShell title="Create account" subtitle="The first signed-up user becomes admin through the database trigger.">
      <form className="space-y-4 mt-4" onSubmit={onSubmit}>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <button className="w-full bg-indigoBrand text-white rounded px-3 py-2" type="submit">
          Sign up
        </button>
      </form>
      <p className="text-sm text-slate-500 mt-4">
        Already have an account?{' '}
        <Link className="text-indigoBrand" to="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
