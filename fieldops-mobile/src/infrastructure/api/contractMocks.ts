/**
 * Cadastros derivados do mock canônico OpenAPI (api-java/openapi/mocks/fieldops-v1.json).
 * Usado quando `EXPO_PUBLIC_DATA_SOURCE=mock`. Inspeções Sprint-3 ficam em
 * `features/inspections/mockRepository.ts` (não são mocks de cadastro OpenAPI).
 */

import fieldopsV1 from '@/data/openapi/fieldops-v1.json';

export type ContractUserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type ContractActiveStatus = 'ACTIVE' | 'INACTIVE';
export type ContractEquipmentStatus = 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';

export type ContractUser = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'TECHNICIAN' | 'CLIENT_VIEWER';
  status: ContractUserStatus;
  phone?: string | null;
  version: number;
};

export type ContractClient = {
  id: string;
  name: string;
  status: ContractActiveStatus;
  version: number;
};

export type ContractSite = {
  id: string;
  clientId: string;
  name: string;
  city?: string | null;
  state?: string | null;
  status: ContractActiveStatus;
  version: number;
};

export type ContractEquipment = {
  id: string;
  siteId: string;
  name: string;
  assetNumber?: string | null;
  qrCode: string;
  status: ContractEquipmentStatus;
  version: number;
};

export type ContractMocksBundle = {
  users: ContractUser[];
  clients: ContractClient[];
  sites: ContractSite[];
  equipment: ContractEquipment[];
};

export const CONTRACT_MOCKS = fieldopsV1 as ContractMocksBundle;

export const CONTRACT_IDS = {
  user: CONTRACT_MOCKS.users[0]!.id,
  client: CONTRACT_MOCKS.clients[0]!.id,
  site: CONTRACT_MOCKS.sites[0]!.id,
  equipment: CONTRACT_MOCKS.equipment[0]!.id,
} as const;

export function listContractUsers(): ContractUser[] {
  return CONTRACT_MOCKS.users;
}

export function listContractClients(): ContractClient[] {
  return CONTRACT_MOCKS.clients;
}

export function listContractSites(clientId?: string): ContractSite[] {
  if (!clientId) return CONTRACT_MOCKS.sites;
  return CONTRACT_MOCKS.sites.filter((s) => s.clientId === clientId);
}

export function listContractEquipment(siteId?: string): ContractEquipment[] {
  if (!siteId) return CONTRACT_MOCKS.equipment;
  return CONTRACT_MOCKS.equipment.filter((e) => e.siteId === siteId);
}

export function findContractUserByEmail(email: string): ContractUser | undefined {
  const normalized = email.trim().toLowerCase();
  return CONTRACT_MOCKS.users.find((u) => u.email.toLowerCase() === normalized);
}
