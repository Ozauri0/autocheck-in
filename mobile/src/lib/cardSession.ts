/** Tiempo fijo que la tarjeta de resultado queda visible, contado desde que aparece. */
export const CARD_MS = 2000;

export interface CardSessionOptions<T> {
  /** Se llama al mostrar la tarjeta y cada vez que cambia su contenido. */
  onShow: (value: T) => void;
  /** Se llama una sola vez al cerrarla (toque o temporizador). */
  onHide: () => void;
  /** Duración desde que aparece. Por defecto CARD_MS. */
  ms?: number;
}

export interface CardSession<T> {
  /** Muestra la tarjeta y arranca el cierre automático. */
  open(id: string, value: T): void;
  /**
   * Cambia el contenido si la tarjeta con ese id sigue abierta.
   * No reinicia el temporizador. Devuelve false si ya se cerró.
   */
  update(id: string, value: T): boolean;
  /** Cierra ya. No hace nada si la tarjeta ya estaba cerrada. */
  close(): void;
  /** Cancela el temporizador y olvida la tarjeta. No llama a onHide (desmontaje). */
  dispose(): void;
}

/**
 * Controla una tarjeta que se cierra sola a los `ms` exactos desde que aparece,
 * responda o no el servidor. Las respuestas tardías solo actualizan si sigue abierta.
 */
export function createCardSession<T>({
  onShow,
  onHide,
  ms = CARD_MS,
}: CardSessionOptions<T>): CardSession<T> {
  let openId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  function close() {
    clearTimer();
    if (openId === undefined) return;
    openId = undefined;
    onHide();
  }

  return {
    open(id, value) {
      clearTimer();
      openId = id;
      onShow(value);
      timer = setTimeout(close, ms);
    },
    update(id, value) {
      if (openId !== id) return false;
      onShow(value);
      return true;
    },
    close,
    dispose() {
      clearTimer();
      openId = undefined;
    },
  };
}
