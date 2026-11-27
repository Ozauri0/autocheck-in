import { CARD_MS, createCardSession } from '../src/lib/cardSession';

function setup() {
  const shown: string[] = [];
  let hides = 0;
  const card = createCardSession<string>({
    onShow: (value) => shown.push(value),
    onHide: () => {
      hides++;
    },
  });
  return { card, shown, hides: () => hides };
}

describe('createCardSession', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dura 2000 ms', () => {
    expect(CARD_MS).toBe(2000);
  });

  it('se cierra a los 2000 ms exactos aunque el servidor nunca responda', () => {
    const { card, hides } = setup();
    card.open('a', 'Registrando…');

    jest.advanceTimersByTime(1999);
    expect(hides()).toBe(0);

    jest.advanceTimersByTime(1);
    expect(hides()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('una respuesta dentro de la ventana actualiza el estado sin reiniciar el temporizador', () => {
    const { card, shown, hides } = setup();
    card.open('a', 'Registrando…');

    jest.advanceTimersByTime(1500);
    expect(card.update('a', '✓ Registrado')).toBe(true);
    expect(shown).toEqual(['Registrando…', '✓ Registrado']);

    jest.advanceTimersByTime(499);
    expect(hides()).toBe(0);

    jest.advanceTimersByTime(1);
    expect(hides()).toBe(1);
  });

  it('una respuesta que llega tras el cierre no vuelve a mostrar la tarjeta', () => {
    const { card, shown, hides } = setup();
    card.open('a', 'Registrando…');
    jest.advanceTimersByTime(CARD_MS);

    expect(card.update('a', '✓ Registrado')).toBe(false);
    expect(shown).toEqual(['Registrando…']);
    expect(hides()).toBe(1);
  });

  it('una respuesta de otra tarjeta no altera la visible', () => {
    const { card, shown } = setup();
    card.open('a', 'Registrando…');

    expect(card.update('b', 'otra')).toBe(false);
    expect(shown).toEqual(['Registrando…']);
  });

  it('tocar cierra antes y el temporizador no vuelve a cerrar', () => {
    const { card, hides } = setup();
    card.open('a', 'Registrando…');
    jest.advanceTimersByTime(300);

    card.close();
    card.close();
    expect(hides()).toBe(1);
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(CARD_MS);
    expect(hides()).toBe(1);
  });

  it('tras cerrarse acepta una tarjeta nueva de inmediato', () => {
    const { card, hides } = setup();
    card.open('a', 'Registrando…');
    card.close();

    card.open('b', 'Registrando…');
    jest.advanceTimersByTime(CARD_MS);
    expect(hides()).toBe(2);
  });

  it('dispose cancela el temporizador sin avisar al cerrar', () => {
    const { card, shown, hides } = setup();
    card.open('a', 'Registrando…');

    card.dispose();
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(CARD_MS);
    expect(hides()).toBe(0);
    expect(card.update('a', '✓ Registrado')).toBe(false);
    expect(shown).toEqual(['Registrando…']);
  });
});
