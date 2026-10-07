/**
 * The Mahi home-screen widget and Live Activity (expo-widgets, build 13+). What they say comes
 * from src/lib/liveTag.ts; the wiring is src/hooks/useLiveTag.ts. Never import this file at the
 * top level: it loads native code that builds 10–12 lack — go through `loadLiveTagWidgets()`
 * (src/lib/widgetsModule.ts).
 *
 * The 'widget' functions are turned into text when the app is bundled and run later in the
 * widget's own JavaScript, inside iOS. So they can't use anything from this file or any import:
 * only @expo/ui's SwiftUI views and modifiers (named exactly as imported below), their props and
 * the environment. Colours and sizes arrive in `props.look` (from the tokens). Text is in Apple's
 * system font: the widget extension can't load Inter (expo-widgets has no way to add fonts to it).
 */
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  resizable,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import {
  createLiveActivity,
  createWidget,
  type LiveActivityEnvironment,
  type WidgetEnvironment,
} from 'expo-widgets';
import type { LiveTagView, TagView } from '@/lib/liveTag';

/** expo-widgets' shared folder (the App Group): where the app saves taggers' photos. */
export { widgetsDirectory } from 'expo-widgets';

/**
 * The home-screen widget, small and medium. A tag: who's waiting, the countdown (warning colour
 * from the 6-hour mark) and "Answer with any workout". No tag: waiting for a mate, with the points
 * and best. Signed out: nothing personal. A tap opens the camera (LIVE_TAG_URL in liveTag.ts).
 * Before Mahi has sent anything (a widget added before the app first opened) the props are empty:
 * it just says Mahi. (No comments inside a 'widget' function: its text is what runs.)
 */
function MahiTagWidget(props: LiveTagView, environment: WidgetEnvironment) {
  'widget';
  const look = props.look;
  const small = environment.widgetFamily === 'systemSmall';
  const root = [widgetURL('mahi://camera')];
  if (!look || !props.kind) {
    return (
      <VStack modifiers={root}>
        <Text modifiers={[font({ textStyle: 'headline', weight: 'semibold' })]}>Mahi</Text>
      </VStack>
    );
  }
  root.push(containerBackground(look.bg, 'widget'));
  const titleText = (
    <Text
      modifiers={[
        font({ textStyle: 'headline', weight: 'semibold' }),
        foregroundStyle(look.text),
        lineLimit(small ? 3 : 2),
      ]}
    >
      {props.title}
    </Text>
  );
  const quiet = (words: string | null | undefined) =>
    words ? (
      <Text
        modifiers={[
          font({ textStyle: 'caption' }),
          foregroundStyle(look.muted),
          lineLimit(small ? 1 : 2),
        ]}
      >
        {words}
      </Text>
    ) : null;

  if (props.kind === 'tag') {
    const colour = props.warning ? look.warning : look.accent;
    const face = props.photo ? (
      <Image
        uiImage={props.photo}
        modifiers={[
          resizable(),
          frame({ width: look.photo, height: look.photo }),
          clipShape('circle'),
        ]}
      />
    ) : null;
    const timer = { lower: new Date(props.start), upper: new Date(props.deadline) };
    const clock = (
      <Text
        timerInterval={timer}
        countsDown
        modifiers={[
          font({ textStyle: small ? 'title2' : 'title', weight: 'bold' }),
          monospacedDigit(),
          foregroundStyle(colour),
          multilineTextAlignment(small ? 'leading' : 'trailing'),
        ]}
      />
    );
    if (small) {
      return (
        <HStack modifiers={root}>
          <VStack alignment="leading" spacing={look.gap}>
            {face}
            {titleText}
            <Spacer />
            {clock}
            {quiet(props.more ?? props.line)}
          </VStack>
          <Spacer />
        </HStack>
      );
    }
    return (
      <HStack spacing={look.pad} modifiers={root}>
        {face}
        <VStack alignment="leading" spacing={look.gap}>
          {titleText}
          {quiet(props.line)}
          {quiet(props.more)}
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={look.gap}>
          {clock}
          {quiet(props.left)}
        </VStack>
      </HStack>
    );
  }

  if (props.kind === 'waiting') {
    const points = (
      <Text
        modifiers={[
          font({ textStyle: small ? 'title3' : 'title2', weight: 'bold' }),
          foregroundStyle(look.accent),
          lineLimit(1),
        ]}
      >
        {props.points}
      </Text>
    );
    if (small) {
      return (
        <HStack modifiers={root}>
          <VStack alignment="leading" spacing={look.gap}>
            {titleText}
            <Spacer />
            {points}
            {quiet(props.best)}
          </VStack>
          <Spacer />
        </HStack>
      );
    }
    return (
      <HStack spacing={look.pad} modifiers={root}>
        {titleText}
        <Spacer />
        <VStack alignment="trailing" spacing={look.gap}>
          {points}
          {quiet(props.best)}
        </VStack>
      </HStack>
    );
  }

  return (
    <HStack modifiers={root}>
      {titleText}
      <Spacer />
    </HStack>
  );
}

/**
 * The Live Activity: the lock screen and the Dynamic Island while a tag waits. The countdown is
 * Apple's own timer, so it ticks with Mahi closed. From the 6-hour mark it takes the warning
 * colour: the app sets it when it's open, and the activity goes stale at that mark (see
 * `liveActivityStaleAt`), which iOS redraws by itself. A tap opens the camera.
 */
function MahiTagActivity(props: TagView, environment: LiveActivityEnvironment) {
  'widget';
  const look = props.look;
  const colour = props.warning || environment.isStale ? look.warning : look.accent;
  const timer = { lower: new Date(props.start), upper: new Date(props.deadline) };
  const runner = <Image systemName="figure.run" color={colour} />;
  const face = (size: number) =>
    props.photo ? (
      <Image
        uiImage={props.photo}
        modifiers={[resizable(), frame({ width: size, height: size }), clipShape('circle')]}
      />
    ) : (
      runner
    );
  const icon = face(look.photoSmall);
  const clock = (big: boolean) => (
    <Text
      timerInterval={timer}
      countsDown
      modifiers={[
        font({ textStyle: big ? 'title2' : 'body', weight: big ? 'bold' : 'semibold' }),
        monospacedDigit(),
        foregroundStyle(colour),
        multilineTextAlignment('trailing'),
        ...(big ? [] : [frame({ width: look.timerWidth, alignment: 'trailing' })]),
      ]}
    />
  );
  const title = (
    <Text
      modifiers={[
        font({ textStyle: 'headline', weight: 'semibold' }),
        foregroundStyle(look.text),
        lineLimit(1),
      ]}
    >
      {props.title}
    </Text>
  );
  const line = (
    <HStack spacing={look.gap}>
      <Text
        modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(look.muted), lineLimit(1)]}
      >
        {props.line}
      </Text>
      {props.more ? (
        <Text
          modifiers={[
            font({ textStyle: 'subheadline', weight: 'semibold' }),
            foregroundStyle(colour),
            lineLimit(1),
          ]}
        >
          {props.more}
        </Text>
      ) : null}
    </HStack>
  );
  return {
    banner: (
      <HStack
        spacing={look.pad}
        modifiers={[padding({ all: look.pad }), activityBackgroundTint(look.bg)]}
      >
        {face(look.photo)}
        <VStack alignment="leading" spacing={look.gap}>
          {title}
          {line}
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={look.gap}>
          {clock(true)}
          <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(look.muted)]}>
            {props.left}
          </Text>
        </VStack>
      </HStack>
    ),
    compactLeading: icon,
    compactTrailing: clock(false),
    minimal: icon,
    expandedLeading: face(look.photo),
    expandedTrailing: clock(true),
    expandedCenter: title,
    expandedBottom: line,
  };
}

/** Names match the widget in app.config.js (`MahiTag`); a Live Activity isn't listed there. */
export const tagWidget = createWidget<LiveTagView>('MahiTag', MahiTagWidget);
export const tagActivity = createLiveActivity<TagView>('MahiTagActivity', MahiTagActivity);
