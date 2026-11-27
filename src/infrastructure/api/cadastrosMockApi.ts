import { dataSource } from '@/config/dataSource';
import {
  listContractClients,
  listContractEquipment,
  listContractSites,
  listContractUsers,
  type ContractClient,
  type ContractEquipment,
  type ContractSite,
  type ContractUser,
} from './contractMocks';
import { ApiError } from './client';

/**
 * Leitura de cadastros em modo mock a partir do JSON OpenAPI.
 * Em `dataSource=api` esta camada não substitui o HTTP real — chame a API.
 */
function assertMockMode(): void {
  if (dataSource !== 'mock') {
    throw new ApiError(
      'cadastrosMockApi só opera com EXPO_PUBLIC_DATA_SOURCE=mock.',
      500,
      'MOCK_ONLY',
      '/mock/cadastros',
    );
  }
}

export async function mockListUsers(): Promise<ContractUser[]> {
  assertMockMode();
  return listContractUsers();
}

export async function mockListClients(): Promise<ContractClient[]> {
  assertMockMode();
  return listContractClients();
}

export async function mockListSites(clientId?: string): Promise<ContractSite[]> {
  assertMockMode();
  return listContractSites(clientId);
}

export async function mockListEquipment(siteId?: string): Promise<ContractEquipment[]> {
  assertMockMode();
  return listContractEquipment(siteId);
}
