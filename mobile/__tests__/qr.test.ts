import { attendeeKey, parseQr } from '../src/lib/qr';

describe('parseQr', () => {
  it('separa nombre, rut y email', () => {
    expect(parseQr('Daniela contreras|13816473|cferrer2021@alu.uct.cl')).toEqual({
      name: 'Daniela contreras',
      rut: '13816473',
      email: 'cferrer2021@alu.uct.cl',
      extra: [],
    });
  });

  it('recorta espacios y guarda los extras', () => {
    expect(parseQr(' Ana | 1-9 | a@uct.cl | Ingeniería |  | 3 ')).toEqual({
      name: 'Ana',
      rut: '1-9',
      email: 'a@uct.cl',
      extra: ['Ingeniería', '', '3'],
    });
  });

  it('sin "|" usa el texto completo como nombre', () => {
    expect(parseQr(' Texto libre ')).toEqual({
      name: ' Texto libre ',
      rut: '',
      email: '',
      extra: [],
    });
  });

  it('tolera campos faltantes', () => {
    expect(parseQr('Ana|')).toEqual({ name: 'Ana', rut: '', email: '', extra: [] });
  });
});

describe('attendeeKey', () => {
  it('normaliza el rut con puntos, guión y espacios', () => {
    expect(attendeeKey('Ana|13.816.473-K|a@uct.cl')).toBe('13816473k');
    expect(attendeeKey('Otra| 13816473k |b@uct.cl')).toBe('13816473k');
    expect(attendeeKey('Ana|13 816 473-K')).toBe('13816473k');
  });

  it('sin rut usa el email en minúsculas', () => {
    expect(attendeeKey('Ana||A.Perez@UCT.cl')).toBe('a.perez@uct.cl');
  });

  it('sin rut ni email usa el raw recortado en minúsculas', () => {
    expect(attendeeKey('  Texto Libre ')).toBe('texto libre');
    expect(attendeeKey(' Ana|| ')).toBe('ana||');
  });
});
