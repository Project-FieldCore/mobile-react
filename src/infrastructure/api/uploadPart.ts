/**
 * Parte de FormData para upload de arquivo local (Expo SDK 58+).
 *
 * O `fetch` do Expo (`expo/fetch`) NÃO aceita o formato antigo do React Native
 * (`{ uri, name, type }`): lança "Unsupported FormDataPart implementation".
 * A forma suportada é anexar um `File` de `expo-file-system` (implementa Blob).
 */

/** Subconjunto de `File` (expo-file-system) usado no upload. */
export type UploadSource = {
  readonly type: string;
  bytes(): Promise<Uint8Array>;
};

export type UploadPart = UploadSource & { readonly name: string };

/**
 * Usa o próprio `File` quando o SO informa o mime type (o content-type segue o
 * arquivo). Se o tipo vier vazio, devolve uma parte equivalente com o tipo
 * esperado pela API (jpeg/png) para o multipart nunca sair sem content-type.
 */
export function toUploadPart(source: UploadSource, name: string, fallbackType: string): UploadSource | UploadPart {
  if (source.type) return source;
  return { name, type: fallbackType, bytes: () => source.bytes() };
}
