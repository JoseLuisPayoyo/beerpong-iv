import { useEffect, useState, type ReactNode } from 'react';

export type Aviso = { tipo: 'ok' | 'err'; texto: string };

/** Toast flotante que se descarta solo (ver useAviso). */
export function Toast({ aviso }: { aviso: Aviso | null }) {
  if (!aviso) return null;
  return (
    <p className={`pc-toast ${aviso.tipo}`} role={aviso.tipo === 'err' ? 'alert' : 'status'}>
      {aviso.texto}
    </p>
  );
}

/** Estado de aviso con auto-descarte a los 5 s. */
export function useAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);
  return [aviso, setAviso] as const;
}

/** Botón que, al pulsarse, se transforma en una confirmación en línea (Sí / Cancelar).
    Para acciones irreversibles. Mientras `busy`, muestra el texto de progreso deshabilitado. */
export function ConfirmButton({
  className,
  children,
  question,
  confirmLabel = 'Sí, seguir',
  disabled,
  busy,
  busyLabel,
  onConfirm,
}: {
  className: string;
  children: ReactNode;
  question: string;
  confirmLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (busy) {
    return (
      <button className={className} disabled>
        {busyLabel ?? children}
      </button>
    );
  }

  if (armed) {
    return (
      <div className="pc-confirm" role="alertdialog" aria-label={question}>
        <p>{question}</p>
        <div className="pc-confirm-row">
          <button
            className="pc-btn primary"
            onClick={() => {
              setArmed(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
          <button className="pc-btn ghost" onClick={() => setArmed(false)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button className={className} disabled={disabled} onClick={() => setArmed(true)}>
      {children}
    </button>
  );
}
