import { useState, type FormEvent } from 'react';
import { supabase } from '../data/supabaseStore';

export function Login() {
  const [mode, setMode] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError(null); setInfo(null); setBusy(true);
    const { data, error } = mode === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } });
    setBusy(false);
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'El email o la contraseña no coinciden.' : error.message);
    } else if (mode === 'crear' && !data.session) {
      setInfo('Te mandamos un email para confirmar la cuenta. Después volvé y entrá con tu contraseña.');
      setMode('entrar');
    }
  }

  return (
    <div className="login">
      <form className="modal" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><i>$</i>Finanzas</div>
        <h1>{mode === 'entrar' ? 'Entrar' : 'Crear cuenta'}</h1>
        <div className="field">
          <label htmlFor="l-email">Email</label>
          <input className="input" id="l-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="l-pass">Contraseña</label>
          <input className="input" id="l-pass" type="password" autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {info && <p className="note" style={{ margin: 0, color: 'var(--ok)' }}>{info}</p>}
        <button className="btn primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Un momento…' : mode === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="btn" style={{ justifyContent: 'center' }} onClick={() => { setMode(mode === 'entrar' ? 'crear' : 'entrar'); setError(null); }}>
          {mode === 'entrar' ? 'Es la primera vez: crear cuenta' : 'Ya tengo cuenta'}
        </button>
      </form>
    </div>
  );
}
