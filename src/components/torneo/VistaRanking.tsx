import type { RankingRow } from './tipos';
import type { Sesion } from './sesion';

// El Profeta: ranking en vivo de la porra. Lee la vista pública `ranking_porra`
// (solo mote + puntos; nunca picks ni hashes) con la publishable key. El orden
// se hace en el cliente: puntos desc → creado_en asc (empate: gana quien se
// apuntó antes). El fetch y el poll viven en TorneoApp; aquí solo se pinta.

// Cuántos puestos se muestran arriba. Si tu fila cae fuera, se fija al final
// con su puesto real para que siempre te veas sin scrollear.
const TOP = 10;

export default function VistaRanking({
  ranking,
  sesion,
}: {
  ranking: RankingRow[];
  sesion: Sesion | null;
}) {
  const visibles = ranking.slice(0, TOP);
  const miIndice = sesion ? ranking.findIndex((r) => r.id === sesion.id) : -1;
  const yoFuera = miIndice >= TOP; // estás en el ranking pero fuera del top

  return (
    <section className="view">
      <div className="sh">
        EL <i>PROFETA</i>
      </div>
      <div className="led blink" style={{ marginBottom: 14 }}>
        <span className="dot" />
        EN VIVO · SE ACTUALIZA SOLO
      </div>
      <div className="prize">
        <div className="pl">PREMIO DEL PROFETA</div>
        <div className="pt">
          El nº1 se lleva <b>un bonocopas</b>.
        </div>
      </div>

      {ranking.length === 0 ? (
        <div className="empty">
          <div className="ico">🔮</div>
          <div className="et">
            Aún no ha apostado nadie.
            <br />
            Sé el primero en mojarte.
          </div>
        </div>
      ) : (
        <div>
          {visibles.map((r, i) => (
            <Fila key={r.id} fila={r} puesto={i + 1} esYo={r.id === sesion?.id} />
          ))}
          {yoFuera && (
            <>
              <div className="more" style={{ margin: '4px 0 7px' }}>
                ···
              </div>
              <Fila fila={ranking[miIndice]} puesto={miIndice + 1} esYo />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Fila({ fila, puesto, esYo }: { fila: RankingRow; puesto: number; esYo: boolean }) {
  const podio = puesto <= 3 ? ` r${puesto}` : '';
  return (
    <div className={`rk${podio}${esYo ? ' me' : ''}`}>
      <span className="rp">{puesto}</span>
      <span className="rn">
        {fila.mote}
        {esYo && <span className="tag">TÚ</span>}
      </span>
      <span className="rs">
        {fila.puntos}
        <em> pts</em>
      </span>
    </div>
  );
}
