export type BackendId = 'joog' | 'joom';
export const backendInfo = {
  joog: {name: 'Joog', provider: 'Google', secret: true},
  joom: {name: 'Joom', provider: 'Microsoft', secret: false},
} as const;
