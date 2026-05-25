// Brand palette: matches the CallCatch logo — safety yellow on near-black.
// `accentText` is the text colour you MUST use on top of `accent` (yellow) —
// white-on-yellow fails contrast badly. Default to black-on-yellow.
const Colors = {
  primary: '#121317',
  primaryLight: '#23252C',
  accent: '#FFC72C',
  accentLight: '#FFD659',
  accentText: '#0A0A0A',
  success: '#34C759',
  warning: '#FFB800',
  danger: '#FF3B30',
  background: '#F5F6FA',
  surface: '#FFFFFF',
  surfaceSecondary: '#EEF0F6',
  text: '#121317',
  textSecondary: '#5C6470',
  textTertiary: '#9BA5B3',
  border: '#E2E5EC',
  borderLight: '#F0F1F5',
  white: '#FFFFFF',
  black: '#000000',
  // Semantic soft tints — use these for badge / pill backgrounds so the colour
  // stays consistent across screens instead of one-off hex codes.
  accentSoft: '#FFF6D6',
  successSoft: '#E8F8ED',
  warningSoft: '#FFF8E0',
  dangerSoft: '#FFEEEE',
  infoSoft: '#E8EEF8',
  light: {
    text: '#121317',
    background: '#F5F6FA',
    tint: '#FFC72C',
    tabIconDefault: '#9BA5B3',
    tabIconSelected: '#FFC72C',
  },
};

export default Colors;
