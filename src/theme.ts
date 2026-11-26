// Explicit grounds keep contrast predictable on both light and dark terminals.
const dark = {background: '#101827', accent: '#8cacff', selection: '#3154ae', selectedText: '#ffffff', text: '#e8edf5', muted: '#a6b5cb', border: '#576b86', success: '#a6dba8', warning: '#f0cb82', error: '#ffabab'};
const light = {background: '#f5f7fb', accent: '#3154ae', selection: '#3154ae', selectedText: '#ffffff', text: '#172337', muted: '#40516a', border: '#64748b', success: '#296537', warning: '#77500e', error: '#a72131'};
export const color = {...dark};
export function setTheme(theme: 'dark' | 'light') { Object.assign(color, theme === 'light' ? light : dark); }
