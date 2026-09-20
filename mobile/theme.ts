export const colors = {
  background: '#F4F8FB',
  card: '#FFFFFF',
  cardBorder: '#DCE6EE',
  primary: '#2B6F9E',        // Glacier Blue
  primaryIce: '#DCEEF6',     // Ice Blue
  text: '#12263A',           // Dark Blue Text
  secondaryText: '#5B7083',  // Muted Slate Text
  accentOrange: '#F26B21',   // Accent Orange
  dangerRed: '#D64545',      // Danger Red (SOS and alerts only)
  okGreen: '#2E9E7A',        // Status OK Green
  warningAmber: '#E8A317',   // Warning Amber
  chipBackground: '#E8F2F8',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  default: 12,
  card: 12,
  button: 12,
  pill: 20,
  circle: 9999,
};

export const typography = {
  fontFamily: {
    regular: 'DMSans_400Regular',
    medium: 'DMSans_500Medium',
    bold: 'DMSans_700Bold',
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
  },
};

export const layout = {
  minButtonHeight: 48,
  topHeaderHeight: 64,
  bottomTabHeight: 68,
  sosButtonSize: 64,
};

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  layout,
};

export default theme;
