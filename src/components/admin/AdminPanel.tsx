import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import Equipos from './Equipos';
import Grupos from './Grupos';

const TABS = [
  { id: 'equipos', label: 'Equipos' },
  { id: 'grupos', label: 'Grupos' },
  { id: 'elim', label: 'Eliminatoria' },
  { id: 'semis', label: 'Semis · Final' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function AdminPanel() {
  // undefined = comprobando la sesión guardada; null = sin sesión (login)
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return (
      <div className="pc-wrap">
        <Cabecera />
        <div className="pc-note">
          Faltan las variables de entorno de Supabase (PUBLIC_SUPABASE_URL /
          PUBLIC_SUPABASE_PUBLISHABLE_KEY).
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="pc-wrap">
        <Cabecera />
        <p className="pc-loading">Comprobando sesión…</p>
      </div>
    );
  }

  if (!session) return <Login />;
  return <Panel session={session} />;
}

function Cabecera({ email, onSalir }: { email?: string; onSalir?: () => void }) {
  return (
    <>
      <div className="pc-head">
        <div>
          <div className="pc-title">Panel de control</div>
          <div className="pc-sub">Beerpong IV · resultados en directo</div>
        </div>
        {email && (
          <button className="pc-logout" onClick={onSalir}>
            {email} · Cerrar sesión
          </button>
        )}
      </div>
      <div className="pc-lockpill">🔒 ACCESO PRIVADO · SOLO ADMIN</div>
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(
        error.message.includes('Invalid login credentials')
          ? 'Email o contraseña incorrectos.'
          : `No se pudo iniciar sesión: ${error.message}`,
      );
      setEnviando(false);
    }
    // Si entra bien, onAuthStateChange cambia la vista; no hay nada más que hacer aquí.
  }

  return (
    <div className="pc-wrap">
      <Cabecera />
      <form className="pc-card pc-login" onSubmit={entrar}>
        <div className="pc-field">
          <label htmlFor="pc-email">Email</label>
          <input
            id="pc-email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="pc-field">
          <label htmlFor="pc-pass">Contraseña</label>
          <input
            id="pc-pass"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="pc-loginerr" role="alert">
            {error}
          </p>
        )}
        <button className="pc-btn primary" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function Panel({ session }: { session: Session }) {
  const [tab, setTab] = useState<TabId>('equipos');

  return (
    <div className="pc-wrap">
      <Cabecera
        email={session.user.email ?? 'admin'}
        onSalir={() => void supabase!.auth.signOut()}
      />
      <div className="pc-tabs" role="tablist" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`pc-tab${t.id === tab ? ' on' : ''}`}
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'equipos' && <Equipos />}
      {tab === 'grupos' && <Grupos />}
      {tab === 'elim' && <Placeholder nombre="Eliminatoria" />}
      {tab === 'semis' && <Placeholder nombre="Semis · Final" />}
    </div>
  );
}

function Placeholder({ nombre }: { nombre: string }) {
  return <div className="pc-note">«{nombre}» se monta en el siguiente paso.</div>;
}
