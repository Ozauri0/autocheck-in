import { File, Paths } from 'expo-file-system';

/** Escribe en un temporal y luego reemplaza, para no dejar el archivo a medias. */
export async function writeAtomic(name: string, content: string, encoding: 'utf8' | 'base64') {
  const tmp = new File(Paths.document, `${name}.tmp`);
  if (!tmp.exists) tmp.create();
  await tmp.write(content, { encoding });
  await tmp.move(new File(Paths.document, name), { overwrite: true });
}

/** El archivo, o su temporal si la app se cerró en medio del reemplazo. */
export function existingFile(name: string): File | null {
  for (const candidate of [name, `${name}.tmp`]) {
    const file = new File(Paths.document, candidate);
    if (file.exists) return file;
  }
  return null;
}
