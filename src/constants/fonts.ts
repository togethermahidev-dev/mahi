/**
 * The app's one typeface, Inter. Every `fontFamily` reads from here; the faces are loaded in
 * App.tsx with useFonts. Add a weight here (and to useFonts) before using it.
 */
export const FONTS = {
  regular: 'Inter_400Regular',
  italic: 'Inter_400Regular_Italic',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;
