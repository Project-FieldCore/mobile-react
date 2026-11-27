export type DataSource = 'api' | 'mock';

// O app funciona com dados locais até a integração do backend estar pronta.
// Para chamar a API real, defina EXPO_PUBLIC_DATA_SOURCE=api no .env.
export const dataSource: DataSource =
  process.env.EXPO_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';
