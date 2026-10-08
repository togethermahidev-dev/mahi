// Expo's push service, the headers every call to it sends. Used by send-push. Tests: push_test.ts.
//
// Secret (optional): EXPO_ACCESS_TOKEN. Once it is set and "Enhanced push security" is on for the
// project at expo.dev, Expo accepts pushes only with it, so a leaked device token alone can't be
// used to send Mahi notifications. Unset: the plain headers, as before.

export function expoHeaders(accessToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const token = accessToken?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
