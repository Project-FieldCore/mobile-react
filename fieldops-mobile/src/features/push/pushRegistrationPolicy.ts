export function pushRegistrationPrerequisiteError(input: {
  platform: string;
  isPhysicalDevice: boolean;
  projectId?: string;
}): string | null {
  if (input.platform === 'web' || !input.isPhysicalDevice) {
    return 'Push remoto precisa ser ativado em um aparelho físico pelo development build.';
  }
  if (!input.projectId) return 'Identificador do projeto Expo não foi configurado.';
  return null;
}
