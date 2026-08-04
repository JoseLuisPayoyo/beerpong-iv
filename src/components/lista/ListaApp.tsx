import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

// Control de entrada (/lista): quien está en la puerta busca al equipo y marca
// que ha entrado. Mismo login de Supabase Auth que /admin (la sesión se
// comparte), pero sin nada del panel: solo la lista y el botón.
//
// Lectura: vista pública equipos_publicos (sin teléfonos). Escritura: update
// de equipos.entrada_at directo desde el navegador — la policy equipos_admin
// da permiso al rol authenticated. La fila solo cambia cuando el servidor
// confirma (se relee la vista tras escribir); si falla, aviso persistente con
// Reintentar, como en el resto de la app.

type Estado = 'cargando' | 'listo' | 'error';

interface EquipoRow {
  id: string;
  nombre_equipo: string;
  grupo_id: number | null;
  participante_1: string | null;
  participante_2: string | null;
  entrada_at: string | null; // null = no ha entrado
}

interface ErrorOp {
  texto: string;
  reintentar: () => void;
}

// Búsqueda sin mayúsculas ni tildes: "jose" encuentra "José".
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export default function ListaApp() {
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
      <div className="ls">
        <Cabecera />
        <div className="ls-vacio">
          <div className="et">Faltan las variables de entorno de Supabase.</div>
        </div>
      </div>
    );
  }
  if (session === undefined) {
    return (
      <div className="ls">
        <Cabecera />
        <div className="ls-vacio">
          <div className="et">Comprobando sesión…</div>
        </div>
      </div>
    );
  }
  if (!session) return <Login />;
  return <Lista />;
}

function Cabecera({ onSalir }: { onSalir?: () => void }) {
  return (
    <div className="ls-hd">
      <span className="marca">
        BEERPONG <b>IV</b>
      </span>
      <span className="lado">
        <span className="que">CONTROL DE ENTRADA</span>
        {onSalir && (
          <button className="salir" onClick={onSalir}>
            cerrar sesión
          </button>
        )}
      </span>
    </div>
  );
}

// Mismo signInWithPassword que /admin; aquí no hay nada del panel.
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
    // Si entra bien, onAuthStateChange cambia la vista solo.
  }

  return (
    <div className="ls">
      <Cabecera />
      <form className="ls-login" onSubmit={entrar}>
        <label htmlFor="ls-email">Email</label>
        <input
          id="ls-email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="ls-pass">Contraseña</label>
        <input
          id="ls-pass"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="ls-loginerr" role="alert">
            {error}
          </p>
        )}
        <button className="ls-btn entrar" type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function Lista() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [equipos, setEquipos] = useState<EquipoRow[]>([]);
  const [letras, setLetras] = useState<Map<number, string>>(new Map());
  const [q, setQ] = useState('');
  const [err, setErr] = useState<ErrorOp | null>(null);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    if (!supabase) {
      setEstado('error');
      return;
    }
    const [g, e] = await Promise.all([
      supabase.from('grupos').select('id,letra'),
      supabase
        .from('equipos_publicos')
        .select('id,nombre_equipo,grupo_id,participante_1,participante_2,entrada_at'),
    ]);
    if (g.error || e.error) {
      setEstado('error');
      return;
    }
    setLetras(new Map((g.data as { id: number; letra: string }[]).map((r) => [r.id, r.letra])));
    setEquipos(e.data as EquipoRow[]);
    setEstado('listo');
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Realtime: si hay dos móviles en la puerta, ambos ven lo mismo. La vista no
  // emite eventos por sí sola: se escucha la tabla equipos (la sesión
  // authenticated recibe sus cambios) y se relee la vista con un pequeño
  // debounce. Suscripción limpiada al desmontar.
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      clearTimeout(t);
      t = setTimeout(() => void cargar(), 250);
    };
    const canal = sb
      .channel('lista-entrada')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipos' }, refetch)
      .subscribe();
    return () => {
      clearTimeout(t);
      void sb.removeChannel(canal);
    };
  }, [cargar]);

  // Respaldo por si equipos no está en la publicación de Realtime: refresco
  // cada 30s SOLO con la pestaña visible (mismo patrón que /torneo).
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const parar = () => {
      if (id) {
        clearInterval(id);
        id = undefined;
      }
    };
    const sincronizar = () => {
      if (document.hidden) {
        parar();
      } else if (!id) {
        void cargar(); // refresca al volver a ser visible
        id = setInterval(() => void cargar(), 30000);
      }
    };
    sincronizar();
    document.addEventListener('visibilitychange', sincronizar);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', sincronizar);
    };
  }, [cargar]);

  // Marca (o deshace) la entrada. La fila NO cambia hasta que el servidor
  // confirma: tras el update se relee la vista pública; si el valor no quedó
  // escrito (red, permisos, RLS que filtró la fila), error con Reintentar.
  const marcar = useCallback(async (id: string, dentro: boolean) => {
    if (!supabase) return;
    setPendientes((prev) => new Set(prev).add(id));
    const valor = dentro ? new Date().toISOString() : null;
    const { error: eUp } = await supabase.from('equipos').update({ entrada_at: valor }).eq('id', id);
    let fila: { entrada_at: string | null } | null = null;
    if (!eUp) {
      const r = await supabase
        .from('equipos_publicos')
        .select('id,entrada_at')
        .eq('id', id)
        .maybeSingle();
      if (!r.error && r.data) fila = r.data as { entrada_at: string | null };
    }
    setPendientes((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    const guardado = fila ? fila.entrada_at : undefined; // undefined = sin confirmación
    const confirmado = dentro ? guardado != null : guardado === null;
    if (!confirmado) {
      setErr({
        texto: dentro
          ? 'No se pudo marcar la entrada. Comprueba la conexión.'
          : 'No se pudo deshacer. Comprueba la conexión.',
        reintentar: () => void marcar(id, dentro),
      });
      return;
    }
    setErr(null);
    setEquipos((prev) => prev.map((e) => (e.id === id ? { ...e, entrada_at: guardado ?? null } : e)));
  }, []);

  const ordenados = useMemo(
    () =>
      equipos
        .slice()
        .sort((a, b) => a.nombre_equipo.localeCompare(b.nombre_equipo, 'es', { sensitivity: 'base' })),
    [equipos],
  );

  const consulta = normalizar(q.trim());
  const visibles = useMemo(() => {
    if (!consulta) return ordenados;
    return ordenados.filter((e) =>
      [e.nombre_equipo, e.participante_1, e.participante_2].some(
        (n) => n && normalizar(n).includes(consulta),
      ),
    );
  }, [ordenados, consulta]);

  const dentro = equipos.filter((e) => e.entrada_at != null).length;

  if (estado === 'error') {
    return (
      <div className="ls">
        <Cabecera onSalir={() => void supabase!.auth.signOut()} />
        <div className="ls-vacio">
          <div className="ico">📡</div>
          <div className="et">
            No hemos podido cargar la lista.
            <br />
            Comprueba tu conexión.
          </div>
          <button className="ls-retry" onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ls">
      <Cabecera onSalir={() => void supabase!.auth.signOut()} />
      <div className="ls-busca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o equipo…"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Buscar participante o equipo"
        />
        {q !== '' && (
          <button className="ls-x" onClick={() => setQ('')} aria-label="Borrar búsqueda">
            ✕
          </button>
        )}
      </div>

      {estado === 'cargando' ? (
        <div className="ls-vacio">
          <div className="et">Cargando…</div>
        </div>
      ) : (
        <>
          <div className="ls-total">
            <span>
              <b>{dentro}</b> / {equipos.length} DENTRO
            </span>
            {consulta && (
              <span className="res">
                {visibles.length} {visibles.length === 1 ? 'RESULTADO' : 'RESULTADOS'}
              </span>
            )}
          </div>
          {visibles.length === 0 ? (
            <div className="ls-vacio">
              <div className="ico">🔍</div>
              <div className="et">No está en la lista</div>
            </div>
          ) : (
            <ul className="ls-lista">
              {visibles.map((e) => {
                const ya = e.entrada_at != null;
                const jugadores = [e.participante_1, e.participante_2]
                  .map((n) => n?.trim())
                  .filter(Boolean)
                  .join(' y ');
                const letra = e.grupo_id != null ? letras.get(e.grupo_id) : null;
                return (
                  <li key={e.id} className={ya ? 'in' : undefined}>
                    <div className="info">
                      <div className="nom">{e.nombre_equipo}</div>
                      <div className="sub">
                        {jugadores}
                        {letra && ` · Grupo ${letra}`}
                      </div>
                      {ya && <div className="hin">✓ DENTRO · {hora(e.entrada_at!)}</div>}
                    </div>
                    {ya ? (
                      <button
                        className="ls-undo"
                        disabled={pendientes.has(e.id)}
                        onClick={() => void marcar(e.id, false)}
                      >
                        deshacer
                      </button>
                    ) : (
                      <button
                        className="ls-btn"
                        disabled={pendientes.has(e.id)}
                        onClick={() => void marcar(e.id, true)}
                      >
                        {pendientes.has(e.id) ? '…' : 'YA DENTRO'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {err && (
        <div className="ls-err" role="alert">
          <span>{err.texto}</span>
          <button onClick={err.reintentar}>Reintentar</button>
        </div>
      )}
    </div>
  );
}
