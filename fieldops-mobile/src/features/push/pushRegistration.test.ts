import { describe, expect, it } from 'vitest';

import { pushRegistrationPrerequisiteError } from './pushRegistrationPolicy';

describe('push registration (PBI-0075.1)', () => {
  it('exige aparelho físico e um projeto Expo configurado', () => {
    expect(pushRegistrationPrerequisiteError({ platform: 'web', isPhysicalDevice: true, projectId: 'p' }))
      .toMatch(/aparelho físico/);
    expect(pushRegistrationPrerequisiteError({ platform: 'android', isPhysicalDevice: false, projectId: 'p' }))
      .toMatch(/aparelho físico/);
    expect(pushRegistrationPrerequisiteError({ platform: 'android', isPhysicalDevice: true })).toMatch(/projeto Expo/);
    expect(pushRegistrationPrerequisiteError({ platform: 'android', isPhysicalDevice: true, projectId: 'p' })).toBeNull();
  });
});
