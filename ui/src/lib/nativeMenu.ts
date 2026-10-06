/**
 * The phone's own menu for a short list of choices (as pingmee-v2's `showNativeMenu`): iOS's
 * action sheet, Android's system dialog. Cancel is always last and runs nothing; a destructive
 * row is marked as such. Built into React Native, so it works on every build (no probe needed).
 *
 * Android's dialog holds at most three buttons, so a longer list is shown two at a time with
 * "More" (see `reasonPages`).
 */
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { reasonPages } from '@/lib/reports';

export interface MenuAction {
  text: string;
  run: () => void;
  destructive?: boolean;
}

export function showNativeMenu({
  title,
  message,
  actions,
}: {
  title?: string;
  message?: string;
  actions: MenuAction[];
}): void {
  if (actions.length === 0) return;
  if (Platform.OS === 'ios') {
    const destructive = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        ...(title ? { title } : {}),
        ...(message ? { message } : {}),
        options: [...actions.map((a) => a.text), 'Cancel'],
        ...(destructive >= 0 ? { destructiveButtonIndex: destructive } : {}),
        cancelButtonIndex: actions.length,
      },
      (i) => actions[i]?.run()
    );
    return;
  }
  const button = (a: MenuAction) => ({
    text: a.text,
    ...(a.destructive ? { style: 'destructive' as const } : {}),
    onPress: a.run,
  });
  if (actions.length <= 2) {
    Alert.alert(title ?? '', message, [
      ...actions.map(button),
      { text: 'Cancel', style: 'cancel' },
    ]);
    return;
  }
  const pages = reasonPages(actions, 2);
  const showPage = (n: number) => {
    const last = n === pages.length - 1;
    Alert.alert(
      title ?? '',
      message,
      [
        ...pages[n].map(button),
        last
          ? { text: 'Cancel', style: 'cancel' as const }
          : { text: 'More', onPress: () => showPage(n + 1) },
      ],
      { cancelable: true }
    );
  };
  showPage(0);
}
